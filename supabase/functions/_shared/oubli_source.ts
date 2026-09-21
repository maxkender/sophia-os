/**
 * « Oublier » un compte source : efface TOUT ce qu'il a produit, puis la ligne
 * `comptes_reference` elle-même, pour qu'un ré-import reparte de zéro.
 *
 * Pourquoi ce n'est pas un simple DELETE : les FK vers `comptes_reference` sont
 * volontairement en ON DELETE SET NULL (garde-fou 0157 — supprimer une source
 * ne doit jamais emporter les slideshows par accident). L'oubli fait donc le
 * chemin inverse, explicitement, et dans l'ordre : posts → storage → médias →
 * slideshows → sujets legacy → file d'import → compte.
 *
 * Ce qui bloque un ré-import « propre » et qu'il faut donc nécessairement purger :
 * `comptes_reference.handle_tiktok` (unique), `contenus.source_url` (unique —
 * sinon l'import rouvre l'ancien slideshow au lieu d'en créer un neuf),
 * `sujets.source_url` (unique) et `media_library.storage_path` (unique).
 */

import { type ReponseLot, lireTout } from "./lots.ts";
import {
  BUCKET_MEDIAS,
  type LigneJournalOubli,
  type NiveauJournalOubli,
  type OubliCompteurs,
  compteursVides,
  cumulerCompteurs,
  decouperEnLots,
  normaliserHandle,
  prefixeStorageScrape,
  prefixeStorageSujet,
  prefixesStorageContenu,
  resumeCompteurs,
  urlDuHandle,
} from "./oubli_source_cible.ts";
import { messageErreur, serviceClient } from "./supabase.ts";

export type Supabase = ReturnType<typeof serviceClient>;
export type { LigneJournalOubli, NiveauJournalOubli, OubliCompteurs };

/** Slideshows traités par invocation — l'Edge a ~150 s de mur. */
export const LOT_CONTENUS_DEFAUT = 15;
/** Bornes PostgREST (`in(...)`) et storage (`remove(...)`). */
const LOT_IDS = 100;

export interface OubliApercu {
  compteReferenceId: string;
  handle: string;
  contenus: number;
  medias: number;
  posts: number;
  sujets: number;
  importFile: number;
  /** Comptes de publication rattachés : ils perdront le lien vers cette source. */
  postersLies: number;
  /** Comptes conjoints : conservés, mais détachés du principal. */
  conjoints: number;
}

export interface OubliResultat {
  handle: string;
  termine: boolean;
  /** Slideshows encore à traiter après ce passage. */
  restant: number;
  supprimes: OubliCompteurs;
  /** Lignes à afficher dans l'admin — aussi poussées dans les logs Edge. */
  journal: LigneJournalOubli[];
}

type Journal = {
  lignes: LigneJournalOubli[];
  log: (niveau: NiveauJournalOubli, message: string) => void;
};

function creerJournal(): Journal {
  const lignes: LigneJournalOubli[] = [];
  return {
    lignes,
    log(niveau, message) {
      lignes.push({ at: new Date().toISOString(), niveau, message });
      const prefix = `[oubli] ${message}`;
      if (niveau === "error") console.error(prefix);
      else if (niveau === "warn") console.warn(prefix);
      else console.log(prefix);
    },
  };
}

function assertOk(error: unknown, quoi: string, log: Journal["log"]): void {
  if (!error) return;
  const msg = `${quoi} : ${messageErreur(error)}`;
  log("error", msg);
  throw new Error(msg);
}

/**
 * Même rôle qu'`assertOk` pour une lecture qui lève elle-même : le message part
 * au journal avant de remonter. Une lecture ratée qui ne laisse aucune trace
 * écrite est précisément ce qui a rendu l'incident du 20/08 indéchiffrable.
 */
async function journaliser<T>(log: Journal["log"], lecture: () => Promise<T>): Promise<T> {
  try {
    return await lecture();
  } catch (e) {
    log("error", messageErreur(e));
    throw e;
  }
}

async function handleDeLaSource(
  supabase: Supabase,
  compteReferenceId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("comptes_reference")
    .select("handle_tiktok")
    .eq("id", compteReferenceId)
    .maybeSingle();
  if (error) throw new Error(`Lecture du compte : ${messageErreur(error)}`);
  return data ? normaliserHandle(data.handle_tiktok as string) : null;
}

/* -------------------------------------------------------------------------
 * Les `.limit(5000)` de ce fichier étaient des troncatures déguisées en bornes.
 *
 * PostgREST plafonne toute réponse à `max-rows` (1000) QUELLE QUE SOIT la
 * valeur demandée : `.limit(5000)` ne rendait donc jamais plus de 1000 lignes,
 * tout en affirmant le contraire à la relecture. C'est la forme la plus
 * difficile à repérer, parce que le code dit explicitement qu'il a prévu le
 * cas. Sur une source de plus de 1000 slideshows, l'oubli en laissait
 * silencieusement derrière lui — des lignes `contenus` / `sujets` /
 * `media_library` orphelines qui bloquent ensuite le ré-import (les colonnes
 * `source_url` et `storage_path` sont UNIQUE) — et l'aperçu montré à l'admin
 * AVANT une suppression définitive sous-annonçait ce qui allait être détruit.
 * ---------------------------------------------------------------------- */

/**
 * Lecture complète d'une table filtrée, ancrée sur `id`.
 *
 * `id` est la clé primaire : unique sur tout le résultat et immuable, donc une
 * pagination keyset dessus ne peut ni sauter ni répéter une ligne, même si les
 * lignes sont réécrites pendant la lecture. L'ordre du résultat devient l'ordre
 * des `id` — sans effet ici, tous les appelants accumulent dans un `Set`.
 */
async function lireToutParId<T extends { id: string }>(
  quoi: string,
  page: (apres: string | null, taille: number) => PromiseLike<ReponseLot<T>>,
): Promise<T[]> {
  return await lireTout<T>(quoi, (curseur, taille) => page(curseur?.id ?? null, taille), {
    ancre: (ligne) => ligne.id,
  });
}

/**
 * Tous les slideshows de la source : ceux encore rattachés, PLUS ceux dont le
 * lien a déjà été cassé par une suppression classique et qu'on ne retrouve que
 * par l'URL. Le `ilike` n'est qu'un pré-filtre SQL — le tri exact se fait sur
 * le handle parsé, pour ne pas emporter les slideshows d'un compte homonyme.
 */
export async function idsContenusDeLaSource(
  supabase: Supabase,
  compteReferenceId: string,
  handle: string | null,
): Promise<string[]> {
  const ids = new Set<string>();

  const parLien = await lireToutParId<{ id: string }>("Slideshows liés", (apres, taille) => {
    let q = supabase.from("contenus").select("id").eq("compte_reference_id", compteReferenceId);
    if (apres) q = q.gt("id", apres);
    return q.order("id", { ascending: true }).limit(taille);
  });
  for (const c of parLien) ids.add(c.id);

  if (handle) {
    const parUrl = await lireToutParId<{ id: string; source_url: string | null }>(
      "Slideshows par URL",
      (apres, taille) => {
        let q = supabase
          .from("contenus")
          .select("id, source_url")
          .ilike("source_url", `%@${handle}%`);
        if (apres) q = q.gt("id", apres);
        return q.order("id", { ascending: true }).limit(taille);
      },
    );
    for (const c of parUrl) {
      if (urlDuHandle(c.source_url, handle)) ids.add(c.id);
    }
  }

  // Variations : des slideshows enfants pointent le parent sans porter la source.
  for (const lot of decouperEnLots([...ids], LOT_IDS)) {
    // Le lot borne l'URL, la pagination borne la réponse : un parent peut
    // porter plusieurs variations, donc 100 parents dépassent le plafond bien
    // avant que l'URL ne pose problème.
    const enfants = await lireToutParId<{ id: string }>("Variations", (apres, taille) => {
      let q = supabase.from("contenus").select("id").in("parent_id", lot);
      if (apres) q = q.gt("id", apres);
      return q.order("id", { ascending: true }).limit(taille);
    });
    for (const c of enfants) ids.add(c.id);
  }

  return [...ids];
}

async function idsSujetsDeLaSource(
  supabase: Supabase,
  compteReferenceId: string,
  handle: string | null,
): Promise<string[]> {
  const ids = new Set<string>();

  const parLien = await lireToutParId<{ id: string }>("Sujets liés", (apres, taille) => {
    let q = supabase.from("sujets").select("id").eq("compte_reference_id", compteReferenceId);
    if (apres) q = q.gt("id", apres);
    return q.order("id", { ascending: true }).limit(taille);
  });
  for (const s of parLien) ids.add(s.id);

  if (handle) {
    const parUrl = await lireToutParId<{ id: string; source_url: string | null }>(
      "Sujets par URL",
      (apres, taille) => {
        let q = supabase.from("sujets").select("id, source_url").ilike(
          "source_url",
          `%@${handle}%`,
        );
        if (apres) q = q.gt("id", apres);
        return q.order("id", { ascending: true }).limit(taille);
      },
    );
    for (const s of parUrl) {
      if (urlDuHandle(s.source_url, handle)) ids.add(s.id);
    }
  }

  return [...ids];
}

/** File d'import : lignes de la source + lignes orphelines portant son handle. */
async function idsFileImportDeLaSource(
  supabase: Supabase,
  compteReferenceId: string,
  handle: string | null,
): Promise<string[]> {
  const ids = new Set<string>();

  const parLien = await lireToutParId<{ id: string }>("File d'import liée", (apres, taille) => {
    let q = supabase.from("import_file").select("id").eq(
      "compte_reference_id",
      compteReferenceId,
    );
    if (apres) q = q.gt("id", apres);
    return q.order("id", { ascending: true }).limit(taille);
  });
  for (const f of parLien) ids.add(f.id);

  if (handle) {
    const parUrl = await lireToutParId<{ id: string; post_url: string | null }>(
      "File d'import par URL",
      (apres, taille) => {
        let q = supabase.from("import_file").select("id, post_url").ilike(
          "post_url",
          `%@${handle}%`,
        );
        if (apres) q = q.gt("id", apres);
        return q.order("id", { ascending: true }).limit(taille);
      },
    );
    for (const f of parUrl) {
      if (urlDuHandle(f.post_url, handle)) ids.add(f.id);
    }
  }

  return [...ids];
}

async function compter(
  supabase: Supabase,
  table: string,
  colonne: string,
  valeur: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(colonne, valeur);
  if (error) throw new Error(`Comptage ${table} : ${messageErreur(error)}`);
  return count ?? 0;
}

/** Ce que l'oubli va détruire — affiché à l'admin avant confirmation. */
export async function apercuOubli(
  supabase: Supabase,
  compteReferenceId: string,
): Promise<OubliApercu | null> {
  const handle = await handleDeLaSource(supabase, compteReferenceId);
  if (handle === null) return null;

  const contenuIds = await idsContenusDeLaSource(supabase, compteReferenceId, handle);
  const sujetIds = await idsSujetsDeLaSource(supabase, compteReferenceId, handle);

  // Ensembles, pas des compteurs : une image porte en général À LA FOIS
  // `contenu_id` et `compte_reference_id`, additionner les deux la compterait
  // deux fois et l'admin verrait un chiffre faux.
  const mediaIds = new Set<string>();
  const postIds = new Set<string>();
  for (const lot of decouperEnLots(contenuIds, LOT_IDS)) {
    // Un slideshow porte 8 à 20 images : un lot de 100 contenus ramène donc
    // 800 à 2000 lignes `media_library`. Le découpage du filtre n'y change
    // rien — c'est la réponse qu'il faut borner, et c'est ce compteur-là que
    // l'admin lit avant de valider une destruction irréversible.
    const medias = await lireToutParId<{ id: string }>("Aperçu médias", (apres, taille) => {
      let q = supabase.from("media_library").select("id").in("contenu_id", lot);
      if (apres) q = q.gt("id", apres);
      return q.order("id", { ascending: true }).limit(taille);
    });
    for (const m of medias) mediaIds.add(m.id);

    const passages = await lireToutParId<{ id: string; post_id: string | null }>(
      "Aperçu posts",
      (apres, taille) => {
        let q = supabase
          .from("passages")
          .select("id, post_id")
          .in("contenu_id", lot)
          .not("post_id", "is", null);
        if (apres) q = q.gt("id", apres);
        return q.order("id", { ascending: true }).limit(taille);
      },
    );
    for (const p of passages) if (p.post_id) postIds.add(p.post_id);
  }
  const mediasSource = await lireToutParId<{ id: string }>(
    "Aperçu médias source",
    (apres, taille) => {
      let q = supabase.from("media_library").select("id").eq(
        "compte_reference_id",
        compteReferenceId,
      );
      if (apres) q = q.gt("id", apres);
      return q.order("id", { ascending: true }).limit(taille);
    },
  );
  for (const m of mediasSource) mediaIds.add(m.id);

  const apercu: OubliApercu = {
    compteReferenceId,
    handle,
    contenus: contenuIds.length,
    medias: mediaIds.size,
    posts: postIds.size,
    sujets: sujetIds.length,
    importFile: (await idsFileImportDeLaSource(supabase, compteReferenceId, handle)).length,
    postersLies: await compter(supabase, "comptes", "compte_reference_id", compteReferenceId),
    conjoints: await compter(supabase, "comptes_reference", "parent_id", compteReferenceId),
  };
  console.log(
    `[oubli] aperçu @${handle} id=${compteReferenceId} ` +
      `${apercu.contenus} slideshows · ${apercu.medias} images · ${apercu.posts} posts · ` +
      `${apercu.sujets} sujets · ${apercu.importFile} file · ` +
      `${apercu.postersLies} posters · ${apercu.conjoints} conjoints`,
  );
  return apercu;
}

/** Retire des objets du bucket par paquets. Renvoie le nombre effacé. */
async function retirerFichiers(
  supabase: Supabase,
  chemins: string[],
  log: Journal["log"],
): Promise<number> {
  let n = 0;
  for (const lot of decouperEnLots([...new Set(chemins)], LOT_IDS)) {
    const { error } = await supabase.storage.from(BUCKET_MEDIAS).remove(lot);
    if (error) {
      log("warn", `storage.remove (${lot.length} chemins) : ${messageErreur(error)}`);
      continue;
    }
    n += lot.length;
  }
  return n;
}

/** Vide un dossier du bucket (fichiers orphelins compris). */
async function viderPrefixe(
  supabase: Supabase,
  prefixe: string,
  log: Journal["log"],
): Promise<number> {
  const { data, error } = await supabase.storage
    .from(BUCKET_MEDIAS)
    .list(prefixe, { limit: 500 });
  if (error) {
    log("warn", `storage.list ${prefixe} : ${messageErreur(error)}`);
    return 0;
  }
  if (!data) return 0;
  const chemins = data
    .filter((f) => f.id !== null)
    .map((f) => `${prefixe}/${f.name}`);
  if (chemins.length === 0) return 0;
  return await retirerFichiers(supabase, chemins, log);
}

/**
 * Supprime un paquet de slideshows et tout ce qui en dépend.
 * Même ordre que `supprimerContenu` côté admin : posts d'abord (ils référencent
 * les médias), storage ensuite, médias, puis le slideshow (qui emporte en
 * cascade labels, decks de langue et passages).
 *
 * TOUTES LES LECTURES D'ABORD, LES DESTRUCTIONS ENSUITE — c'est le seul
 * changement d'ordre par rapport à la version précédente, et il est délibéré.
 * L'inventaire des médias se faisait APRÈS la suppression des posts, alors
 * qu'il n'en dépend en rien (supprimer un post ne touche pas
 * `media_library.contenu_id`). Tronqué, il laissait des médias orphelins ;
 * depuis le garde-fou de complétude il LÈVE — et il levait au pire endroit
 * possible, les posts étant déjà détruits. Lire d'abord ne coûte rien et rend
 * l'échec inoffensif : on sort avant d'avoir cassé quoi que ce soit.
 *
 * L'ordre des DESTRUCTIONS, lui, est inchangé (posts → storage → médias →
 * slideshows) : il est contraint par les FK, pas par nous.
 *
 * Exportée pour `oubli_source_test.ts` : l'invariant « aucun DELETE tant qu'une
 * lecture n'a pas abouti » ne se teste pas depuis `oublierSource`, qui traîne
 * derrière lui le storage, les sujets legacy et la file d'import.
 */
export async function supprimerContenus(
  supabase: Supabase,
  compteReferenceId: string,
  contenuIds: string[],
  log: Journal["log"],
): Promise<Partial<OubliCompteurs>> {
  if (contenuIds.length === 0) return {};

  // A — INVENTAIRE. Le paquet vaut au plus `LOT_CONTENUS_DEFAUT` slideshows
  // (15, plafonné à 60 côté Edge Function), et le filtre porte sur la clé
  // primaire : la réponse ne peut pas être plus longue que le filtre.
  const { data: contenus, error: errContenus } = await supabase
    .from("contenus")
    .select("id, source_url, structure_slides")
    .in("id", contenuIds);
  assertOk(errContenus, "Lecture des slideshows à supprimer", log);

  // Posts matérialisés à détruire. Relation many-to-one : un slideshow accumule
  // un passage par assignation, donc 60 slideshows un peu anciens dépassent le
  // plafond PostgREST sans que le `in(...)` n'ait rien d'anormal. Tronquée,
  // cette lecture laissait des posts derrière elle, et leurs slides pointaient
  // vers des médias supprimés juste après.
  const postIds = new Set<string>();
  const passages = await lireToutParId<{ id: string; post_id: string | null }>(
    "Lecture des posts assignés",
    (apres, taille) => {
      let q = supabase
        .from("passages")
        .select("id, post_id")
        .in("contenu_id", contenuIds)
        .not("post_id", "is", null);
      if (apres) q = q.gt("id", apres);
      return q.order("id", { ascending: true }).limit(taille);
    },
  );
  for (const p of passages) if (p.post_id) postIds.add(p.post_id);

  // Médias cités par les slides ou rattachés au slideshow. Une slide ratée
  // peut avoir été remplacée par une image EMPRUNTÉE à la bibliothèque
  // (`mediaPropreMemeLabel`), qui appartient à un autre compte : on ne garde
  // que celles de cette source, les autres sont juste déliées.
  const candidats = new Set<string>();
  for (const c of contenus ?? []) {
    const slides = (c.structure_slides ?? []) as Array<{ media_id?: string | null }>;
    for (const s of slides) if (s.media_id) candidats.add(s.media_id);
  }
  // Même raisonnement chiffré qu'à l'aperçu (voir plus haut) : « un slideshow
  // porte 8 à 20 images », donc 60 slideshows ramènent 480 à 1200 lignes — la
  // lecture qui manquait au découpage. C'est elle qui décide ce qu'on efface du
  // bucket : amputée, elle laissait des fichiers orphelins qui bloquent ensuite
  // le ré-import (`media_library.storage_path` est unique).
  const mediasLies = await lireToutParId<{ id: string }>(
    "Lecture des images liées",
    (apres, taille) => {
      let q = supabase.from("media_library").select("id").in("contenu_id", contenuIds);
      if (apres) q = q.gt("id", apres);
      return q.order("id", { ascending: true }).limit(taille);
    },
  );
  for (const m of mediasLies) candidats.add(m.id);

  const aSupprimer = new Set(contenuIds);
  const mediaIds: string[] = [];
  const chemins: string[] = [];
  let empruntees = 0;
  for (const lot of decouperEnLots([...candidats], LOT_IDS)) {
    // Filtre sur la clé primaire : au plus `LOT_IDS` lignes par lot.
    const { data: medias, error } = await supabase
      .from("media_library")
      .select("id, storage_path, contenu_id, compte_reference_id")
      .in("id", lot);
    assertOk(error, "Lecture des images candidates", log);
    for (const m of medias ?? []) {
      const aNous =
        (m.contenu_id && aSupprimer.has(m.contenu_id as string)) ||
        m.compte_reference_id === compteReferenceId;
      if (!aNous) {
        empruntees += 1;
        continue;
      }
      mediaIds.push(m.id as string);
      if (m.storage_path) chemins.push(m.storage_path as string);
    }
  }

  // B — DESTRUCTION. À partir d'ici, plus rien n'est réversible.

  // 1 — Posts matérialisés (cascade : post_slides, métriques, tokens mobiles).
  for (const lot of decouperEnLots([...postIds], LOT_IDS)) {
    const { error } = await supabase.from("posts").delete().in("id", lot);
    assertOk(error, `Suppression de ${lot.length} post(s)`, log);
  }
  if (postIds.size > 0) log("ok", `${postIds.size} post(s) assigné(s) supprimé(s)`);
  else log("info", "Aucun post assigné sur ce lot");

  // 2 — Fichiers du bucket, puis les lignes `media_library` correspondantes.
  let fichiers = await retirerFichiers(supabase, chemins, log);

  // 3 — Balayage des dossiers : un upload sans ligne en base bloquerait le
  // ré-import (storage_path unique).
  for (const c of contenus ?? []) {
    for (const prefixe of prefixesStorageContenu(c.id as string)) {
      fichiers += await viderPrefixe(supabase, prefixe, log);
    }
    const scrape = prefixeStorageScrape(c.source_url as string | null);
    if (scrape) fichiers += await viderPrefixe(supabase, scrape, log);
  }
  log("ok", `${fichiers} fichier(s) retiré(s) du bucket`);
  if (empruntees > 0) {
    log("info", `${empruntees} image(s) empruntée(s) conservée(s) (autre compte)`);
  }

  for (const lot of decouperEnLots(mediaIds, LOT_IDS)) {
    const { error } = await supabase.from("media_library").delete().in("id", lot);
    assertOk(error, `Suppression de ${lot.length} image(s)`, log);
  }
  if (mediaIds.length > 0) log("ok", `${mediaIds.length} image(s) supprimée(s)`);

  // 4 — Slideshows (cascade : contenu_labels, contenu_langues, passages).
  for (const lot of decouperEnLots(contenuIds, LOT_IDS)) {
    const { error } = await supabase.from("contenus").delete().in("id", lot);
    assertOk(error, `Suppression de ${lot.length} slideshow(s)`, log);
  }
  log("ok", `${contenuIds.length} slideshow(s) supprimé(s)`);

  return {
    contenus: contenuIds.length,
    medias: mediaIds.length,
    fichiers,
    posts: postIds.size,
  };
}

/** Sujets legacy + leurs visuels (chemin `propre/{sujetId}/`). */
async function supprimerSujets(
  supabase: Supabase,
  sujetIds: string[],
  log: Journal["log"],
): Promise<Partial<OubliCompteurs>> {
  if (sujetIds.length === 0) {
    log("info", "Aucun sujet legacy");
    return {};
  }
  let fichiers = 0;
  for (const id of sujetIds) {
    fichiers += await viderPrefixe(supabase, prefixeStorageSujet(id), log);
  }
  for (const lot of decouperEnLots(sujetIds, LOT_IDS)) {
    const { error } = await supabase.from("sujets").delete().in("id", lot);
    assertOk(error, `Suppression de ${lot.length} sujet(s)`, log);
  }
  log("ok", `${sujetIds.length} sujet(s) legacy supprimé(s) · ${fichiers} fichier(s)`);
  return { sujets: sujetIds.length, fichiers };
}

async function supprimerFileImport(
  supabase: Supabase,
  compteReferenceId: string,
  handle: string | null,
  log: Journal["log"],
): Promise<number> {
  const ids = await idsFileImportDeLaSource(supabase, compteReferenceId, handle);
  if (ids.length === 0) {
    log("info", "File d'import déjà vide");
    return 0;
  }
  for (const lot of decouperEnLots(ids, LOT_IDS)) {
    const { error } = await supabase.from("import_file").delete().in("id", lot);
    assertOk(error, `Suppression de ${lot.length} ligne(s) de file`, log);
  }
  log("ok", `${ids.length} ligne(s) de file d'import supprimée(s)`);
  return ids.length;
}

/** Médias restants directement rattachés à la source (avatar de référence…). */
async function supprimerMediasDeLaSource(
  supabase: Supabase,
  compteReferenceId: string,
  log: Journal["log"],
): Promise<Partial<OubliCompteurs>> {
  // Lecture paginée : c'est une lecture qui PRÉCÈDE une suppression. Tronquée,
  // elle laissait des images derrière elle — et `media_library.storage_path`
  // étant UNIQUE, ces restes bloquent le ré-import qu'un oubli est censé
  // rendre possible.
  // `assertOk` écrivait l'échec au journal AVANT de lever : on garde ce
  // comportement, le journal d'oubli est ce que l'admin relit après coup.
  const medias = await journaliser(log, () =>
    lireToutParId<{ id: string; storage_path: string | null }>(
      "Lecture des images restantes de la source",
      (apres, taille) => {
        let q = supabase.from("media_library").select("id, storage_path").eq(
          "compte_reference_id",
          compteReferenceId,
        );
        if (apres) q = q.gt("id", apres);
        return q.order("id", { ascending: true }).limit(taille);
      },
    ));
  const ids = medias.map((m) => m.id);
  if (ids.length === 0) {
    log("info", "Aucune image restante rattachée à la source");
    return {};
  }

  const chemins = medias
    .map((m) => m.storage_path)
    .filter((p): p is string => Boolean(p));
  const fichiers = await retirerFichiers(supabase, chemins, log);
  for (const lot of decouperEnLots(ids, LOT_IDS)) {
    const { error } = await supabase.from("media_library").delete().in("id", lot);
    assertOk(error, `Suppression de ${lot.length} image(s) source`, log);
  }
  log("ok", `${ids.length} image(s) restante(s) de la source · ${fichiers} fichier(s)`);
  return { medias: ids.length, fichiers };
}

/**
 * Un passage d'oubli. Traite au plus `lot` slideshows puis rend la main, pour
 * tenir sous le mur Edge ; l'appelant rappelle tant que `termine` est faux.
 * Idempotent : rejouer un passage déjà fait ne casse rien.
 */
export async function oublierSourceLot(
  supabase: Supabase,
  compteReferenceId: string,
  lot = LOT_CONTENUS_DEFAUT,
): Promise<OubliResultat> {
  const journal = creerJournal();
  const { log } = journal;
  const handle = await handleDeLaSource(supabase, compteReferenceId);
  let supprimes = compteursVides();

  if (handle === null) {
    log(
      "warn",
      `Compte ${compteReferenceId} déjà absent de la liste — on solde les orphelins encore liés à cet id`,
    );
  } else {
    log("info", `Oubli de @${handle} (${compteReferenceId})`);
  }

  const contenuIds = await idsContenusDeLaSource(supabase, compteReferenceId, handle);
  log("info", `${contenuIds.length} slideshow(s) encore à traiter`);

  if (contenuIds.length > 0) {
    const paquet = contenuIds.slice(0, Math.max(1, lot));
    log(
      "info",
      `Passe : ${paquet.length} slideshow(s) sur ${contenuIds.length} (lot=${lot})`,
    );
    supprimes = cumulerCompteurs(
      supprimes,
      await supprimerContenus(supabase, compteReferenceId, paquet, log),
    );
    const restant = contenuIds.length - paquet.length;
    if (restant > 0) {
      log(
        "info",
        `Passe intermédiaire — ${resumeCompteurs(supprimes)} · encore ${restant} slideshow(s)`,
      );
      return { handle: handle ?? "", termine: false, restant, supprimes, journal: journal.lignes };
    }
  }

  // Plus aucun slideshow : on solde le reste et on retire le compte de la liste.
  log("info", "Plus de slideshow — solde des sujets, de la file et du compte");
  supprimes = cumulerCompteurs(
    supprimes,
    await supprimerSujets(
      supabase,
      await idsSujetsDeLaSource(supabase, compteReferenceId, handle),
      log,
    ),
  );
  supprimes = cumulerCompteurs(supprimes, {
    importFile: await supprimerFileImport(supabase, compteReferenceId, handle, log),
  });
  supprimes = cumulerCompteurs(
    supprimes,
    await supprimerMediasDeLaSource(supabase, compteReferenceId, log),
  );

  const { error: errExtractions } = await supabase
    .from("extractions")
    .delete()
    .eq("compte_reference_id", compteReferenceId);
  assertOk(errExtractions, "Suppression des extractions", log);
  log("ok", "Extractions de la source supprimées");

  // Les conjoints survivent : `parent_id` passe à NULL, ils redeviennent
  // autonomes plutôt que d'être emportés sans que l'admin l'ait demandé.
  const { error: errCompte } = await supabase
    .from("comptes_reference")
    .delete()
    .eq("id", compteReferenceId);
  assertOk(errCompte, "Suppression du compte source", log);
  log(
    "ok",
    handle
      ? `@${handle} retiré de la liste — total ${resumeCompteurs(supprimes)}`
      : `Id ${compteReferenceId} soldé — total ${resumeCompteurs(supprimes)}`,
  );

  return { handle: handle ?? "", termine: true, restant: 0, supprimes, journal: journal.lignes };
}
