/**
 * Test à blanc — le calque « lecture après écriture ».
 *
 * Pendant un test à blanc, aucune écriture ne part : l'intercepteur
 * (a_blanc_intercepteur.ts) les garde ici, en mémoire, le temps du test. Le
 * code de la nuit relit pourtant souvent ce qu'il vient « d'écrire » — le deck
 * placé (relecture finale de `assurerDeckPourLangue`), le passage inséré, le
 * contenu repêché. Sans calque, il lirait la base d'avant et la simulation
 * divergerait de la nuit. Le calque superpose donc ses lignes aux lectures
 * suivantes DU MÊME TEST, et à elles seules.
 *
 * Trois états par table :
 *  - `inserees` : lignes fabriquées par le test (défauts de colonne + corps) ;
 *  - `patchs`   : colonnes modifiées de lignes RÉELLES, par clé primaire ;
 *  - `supprimees` : clés de lignes réelles supprimées.
 *
 * La logique est pure ; les lectures réelles sont injectées (`Lecteur`), ce qui
 * rend le calque testable sans réseau.
 *
 * LIMITES (dites aussi dans le résultat du test et dans docs/assignation-a-blanc.md) :
 *  - comparaisons faites ici en JavaScript (nombres, dates ISO, texte) : elles
 *    ne servent que pour les lignes que le test a fabriquées ou modifiées ; une
 *    ligne réelle intacte garde le verdict et l'ordre de PostgreSQL ;
 *  - contraintes uniques, clés étrangères et déclencheurs NON simulés (vérifié
 *    en prod : les déclencheurs de ces tables n'agissent que sur un statut
 *    publié ou pour le rôle authenticated) ;
 *  - une lecture non simple (embed, `or=`, count, HEAD) d'une table écrite est
 *    transmise SANS superposition, hormis le retrait des lignes supprimées
 *    quand leur clé figure dans la réponse ;
 *  - les VUES (contenu_tier_etat, contenu_application_tier_etat) ne sont pas
 *    recalculées après une écriture simulée sur leurs tables sources ;
 *  - `limit` est appliqué après fusion (la lecture réelle est élargie d'autant
 *    de lignes que le test en a modifié ou supprimé).
 */

import {
  type Filtre,
  ligneCorrespond,
  type Ligne,
  projeter,
  type RequetePostgrest,
  trierEtCouper,
} from "./a_blanc_postgrest.ts";
import { ID_SOPHIA } from "./multi_app.ts";

/**
 * Clés primaires qui ne sont pas `id` (relevées en prod dans
 * information_schema, le 2026-10-09). Toutes les autres tables écrites par
 * l'assignation ont `id uuid default gen_random_uuid()`.
 */
export const CLES_PRIMAIRES: Readonly<Record<string, readonly string[]>> = {
  assignation_journal: ["compte_id", "jour"],
  contenu_tiers_application: ["contenu_id", "application_id"],
  reglages: ["cle"],
};

export function clePrimaire(table: string): readonly string[] {
  return CLES_PRIMAIRES[table] ?? ["id"];
}

/**
 * Défauts de colonne des tables écrites par l'assignation (relevés en prod).
 * `application_id_sophia()` est une FONCTION en base : sa valeur, l'id de
 * Sophia, est posée ici en dur. `now()` et `gen_random_uuid()` sont rendus à
 * l'insertion (voir HORODATAGES et `inserer`).
 */
export const DEFAUTS_INSERTION: Readonly<Record<string, Readonly<Ligne>>> = {
  passages: {
    statut: "brouillon",
    slides: [],
    tier_cycle: 0,
    est_rappel: false,
    rappel_rang: 0,
    resolution_tentatives: 0,
    post_id: null,
    application_id: ID_SOPHIA,
    application_visee_id: null,
    repli_motif: null,
  },
  posts: {
    type: "nouveau",
    statut: "brouillon",
    pipeline_statut: "pending",
    pipeline_tentatives: 0,
    est_test: false,
    recharges_createur: 0,
    application_id: ID_SOPHIA,
  },
  post_slides: { position_sophia: false },
  contenu_langues: { slides: [], score: 50, nb_passages: 0, slides_base: null, hashtags: null },
  contenu_langue_decks: { slides: [] },
  media_library: {
    source: "nettoye_reference",
    tags: [],
    used_count: 0,
    texte_restant: false,
    ugc_face_regen: false,
    est_hook: false,
    application_id: ID_SOPHIA,
  },
  contenu_tiers_application: { tier: "D", passages_prevus: 0, tier_cycle: 0 },
  assignation_journal: { crees: 0 },
};

/** Colonnes `default now()` par table. */
const HORODATAGES: Readonly<Record<string, readonly string[]>> = {
  passages: ["created_at"],
  posts: ["created_at"],
  contenu_langues: ["created_at"],
  contenu_langue_decks: ["created_at", "updated_at"],
  media_library: ["created_at"],
  contenu_tiers_application: ["created_at", "updated_at"],
  assignation_journal: ["maj_at"],
};

/** Une lecture réelle : la réponse, et ses lignes si elle a réussi. */
export type Lecteur = (url: URL) => Promise<{ reponse: Response; lignes: Ligne[] | null }>;

interface Patch {
  /** Valeurs de la clé primaire de la ligne réelle. */
  pk: Ligne;
  colonnes: Ligne;
}

export class Calque {
  private readonly inserees = new Map<string, Map<string, Ligne>>();
  private readonly patchs = new Map<string, Map<string, Patch>>();
  private readonly supprimees = new Map<string, Set<string>>();

  /** Le test a-t-il écrit dans cette table ? */
  touche(table: string): boolean {
    return (this.inserees.get(table)?.size ?? 0) > 0 ||
      (this.patchs.get(table)?.size ?? 0) > 0 ||
      (this.supprimees.get(table)?.size ?? 0) > 0;
  }

  /** Clé d'une ligne (JSON des colonnes de clé) ; null si l'une manque. */
  cle(table: string, ligne: Ligne): string | null {
    const valeurs: string[] = [];
    for (const c of clePrimaire(table)) {
      const v = ligne[c];
      if (v === null || v === undefined) return null;
      valeurs.push(String(v));
    }
    return JSON.stringify(valeurs);
  }

  /** Nombre de lignes réelles modifiées ou supprimées (marge des lectures bornées). */
  nbModifications(table: string): number {
    return (this.patchs.get(table)?.size ?? 0) + (this.supprimees.get(table)?.size ?? 0);
  }

  /** Lignes insérées par le test, dans l'ordre d'insertion (copies). */
  lignesInserees(table: string): Ligne[] {
    return [...(this.inserees.get(table)?.values() ?? [])].map((l) => structuredClone(l));
  }

  /** Ligne insérée de clé `id` (copie), ou null. */
  inseree(table: string, id: string): Ligne | null {
    const l = this.inserees.get(table)?.get(JSON.stringify([String(id)]));
    return l ? structuredClone(l) : null;
  }

  estInseree(table: string, ligne: Ligne): boolean {
    const k = this.cle(table, ligne);
    return k !== null && Boolean(this.inserees.get(table)?.has(k));
  }

  /**
   * Fabrique les lignes d'un INSERT : défauts de la table, horodatages, `id`
   * généré, puis le corps. Avec `colonnes` (paramètre `columns` d'un insert en
   * tableau), une colonne listée mais absente d'une ligne vaut NULL — comme
   * PostgREST, sauf `Prefer: missing=default`.
   */
  inserer(
    table: string,
    corps: readonly Ligne[],
    opts: { colonnes?: readonly string[] | null; manquantsParDefaut?: boolean } = {},
  ): Ligne[] {
    const maintenant = new Date().toISOString();
    const pk = clePrimaire(table);
    const sortie: Ligne[] = [];
    for (const brut of corps) {
      const ligne: Ligne = structuredClone(DEFAUTS_INSERTION[table] ?? {}) as Ligne;
      for (const c of HORODATAGES[table] ?? []) ligne[c] = maintenant;
      if (pk.length === 1 && pk[0] === "id") ligne.id = crypto.randomUUID();
      if (opts.colonnes && !opts.manquantsParDefaut) {
        for (const c of opts.colonnes) if (!(c in brut)) ligne[c] = null;
      }
      Object.assign(ligne, structuredClone(brut));
      const k = this.cle(table, ligne);
      // Sans clé (colonne de clé absente du corps) : PostgREST refuserait ;
      // on garde la ligne sous une clé unique pour ne rien perdre au journal.
      const cle = k ?? JSON.stringify([`sans-cle-${crypto.randomUUID()}`]);
      if (!this.inserees.has(table)) this.inserees.set(table, new Map());
      this.inserees.get(table)!.set(cle, ligne);
      sortie.push(structuredClone(ligne));
    }
    return sortie;
  }

  /** Applique un patch à une ligne vue par le test ; rend la ligne après patch. */
  patcher(table: string, ligne: Ligne, patch: Ligne): Ligne {
    const k = this.cle(table, ligne);
    const apres = { ...structuredClone(ligne), ...structuredClone(patch) };
    if (k === null) return apres;
    const inseree = this.inserees.get(table)?.get(k);
    if (inseree) {
      Object.assign(inseree, structuredClone(patch));
      return structuredClone(inseree);
    }
    if (!this.patchs.has(table)) this.patchs.set(table, new Map());
    const existant = this.patchs.get(table)!.get(k);
    const pk: Ligne = {};
    for (const c of clePrimaire(table)) pk[c] = ligne[c];
    this.patchs.get(table)!.set(k, {
      pk,
      colonnes: { ...(existant?.colonnes ?? {}), ...structuredClone(patch) },
    });
    return apres;
  }

  /** Supprime une ligne vue par le test. */
  supprimer(table: string, ligne: Ligne): void {
    const k = this.cle(table, ligne);
    if (k === null) return;
    if (this.inserees.get(table)?.delete(k)) return;
    this.patchs.get(table)?.delete(k);
    if (!this.supprimees.has(table)) this.supprimees.set(table, new Set());
    this.supprimees.get(table)!.add(k);
  }

  /** La ligne réelle de cette clé a-t-elle été supprimée par le test ? */
  estSupprimee(table: string, ligne: Ligne): boolean {
    const k = this.cle(table, ligne);
    return k !== null && Boolean(this.supprimees.get(table)?.has(k));
  }

  /**
   * Reporte sur une ligne réelle les colonnes que le test a modifiées, pour
   * les seules colonnes PRÉSENTES dans la ligne (lecture non superposée :
   * embeds, alias… ne sont pas touchés).
   */
  reporterPatch(table: string, ligne: Ligne): Ligne {
    const k = this.cle(table, ligne);
    const patch = k === null ? undefined : this.patchs.get(table)?.get(k);
    if (!patch) return ligne;
    const sortie = { ...ligne };
    for (const [c, v] of Object.entries(patch.colonnes)) {
      if (c in sortie) sortie[c] = structuredClone(v);
    }
    return sortie;
  }

  /** Lignes réelles modifiées qui ne figurent pas dans `reelles` : leurs clés primaires. */
  patchsHorsResultat(table: string, reelles: readonly Ligne[]): Ligne[] {
    const patchs = this.patchs.get(table);
    if (!patchs || patchs.size === 0) return [];
    const vues = new Set(reelles.map((r) => this.cle(table, r)));
    return [...patchs.entries()].filter(([k]) => !vues.has(k)).map(([, p]) => ({ ...p.pk }));
  }

  /**
   * Superpose le test à des lignes réelles déjà filtrées par PostgreSQL :
   *  - lignes supprimées retirées ;
   *  - patchs appliqués, et SEULES les lignes patchées réévaluées (une ligne
   *    réelle intacte garde le verdict de PostgreSQL) ;
   *  - `supplementaires` : lignes réelles patchées relues hors filtre, gardées
   *    si leur version patchée passe les filtres ;
   *  - lignes insérées qui passent les filtres, ajoutées.
   * `modifie` dit si le calque a changé quoi que ce soit au résultat réel.
   */
  superposer(
    table: string,
    reelles: readonly Ligne[],
    filtres: readonly Filtre[],
    supplementaires: readonly Ligne[] = [],
    opts: { reevaluer?: boolean; inserees?: boolean } = {},
  ): { lignes: Ligne[]; modifie: boolean } {
    const reevaluer = opts.reevaluer !== false;
    const avecInserees = opts.inserees !== false;
    const supprimees = this.supprimees.get(table);
    const patchs = this.patchs.get(table);
    const inserees = this.inserees.get(table);
    const sortie: Ligne[] = [];
    const vues = new Set<string>();
    let modifie = false;
    const traiter = (r: Ligne, horsFiltre: boolean) => {
      const k = this.cle(table, r);
      if (k !== null) {
        if (vues.has(k)) return;
        vues.add(k);
        if (supprimees?.has(k) || inserees?.has(k)) {
          modifie = true;
          return;
        }
        const patch = patchs?.get(k);
        if (patch) {
          modifie = true;
          const l = { ...r, ...structuredClone(patch.colonnes) };
          if (!reevaluer || ligneCorrespond(l, filtres)) sortie.push(l);
          return;
        }
      }
      if (horsFiltre) return; // relue hors filtre mais pas patchée : pas pour nous
      sortie.push({ ...r });
    };
    for (const r of reelles) traiter(r, false);
    for (const r of supplementaires) traiter(r, true);
    for (const [k, l] of avecInserees ? inserees ?? [] : []) {
      if (vues.has(k)) continue;
      if (!reevaluer || ligneCorrespond(l, filtres)) {
        modifie = true;
        sortie.push(structuredClone(l));
      }
    }
    return { lignes: sortie, modifie };
  }
}

const TAILLE_RELECTURE = 100;

function guillemets(v: unknown): string {
  return `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function urlDeBase(url: URL): URL {
  return new URL(`${url.origin}${url.pathname}`);
}

/**
 * Relit les lignes réelles patchées par le test qui manquent au résultat
 * (patch qui les fait ENTRER dans le filtre) : `col=in.(…)` sur chaque colonne
 * de clé, puis filtrage exact sur la clé.
 */
async function relirePatchees(
  calque: Calque,
  url: URL,
  table: string,
  reelles: readonly Ligne[],
  lecteur: Lecteur,
): Promise<{ lignes: Ligne[] } | { reponse: Response }> {
  const manquantes = calque.patchsHorsResultat(table, reelles);
  if (manquantes.length === 0) return { lignes: [] };
  const voulues = new Set(manquantes.map((pk) => calque.cle(table, pk)));
  const pk = clePrimaire(table);
  const lignes: Ligne[] = [];
  for (let i = 0; i < manquantes.length; i += TAILLE_RELECTURE) {
    const lot = manquantes.slice(i, i + TAILLE_RELECTURE);
    const u = urlDeBase(url);
    u.searchParams.set("select", "*");
    for (const c of pk) {
      const valeurs = [...new Set(lot.map((l) => String(l[c])))];
      u.searchParams.set(c, `in.(${valeurs.map(guillemets).join(",")})`);
    }
    const r = await lecteur(u);
    if (!r.lignes) return { reponse: r.reponse };
    lignes.push(...r.lignes.filter((l) => voulues.has(calque.cle(table, l))));
  }
  return { lignes };
}

/**
 * Lecture SIMPLE d'une table écrite par le test : lecture réelle (`select=*`,
 * mêmes filtres et ordre, limite élargie), superposition, tri et coupe, puis
 * projection sur le select d'origine. Une erreur réelle est rendue telle quelle.
 */
export async function lireSuperpose(
  calque: Calque,
  url: URL,
  requete: RequetePostgrest,
  lecteur: Lecteur,
): Promise<{ lignes: Ligne[] } | { reponse: Response }> {
  const table = requete.table;
  const reelle = new URL(url.toString());
  reelle.searchParams.set("select", "*");
  const borne = requete.limite !== null || requete.offset !== null;
  if (borne) {
    reelle.searchParams.delete("offset");
    reelle.searchParams.delete("limit");
    if (requete.limite !== null) {
      // Assez de lignes pour couper APRÈS fusion : celles que le test a
      // retirées ou fait sortir du filtre ne doivent pas laisser de trou.
      const n = (requete.offset ?? 0) + requete.limite + calque.nbModifications(table);
      reelle.searchParams.set("limit", String(n));
    }
  }
  const r = await lecteur(reelle);
  if (!r.lignes) return { reponse: r.reponse };
  const sup = await relirePatchees(calque, url, table, r.lignes, lecteur);
  if ("reponse" in sup) return sup;
  const { lignes, modifie } = calque.superposer(table, r.lignes, requete.filtres, sup.lignes);
  // Rien de changé : l'ordre de PostgreSQL fait foi, on ne fait que couper.
  const ordonnees = trierEtCouper(lignes, modifie ? requete.ordre : [], requete.limite, requete.offset);
  return { lignes: ordonnees.map((l) => projeter(l, requete.select)) };
}

/**
 * Lignes visées par un UPDATE / DELETE simulé, vues à travers le calque.
 *  - sans filtre : `null` (non résolu — le nombre de lignes reste inconnu) ;
 *  - filtres évaluables : lecture réelle des mêmes filtres + superposition ;
 *  - filtres non évaluables : lecture réelle des mêmes filtres, patchs et
 *    suppressions appliqués SANS réévaluation (`superposee: false`).
 */
export async function lignesCiblees(
  calque: Calque,
  url: URL,
  requete: RequetePostgrest,
  lecteur: Lecteur,
): Promise<{ lignes: Ligne[]; superposee: boolean } | { reponse: Response } | null> {
  const avecFiltre = [...url.searchParams.keys()].some(
    (k) => !["select", "order", "limit", "offset", "columns", "on_conflict"].includes(k),
  );
  if (!avecFiltre) return null;
  const reelle = new URL(url.toString());
  reelle.searchParams.set("select", "*");
  for (const k of ["order", "limit", "offset", "columns", "on_conflict"]) reelle.searchParams.delete(k);
  const r = await lecteur(reelle);
  if (!r.lignes) return { reponse: r.reponse };
  if (!requete.filtresEvaluables) {
    // Sans réévaluation possible, une ligne fabriquée ne peut pas être jugée :
    // seules les lignes réelles (patchées, moins les supprimées) sont visées.
    const { lignes } = calque.superposer(requete.table, r.lignes, [], [], {
      reevaluer: false,
      inserees: false,
    });
    return { lignes, superposee: false };
  }
  const sup = await relirePatchees(calque, url, requete.table, r.lignes, lecteur);
  if ("reponse" in sup) return sup;
  const { lignes } = calque.superposer(requete.table, r.lignes, requete.filtres, sup.lignes);
  return { lignes, superposee: true };
}

/**
 * Ligne existante pour un UPSERT : même valeur sur chaque colonne de conflit,
 * vue à travers le calque. Une colonne de conflit nulle ne heurte jamais rien
 * (NULL n'est égal à rien en SQL) : insertion.
 */
export async function ligneEnConflit(
  calque: Calque,
  url: URL,
  table: string,
  colonnesConflit: readonly string[],
  valeurs: Ligne,
  lecteur: Lecteur,
): Promise<{ ligne: Ligne | null } | { reponse: Response }> {
  const filtres: Filtre[] = [];
  for (const c of colonnesConflit) {
    const v = valeurs[c];
    if (v === null || v === undefined) return { ligne: null };
    filtres.push({ colonne: c, op: "eq", negation: false, valeur: String(v) });
  }
  const u = urlDeBase(url);
  u.searchParams.set("select", "*");
  for (const f of filtres) u.searchParams.set(f.colonne, `eq.${f.valeur}`);
  const r = await lecteur(u);
  if (!r.lignes) return { reponse: r.reponse };
  const { lignes } = calque.superposer(table, r.lignes, filtres);
  return { ligne: lignes[0] ?? null };
}
