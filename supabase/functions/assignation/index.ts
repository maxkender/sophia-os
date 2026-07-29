import { creerPost as creerCoquille } from "../_shared/composer.ts";
import { assertAuthorised, aujourdhuiParis, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;
type TypePost = "recycle" | "remanie" | "nouveau";

/**
 * Assignation quotidienne (cron de minuit). Pour chaque compte actif, complète
 * la journée jusqu'au nombre de posts prévu, en tirant le type selon les ratios
 * configurés — ou en forçant le recyclage pendant la semaine de lancement.
 *
 * Idempotente : elle ne crée que ce qui manque, donc la relancer ne double rien.
 *
 *   {}             → tous les comptes actifs (respecte pause assignation_auto)
 *   { compteId }   → ce seul compte (essai admin)
 *   { manuel: true } → contourne la pause (lancement admin)
 */
Deno.serve(async (request) => {
  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  let compteId: string | null = null;
  let date: string | null = null;
  let typeForce: TypePost | null = null;
  let forcer = false;
  let manuel = false;
  try {
    const body = await request.json();
    compteId = body?.compteId ?? null;
    date = body?.date ?? null;
    typeForce = body?.type ?? null;
    // Mode test : on crée un post même si le quota du jour est déjà atteint,
    // sinon un second essai le même jour ne produirait rien.
    forcer = Boolean(body?.forcer);
    // Lancement admin (Minuit / tests) : ignore le toggle « pause ».
    manuel = Boolean(body?.manuel);
  } catch {
    // Corps vide : tous les comptes, aujourd'hui.
  }

  // Sans date explicite, le jour visé est le jour PARIS : à minuit Paris (22h
  // UTC l'été), la date UTC est encore la veille — c'est ce qui faisait rater
  // l'assignation de minuit.
  const jour = date ?? aujourdhuiParis();

  try {
    if (!manuel) {
      const { data: flag } = await supabase
        .from("reglages")
        .select("valeur")
        .eq("cle", "assignation_auto")
        .maybeSingle();
      const actif = (flag?.valeur as { actif?: boolean } | null)?.actif !== false;
      if (!actif) {
        return json({
          ok: true,
          saute: true,
          raison: "assignation_auto en pause",
          jour,
        });
      }
    }

    const reglages = await chargerReglages(supabase);

    let query = supabase.from("comptes").select("*").eq("is_active", true);
    if (compteId) query = query.eq("id", compteId);

    const { data: comptes, error } = await query;
    if (error) throw error;

    const resultats: Array<{
      compteId: string;
      crees: number;
      types?: string[];
      erreur?: string;
    }> = [];

    for (const compte of comptes ?? []) {
      try {
        const types = await completerJournee(
          supabase, compte, jour, reglages, typeForce, forcer,
        );
        resultats.push({ compteId: compte.id, crees: types.length, types });
      } catch (error) {
        resultats.push({
          compteId: compte.id,
          crees: 0,
          erreur: messageErreur(error),
        });
      }
    }

    return json({ ok: true, jour, resultats });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

interface Reglages {
  repartition: Record<TypePost, number>;
  postsParJour: number;
  semaine1: { actif: boolean; jours: number; posts_par_jour: number; tout_recycle: boolean };
}

async function chargerReglages(supabase: Supabase): Promise<Reglages> {
  const { data } = await supabase.from("reglages").select("cle, valeur");
  const map = new Map((data ?? []).map((r) => [r.cle, r.valeur]));

  const repartition = map.get("repartition") ?? { recycle: 60, remanie: 20, nouveau: 20 };
  const frequence = map.get("frequence") ?? { posts_par_jour: 1 };
  const semaine1 = map.get("semaine1") ??
    { actif: true, jours: 7, posts_par_jour: 1, tout_recycle: true };

  return {
    repartition,
    postsParJour: Math.min(3, Math.max(1, frequence.posts_par_jour ?? 1)),
    semaine1,
  };
}

/** Complète la journée d'un compte jusqu'au quota, et renvoie le nombre créé. */
// deno-lint-ignore no-explicit-any
async function completerJournee(
  supabase: Supabase,
  compte: any,
  jour: string,
  reglages: Reglages,
  typeForce: TypePost | null,
  forcer: boolean,
): Promise<string[]> {
  const enLancement = estEnSemaineUn(compte.demarre_le, jour, reglages.semaine1);

  // Les réglages du compte l'emportent sur les réglages globaux : c'est ce qui
  // permet de dédier un compte au seul recopiage sans toucher aux autres.
  const repartition = compte.repartition ?? reglages.repartition;
  const parJourBrut = Number(compte.posts_par_jour ?? reglages.postsParJour ?? 1);
  const parJour = Math.min(3, Math.max(1, Number.isFinite(parJourBrut) ? parJourBrut : 1));
  const semaine1Quota = Math.min(
    3,
    Math.max(1, Number(reglages.semaine1.posts_par_jour ?? 1) || 1),
  );
  const quota = enLancement ? semaine1Quota : parJour;

  const { data: existants } = await supabase
    .from("posts")
    .select("id")
    .eq("compte_id", compte.id)
    .eq("date_publication_prevue", jour)
    .eq("est_test", false); // les posts de test ne bloquent pas l'assignation

  // Non-écrasement : on ne touche pas aux posts déjà là, on complète jusqu'au
  // quota (1–3). Mode test forcé = +1 même au-delà.
  const dejaLa = existants?.length ?? 0;
  const manquants = forcer ? 1 : Math.max(0, quota - dejaLa);
  if (manquants <= 0) return [];

  // On renvoie le type RÉELLEMENT produit : recopiage et remaniement retombent
  // sur une composition normale quand le compte n'a pas d'historique, et
  // masquer ce repli rendrait un test trompeur.
  const produits: string[] = [];
  for (let i = 0; i < manquants; i += 1) {
    // Pendant la semaine de lancement le compte n'a pas d'historique propre :
    // on force le recyclage de structure, servi par les visuels du compte.
    const type = typeForce
      ?? (enLancement && reglages.semaine1.tout_recycle
        ? "recycle"
        : tirerType(repartition));

    // On ne crée que la coquille : la fabrication (traduction, placement) est
    // faite ensuite par le drain `composition`, étape par étape. Le post ne
    // passe en « assigné » qu'une fois prêt, donc il n'apparaît pas chez le
    // poster tant qu'il est vide.
    const resultat = await creerPost(supabase, compte, jour, type);
    if (!resultat) break; // plus de matière disponible, inutile d'insister
    produits.push(resultat.typeReel);
  }

  return produits;
}

function estEnSemaineUn(
  demarreLe: string,
  jour: string,
  semaine1: Reglages["semaine1"],
): boolean {
  if (!semaine1.actif) return false;
  const debut = new Date(demarreLe).getTime();
  const courant = new Date(jour).getTime();
  const jours = (courant - debut) / 86_400_000;
  return jours >= 0 && jours < semaine1.jours;
}

/** Tirage pondéré par les ratios de l'admin. */
function tirerType(repartition: Record<TypePost, number>): TypePost {
  const entrees = Object.entries(repartition) as Array<[TypePost, number]>;
  const total = entrees.reduce((somme, [, poids]) => somme + poids, 0);
  if (total <= 0) return "nouveau";

  let tirage = Math.random() * total;
  for (const [type, poids] of entrees) {
    tirage -= poids;
    if (tirage <= 0) return type;
  }
  return entrees[entrees.length - 1][0];
}

/**
 * Crée un post du type demandé.
 *
 * - RECYCLÉ (défaut) : on reproduit un TikTok du compte de référence (choisirSujet),
 *   ses images NETTOYÉES + son texte traduit. C'est le cœur du système.
 * - REMANIÉ : le texte d'une AUTRE source, revisualisé avec les images du poster.
 *   Sans autre source exploitable, on retombe sur un recyclé.
 */
// deno-lint-ignore no-explicit-any
async function creerPost(
  supabase: Supabase,
  compte: any,
  jour: string,
  type: TypePost,
): Promise<{ postId: string; typeReel: string } | null> {
  if (type === "remanie") {
    const remanie = await remanierPost(supabase, compte, jour);
    if (remanie) return { postId: remanie, typeReel: "remanie" };
  }

  // recycle ET nouveau (et remanié sans autre source) : reproduction fidèle d'un
  // TikTok de référence. On garde le type demandé (recycle → « Recyclé »), sauf un
  // remanié qui a échoué et devient un recyclé.
  const sujet = await choisirSujet(supabase, compte, jour);
  if (!sujet) return null;

  const typeFinal: TypePost = type === "remanie" ? "recycle" : type;
  const postId = await creerCoquille(supabase, {
    compteId: compte.id,
    sujetId: sujet.id,
    type: typeFinal,
    date: jour,
  });
  return { postId, typeReel: typeFinal };
}

/**
 * REMANIÉ (Cas 2) : on prend un post reproduisible d'une AUTRE source de
 * référence — son TEXTE (traduit vers la langue du poster à la composition, quelle
 * que soit la langue d'origine) — mais les IMAGES viennent de la bibliothèque du
 * compte du poster (`visuelsAlternatifs`, à la composition). Résultat : l'idée
 * d'un autre compte, revisualisée avec les visuels propres du poster (donc ça ne
 * trahit pas le réseau : les images ne sont pas celles de l'autre source).
 *
 * On écarte les sujets déjà servis à CE compte dans les 14 jours (variété), on
 * privilégie les plus vus, et on renvoie null s'il n'existe aucune autre source
 * exploitable — l'appelant retombe alors sur une composition normale.
 */
// deno-lint-ignore no-explicit-any
/**
 * Ids du GROUPE d'une source : le principal + ses conjoints (comptes de référence
 * similaires rattachés). Le poster reste attaché au principal, mais on puise la
 * matière dans tout le groupe — c'est ce qui prend le relais quand le principal
 * s'épuise. Renvoie [] si pas de source.
 */
async function idsDuGroupe(supabase: Supabase, referenceId: string | null): Promise<string[]> {
  if (!referenceId) return [];
  const { data } = await supabase
    .from("comptes_reference")
    .select("id")
    .or(`id.eq.${referenceId},parent_id.eq.${referenceId}`);
  return (data ?? []).map((r) => r.id as string);
}

async function remanierPost(
  supabase: Supabase,
  compte: any,
  jour: string,
): Promise<string | null> {
  // Sujets reproduisibles d'une AUTRE source (langue indifférente : on traduit),
  // les plus vus d'abord. « Autre » exclut TOUT le groupe du compte (principal +
  // conjoints), pas seulement le principal.
  const groupe = await idsDuGroupe(supabase, compte.compte_reference_id);
  let q = supabase
    .from("sujets")
    .select("id")
    .eq("preparation_statut", "done")
    .in("statut", ["retenu", "utilise"])
    .order("vues", { ascending: false, nullsFirst: false });
  if (groupe.length > 0) {
    q = q.not("compte_reference_id", "in", `(${groupe.join(",")})`);
  }
  const { data: candidats } = await q;
  if (!candidats || candidats.length === 0) return null;

  // Historique de CE compte : dernière parution par sujet, pour appliquer la
  // fenêtre de 14 jours (et écarter en priorité ce qu'il a déjà vu).
  const { data: usages } = await supabase
    .from("posts")
    .select("sujet_id, date_publication_prevue")
    .eq("compte_id", compte.id)
    .not("sujet_id", "is", null);
  const derniere = new Map<string, string>();
  for (const u of usages ?? []) {
    const d = u.date_publication_prevue ?? "";
    if (!derniere.has(u.sujet_id) || d > derniere.get(u.sujet_id)!) derniere.set(u.sujet_id, d);
  }
  const limite = new Date(`${jour}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() - 14);
  const seuil = limite.toISOString().slice(0, 10);
  const vuRecemment = (id: string) => {
    const d = derniere.get(id);
    return d !== undefined && d >= seuil;
  };

  const ids = candidats.map((c) => c.id as string);
  const choisi = ids.find((id) => !vuRecemment(id)) ?? ids.find((id) => !derniere.has(id)) ?? ids[0];
  if (!choisi) return null;

  return await creerCoquille(supabase, {
    compteId: compte.id,
    sujetId: choisi,
    type: "remanie",
    date: jour,
  });
}

/** Duplique le post publié le plus performant du compte. */
// deno-lint-ignore no-explicit-any
async function recyclerMeilleurPost(
  supabase: Supabase,
  compte: any,
  jour: string,
): Promise<string | null> {
  const { data: candidats } = await supabase
    .from("posts")
    .select("id, sujet_id, musique_url, musique_titre, musique_plateforme, post_metrics(vues)")
    .eq("compte_id", compte.id)
    .eq("statut", "publie")
    .limit(50);

  if (!candidats || candidats.length === 0) return null;

  // On classe sur les vues du dernier relevé ; sans métrique, le post compte
  // pour zéro et passe donc après ceux qui ont fait leurs preuves.
  const meilleur = candidats
    .map((p) => ({
      post: p,
      // deno-lint-ignore no-explicit-any
      vues: Math.max(0, ...((p as any).post_metrics ?? []).map((m: any) => m.vues ?? 0)),
    }))
    .sort((a, b) => b.vues - a.vues)[0];

  if (!meilleur || meilleur.vues === 0) return null;

  const source = meilleur.post;
  const { data: nouveau, error } = await supabase
    .from("posts")
    .insert({
      compte_id: compte.id,
      sujet_id: source.sujet_id,
      type: "recycle",
      // Le recyclage copie les slides telles quelles : rien à fabriquer, donc
      // il ne passe pas par le drain de composition et est assigné d'emblée.
      statut: "assigne",
      date_publication_prevue: jour,
      source_post_id: source.id,
      musique_url: source.musique_url,
      musique_titre: source.musique_titre,
      musique_plateforme: source.musique_plateforme,
      pipeline_statut: "done",
    })
    .select()
    .single();
  if (error || !nouveau) return null;

  const { data: slides } = await supabase
    .from("post_slides")
    .select("position, media_id, texte_overlay, position_sophia")
    .eq("post_id", source.id)
    .order("position");

  if (slides && slides.length > 0) {
    await supabase
      .from("post_slides")
      .insert(slides.map((s) => ({ ...s, post_id: nouveau.id })));
  }

  return nouveau.id;
}

/**
 * Choisit un sujet préparé pour ce compte, selon les règles de réutilisation :
 *  - fenêtre de 14 jours PAR POSTER : un slideshow déjà servi à CE compte il y a
 *    moins de 14 jours est écarté (variété dans le feed du poster) ;
 *  - priorité à la source du compte, puis au POOL COMMUN (n'importe quelle source
 *    — il n'y a qu'à re-traduire) ;
 *  - JAMAIS 0 post : si tout a été vu récemment, on relâche les 14 j et on reprend
 *    le sujet vu le MOINS récemment (jamais vu d'abord). La reprise garde le texte
 *    et change les images (géré à la composition).
 */
// deno-lint-ignore no-explicit-any
async function choisirSujet(supabase: Supabase, compte: any, jour: string) {
  // Historique de CE compte : dernière parution par sujet.
  const { data: usages } = await supabase
    .from("posts")
    .select("sujet_id, date_publication_prevue")
    .eq("compte_id", compte.id)
    .not("sujet_id", "is", null);

  const derniereVue = new Map<string, string>();
  for (const u of usages ?? []) {
    const d = u.date_publication_prevue ?? "";
    const prev = derniereVue.get(u.sujet_id);
    if (!prev || d > prev) derniereVue.set(u.sujet_id, d);
  }

  // Seuil « il y a 14 jours » (par rapport au jour d'assignation).
  const limite = new Date(`${jour}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() - 14);
  const seuil = limite.toISOString().slice(0, 10);
  const vuRecemment = (id: string) => {
    const d = derniereVue.get(id);
    return d !== undefined && d >= seuil;
  };

  // Le GROUPE du compte (principal + conjoints) : « sa source » au sens large.
  const groupe = await idsDuGroupe(supabase, compte.compte_reference_id);

  // Sujets préparés (retenu/utilise), triés par pertinence. `ownSourceOnly` limite
  // au GROUPE du compte (principal + conjoints), pas au seul principal.
  const candidats = async (ownSourceOnly: boolean): Promise<string[]> => {
    let q = supabase
      .from("sujets")
      .select("id")
      .eq("preparation_statut", "done")
      .in("statut", ["retenu", "utilise"])
      // Le filtre = le HOOK (retenu = pertinent pour Sophia) ; le TRI = les VUES
      // (on rejoue d'abord ce qui a le mieux marché), pertinence en départage.
      .order("vues", { ascending: false, nullsFirst: false })
      .order("pertinence_score", { ascending: false });
    if (ownSourceOnly && groupe.length > 0) {
      q = q.in("compte_reference_id", groupe);
    }
    const { data } = await q;
    return (data ?? []).map((s) => s.id as string);
  };

  const source = compte.compte_reference_id ? await candidats(true) : [];
  const tous = await candidats(false);

  // Le vu le moins récemment d'une liste (jamais vu d'abord).
  const moinsRecent = (liste: string[]) => {
    const jamais = liste.find((id) => !derniereVue.has(id));
    if (jamais) return jamais;
    return liste
      .slice()
      .sort((a, b) => (derniereVue.get(a) ?? "").localeCompare(derniereVue.get(b) ?? ""))[0] ?? null;
  };

  // 1) SA source, hors fenêtre 14 j (contenu frais, jamais vu récemment).
  const fraisSource = source.find((id) => !vuRecemment(id));
  if (fraisSource) return { id: fraisSource };

  // 2) SA source encore : on relâche les 14 j et on RECYCLE son propre contenu
  //    (le texte est gardé, les images changent à la composition). Un poster
  //    reste ainsi TOUJOURS sur sa source — jamais le contenu d'une autre, ce qui
  //    trahirait le réseau (deux posters relayant le même compte). Tant que sa
  //    source a des sujets prêts, on ne sort pas d'ici.
  if (source.length > 0) {
    const recycle = moinsRecent(source);
    if (recycle) return { id: recycle };
  }

  // 3) DERNIER RECOURS : le compte n'a AUCUN sujet prêt sur sa propre source
  //    (source non liée, ou pas encore extraite/nettoyée). Pour ne pas le laisser
  //    sans rien, on pioche dans le pool commun — hors 14 j si possible, sinon le
  //    moins récent. Dès que sa source produit, l'étape 1/2 reprend la main.
  const fraisPool = tous.find((id) => !vuRecemment(id));
  if (fraisPool) return { id: fraisPool };
  const secours = moinsRecent(tous);
  return secours ? { id: secours } : null;
}
