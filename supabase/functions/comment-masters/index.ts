import { scrapeCommentaires } from "../_shared/apify.ts";
import {
  blocsSlack,
  CLE_PROMPT,
  cleSeuil,
  type DecisionReleve,
  decisionReleve,
  type DemandeSlack,
  enLots,
  ERREURS_CANAL,
  estLundi,
  idDuLien,
  indexerSeuils,
  JOURS_RECALIBRAGE,
  lireReponse,
  nomAppli,
  problemesCommentaire,
  PROMPT_DEFAUT,
  promptCommentaire,
  type RegionActive,
  releveDu,
  retrouverCommentaire,
  type SeuilPays,
  seuilRecalibre,
  texteNotification,
  verdictCanal,
} from "../_shared/comment_masters.ts";
import { lireParLots } from "../_shared/lots.ts";
import { mapPool } from "../_shared/parallel.ts";
import {
  assertAuthorised,
  assertRole,
  aujourdhuiParis,
  chargerPrompt,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

// Relevé du commentaire 48 h après le « Done » : assez pour que les likes se
// soient posés, le post n'est plus poussé par TikTok au-delà.
const DELAI_MESURE_H = 48;
// TikTok sert d'abord les commentaires les plus likés : au-delà de 100, celui
// du comment master n'a de toute façon aucun like à relever.
const COMMENTAIRES_RELEVES = 100;
// Les mesures (un run Apify synchrone chacune) passent après les relevés, dans
// ce qui reste du budget : quelques-unes par passage suffisent, le cron repasse.
const MESURES_PAR_PASSAGE = 5;
const ESSAIS_GENERATION = 3;
// Même ordre de repli que TEXT_MODELS (_shared/gemini.ts). Appel direct plutôt
// qu'import : gemini.ts tire tout le pipeline image (16 fichiers, 200 Ko) dans
// le paquet de la fonction, pour un seul appel texte.
const MODELES_TEXTE = ["gemini-3.5-flash", "gemini-2.0-flash", "gemini-3.1-flash-lite"];

const APIFY = "https://api.apify.com/v2";
const ACTEUR = "clockworks~tiktok-scraper";
// La fonction est coupée à 150 s. Les runs lancés sont attendus jusqu'à
// ATTENTE_RUNS_MS ; ceux qui traînent sont relevés au passage suivant, rien
// n'est perdu (les résultats restent dans le dataset Apify).
const ATTENTE_RUNS_MS = 75_000;
const BUDGET_MS = 115_000;
// Un run toujours en cours après 30 min est abandonné : ses posts repartent.
const RUN_PERIME_MS = 30 * 60_000;
const CLE_RECALIBRAGE = "comment_masters_recalibrage";

/**
 * Comment masters (TICKET 002), appelée tous les quarts d'heure par le cron
 * `comment-masters`.
 *
 * Chaque passage :
 * 1. relève les runs Apify terminés : pour chaque post, déclenche le
 *    commentaire s'il passe le seuil de son PAYS (comment_master_pays), ou
 *    l'abandonne s'il fait moins de 20 % du seuil à 6 h ;
 * 2. lance les relevés dus — un post toutes les 2 h, dès 2 h, pendant la
 *    fenêtre de sa région — en runs asynchrones de 50 liens, puis en attend
 *    les résultats tant que le budget le permet ;
 * 3. renvoie les messages Slack qui avaient échoué ;
 * 4. 48 h après un « Done », retrouve le commentaire sous le post et relève ses
 *    likes, puis les annonce en réponse au message Slack ;
 * 5. le lundi, recalibre les seuils des pays sans cadenas (~1 post sur 20).
 *
 * Seules les régions ACTIVES (un comment master, un canal vérifié) sont
 * relevées : une région éteinte ne coûte rien. La configuration (comment
 * master, canal, seuils) est relue à chaque passage, sans redéploiement. Le
 * prompt se règle dans Admin → Prompts (clé `comment_master`) ; vide, c'est
 * PROMPT_DEFAUT.
 *
 *   {}                                  → le passage du cron
 *   { apercu: n, prompt?, langue? }     → commentaires de n vrais posts déjà
 *                                         au-dessus du seuil de leur pays,
 *                                         renvoyés en JSON : ni Slack, ni
 *                                         Apify, rien d'écrit.
 *   { action: "verifier_canal", langue } → le bot est-il membre du canal ?
 *   { action: "activer", langue, actif } → allume (après vérification) ou
 *                                         éteint une région.
 * Les deux actions servent la page Admin → Comment masters (admin et Head of Ops).
 */
Deno.serve(async (request) => {
  let corps: Record<string, unknown> = {};
  if (request.method === "POST") {
    try {
      corps = (await request.clone().json()) ?? {};
    } catch {
      // Corps vide : passage du cron.
    }
  }

  if (corps.action === "verifier_canal" || corps.action === "activer") {
    const acces = await assertRole(request, ["admin", "head_of_ops"]);
    if (acces instanceof Response) return acces;
    try {
      const slack = jetonSlack();
      const supabase = serviceClient();
      const langue = String(corps.langue ?? "");
      if (corps.action === "verifier_canal") return json(await verifierCanal(supabase, slack, langue));
      return json(await activerRegion(supabase, slack, langue, Boolean(corps.actif)));
    } catch (error) {
      return json({ ok: false, error: messageErreur(error) }, 500);
    }
  }

  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const apercu = Number(corps.apercu) || 0;
  if (apercu > 0) {
    try {
      const supabase = serviceClient();
      const brouillon = typeof corps.prompt === "string" && corps.prompt.trim() ? corps.prompt : null;
      const modele = brouillon ?? await promptEnregistre(supabase);
      const langue = typeof corps.langue === "string" && corps.langue ? corps.langue : null;
      return json({ ok: true, apercu: await apercuCommentaires(supabase, Math.min(apercu, 12), modele, langue) });
    } catch (error) {
      return json({ ok: false, error: messageErreur(error) }, 500);
    }
  }

  const slack = Deno.env.get("SLACK_BOT_TOKEN");
  // Sans Slack, inutile de payer un relevé Apify : rien ne pourrait partir.
  if (!slack) return json({ ok: false, error: "SLACK_BOT_TOKEN manquant" }, 500);

  try {
    return json(await passage(serviceClient(), slack));
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});

function jetonSlack(): string {
  const slack = Deno.env.get("SLACK_BOT_TOKEN");
  if (!slack) throw new Error("SLACK_BOT_TOKEN manquant");
  return slack;
}

async function promptEnregistre(supabase: Supabase): Promise<string> {
  return (await chargerPrompt(supabase, CLE_PROMPT)) ?? PROMPT_DEFAUT;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface Config {
  regions: RegionActive[];
  index: ReturnType<typeof indexerSeuils>;
}

/** Régions actives et seuils de leurs pays, relus à chaque passage. */
async function lireConfig(supabase: Supabase): Promise<Config> {
  const { data: regions, error } = await supabase
    .from("comment_master_regions")
    .select("langue, slack_channel_id, fenetre_heures")
    .eq("actif", true)
    .not("slack_channel_id", "is", null)
    .not("comment_master_id", "is", null);
  if (error) throw error;
  const { data: pays, error: errPays } = await supabase
    .from("comment_master_pays")
    .select("langue, pays, seuil_vues");
  if (errPays) throw errPays;
  const actives = (regions ?? []) as RegionActive[];
  return { regions: actives, index: indexerSeuils(actives, (pays ?? []) as SeuilPays[]) };
}

// ---------------------------------------------------------------------------
// Le passage du cron
// ---------------------------------------------------------------------------

interface Contexte {
  supabase: Supabase;
  slack: string;
  config: Config;
  modele: string;
  nomParId: Map<string, string>;
  debut: number;
}

interface BilanLots {
  lots: number;
  releves: number;
  declenches: number;
  envoyes: number;
  abandonnes: number;
  erreurs: string[];
}

function bilanVide(): BilanLots {
  return { lots: 0, releves: 0, declenches: 0, envoyes: 0, abandonnes: 0, erreurs: [] };
}

function cumuler(a: BilanLots, b: BilanLots): BilanLots {
  return {
    lots: a.lots + b.lots,
    releves: a.releves + b.releves,
    declenches: a.declenches + b.declenches,
    envoyes: a.envoyes + b.envoyes,
    abandonnes: a.abandonnes + b.abandonnes,
    erreurs: [...a.erreurs, ...b.erreurs],
  };
}

async function passage(supabase: Supabase, slack: string) {
  const debut = Date.now();
  const [config, modele, nomParId] = await Promise.all([
    lireConfig(supabase),
    promptEnregistre(supabase),
    nomsApplications(supabase),
  ]);
  const ctx: Contexte = { supabase, slack, config, modele, nomParId, debut };
  const erreurs: string[] = [];

  // Chaque étape est isolée : une mesure ratée n'empêche pas les relevés.
  let collecte = bilanVide();
  try {
    collecte = await collecterLots(ctx, null);
  } catch (error) {
    erreurs.push(`collecte : ${messageErreur(error)}`);
  }

  let lances = { lots: 0, liens: 0, ids: [] as string[] };
  if (config.regions.length > 0) {
    try {
      lances = await lancerReleves(ctx);
    } catch (error) {
      erreurs.push(`lancement : ${messageErreur(error)}`);
    }
  }

  if (lances.ids.length > 0) {
    try {
      collecte = cumuler(collecte, await attendreLots(ctx, lances.ids));
    } catch (error) {
      erreurs.push(`attente : ${messageErreur(error)}`);
    }
  }

  let renvois = 0;
  try {
    renvois = await renvoyer(supabase, slack);
  } catch (error) {
    erreurs.push(`renvois : ${messageErreur(error)}`);
  }

  let mesures: Record<string, unknown> = { mesures: 0 };
  try {
    mesures = await mesurer(supabase, slack, debut);
  } catch (error) {
    erreurs.push(`mesures : ${messageErreur(error)}`);
  }

  let recalibrage: unknown = null;
  try {
    recalibrage = await recalibrerSiLundi(supabase);
  } catch (error) {
    erreurs.push(`recalibrage : ${messageErreur(error)}`);
  }

  return {
    ok: erreurs.length === 0,
    regions: config.regions.map((r) => r.langue),
    lances: { lots: lances.lots, liens: lances.liens },
    collecte: { ...collecte, erreurs: undefined },
    renvois,
    mesures,
    ...(recalibrage ? { recalibrage } : {}),
    ...(erreurs.length || collecte.erreurs.length ? { erreurs: [...erreurs, ...collecte.erreurs] } : {}),
  };
}

// ---------------------------------------------------------------------------
// Apify asynchrone
// ---------------------------------------------------------------------------

function jetonApify(): string {
  const jeton = Deno.env.get("APIFY_TOKEN");
  if (!jeton) throw new Error("APIFY_TOKEN manquant");
  return jeton;
}

async function apify<T>(chemin: string, corps?: unknown): Promise<T> {
  const sep = chemin.includes("?") ? "&" : "?";
  const reponse = await fetch(
    `${APIFY}${chemin}${sep}token=${jetonApify()}`,
    corps === undefined ? {} : {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corps),
    },
  );
  if (!reponse.ok) throw new Error(`Apify ${reponse.status}: ${(await reponse.text()).slice(0, 200)}`);
  return (await reponse.json()) as T;
}

/** Les vues des posts, sans télécharger ni images ni vidéos : facturé au post renvoyé. */
async function lancerRun(urls: string[]): Promise<string> {
  const run = await apify<{ data: { id: string } }>(`/acts/${ACTEUR}/runs`, {
    postURLs: urls,
    resultsPerPage: 1,
    shouldDownloadSlideshowImages: false,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    proxyCountryCode: "None",
  });
  return run.data.id;
}

// ---------------------------------------------------------------------------
// Lancer les relevés dus
// ---------------------------------------------------------------------------

interface PassageCandidat {
  id: string;
  compte_id: string | null;
  publie_url: string;
  publie_at: string;
  tiktok_publie_at: string | null;
  comptes: { langue: string; pays: string | null };
}

interface LigneSuivi {
  passage_id: string;
  compte_id: string | null;
  langue: string;
  pays: string;
  url_releve: string;
  publie_at: string;
  statut: string;
  nb_releves: number;
  vues: number | null;
  dernier_releve_at: string | null;
  lot_id: string | null;
}

async function lancerReleves(ctx: Contexte): Promise<{ lots: number; liens: number; ids: string[] }> {
  const { supabase, config } = ctx;
  const fenetreMax = Math.max(...config.regions.map((r) => r.fenetre_heures));
  // Le clic « publié » peut suivre la publication TikTok : une heure de marge.
  const depuis = new Date(Date.now() - (fenetreMax + 1) * 3600_000).toISOString();

  const { data, error } = await supabase
    .from("passages")
    .select("id, compte_id, publie_url, publie_at, tiktok_publie_at, comptes!inner(langue, pays)")
    .eq("statut", "publie")
    .not("publie_url", "is", null)
    .gte("publie_at", depuis)
    .in("comptes.langue", config.regions.map((r) => r.langue));
  if (error) throw error;

  const candidats = ((data ?? []) as unknown as PassageCandidat[])
    .filter((p) => config.index.has(cleSeuil(p.comptes.langue, p.comptes.pays)));
  if (candidats.length === 0) return { lots: 0, liens: 0, ids: [] };

  const ids = candidats.map((p) => p.id);
  const suivis = await lireParLots(ids, "comment_master_suivis", (lot) =>
    supabase
      .from("comment_master_suivis")
      .select("passage_id, statut, dernier_releve_at, lot_id, url_releve")
      .in("passage_id", lot));
  const demandes = await lireParLots(ids, "comment_master_demandes", (lot) =>
    supabase.from("comment_master_demandes").select("passage_id").in("passage_id", lot));
  const parPassage = new Map(
    (suivis as Array<Pick<LigneSuivi, "passage_id" | "statut" | "dernier_releve_at" | "lot_id" | "url_releve">>)
      .map((s) => [s.passage_id, s]),
  );
  const dejaEnvoyes = new Set((demandes as Array<{ passage_id: string }>).map((d) => d.passage_id));

  const maintenant = Date.now();
  const dus = candidats.filter((p) => {
    if (dejaEnvoyes.has(p.id)) return false;
    const suivi = parPassage.get(p.id);
    if (suivi && (suivi.statut !== "suivi" || suivi.lot_id)) return false;
    const fenetre = config.index.get(cleSeuil(p.comptes.langue, p.comptes.pays))!.region.fenetre_heures;
    const publieMs = Date.parse(p.tiktok_publie_at ?? p.publie_at);
    const dernierMs = suivi?.dernier_releve_at ? Date.parse(suivi.dernier_releve_at) : null;
    return releveDu(publieMs, dernierMs, fenetre, maintenant);
  });
  if (dus.length === 0) return { lots: 0, liens: 0, ids: [] };

  // Premier relevé d'un post : le lien court (bouton « Partager ») est résolu
  // une fois pour toutes, puis gardé dans le suivi.
  const nouveaux = dus.filter((p) => !parPassage.has(p.id));
  const liens = await mapPool(nouveaux, 8, (p) => resoudreLien(p.publie_url));
  if (nouveaux.length > 0) {
    const { error: errIns } = await supabase.from("comment_master_suivis").upsert(
      nouveaux.map((p, i) => ({
        passage_id: p.id,
        compte_id: p.compte_id,
        langue: p.comptes.langue,
        pays: p.comptes.pays,
        url_releve: liens[i],
        publie_at: p.tiktok_publie_at ?? p.publie_at,
      })),
      { onConflict: "passage_id", ignoreDuplicates: true },
    );
    if (errIns) throw errIns;
  }
  const urlParPassage = new Map<string, string>();
  nouveaux.forEach((p, i) => urlParPassage.set(p.id, liens[i]));
  for (const p of dus) {
    const url = parPassage.get(p.id)?.url_releve;
    if (url) urlParPassage.set(p.id, url);
  }

  const lancesIds: string[] = [];
  let liensLances = 0;
  for (const lot of enLots(dus)) {
    const passageIds = lot.map((p) => p.id);
    const { data: ligne, error: errLot } = await supabase
      .from("comment_master_lots")
      .insert({ nb_liens: lot.length })
      .select("id")
      .single();
    if (errLot) throw errLot;
    const { error: errRes } = await supabase
      .from("comment_master_suivis")
      .update({ lot_id: ligne.id, maj_at: new Date().toISOString() })
      .in("passage_id", passageIds);
    if (errRes) throw errRes;
    try {
      const runId = await lancerRun(passageIds.map((id) => urlParPassage.get(id)!));
      await supabase.from("comment_master_lots").update({ apify_run_id: runId }).eq("id", ligne.id);
      lancesIds.push(ligne.id);
      liensLances += lot.length;
    } catch (error) {
      // Rien n'a été facturé : les posts repartent au passage suivant.
      await supabase
        .from("comment_master_lots")
        .update({ statut: "echec", erreur: messageErreur(error), termine_at: new Date().toISOString(), nb_resultats: 0 })
        .eq("id", ligne.id);
      await supabase.from("comment_master_suivis").update({ lot_id: null }).eq("lot_id", ligne.id);
      throw error;
    }
  }
  return { lots: lancesIds.length, liens: liensLances, ids: lancesIds };
}

// ---------------------------------------------------------------------------
// Relever les runs terminés
// ---------------------------------------------------------------------------

interface LigneLot {
  id: string;
  apify_run_id: string | null;
  lance_at: string;
}

/** Les runs lancés à l'instant : attendus tant que le budget le permet. */
async function attendreLots(ctx: Contexte, ids: string[]): Promise<BilanLots> {
  let bilan = bilanVide();
  let restants = ids;
  while (restants.length > 0 && Date.now() - ctx.debut < ATTENTE_RUNS_MS) {
    await new Promise((r) => setTimeout(r, 5_000));
    const tour = await collecterLots(ctx, restants);
    bilan = cumuler(bilan, tour);
    const { data, error } = await ctx.supabase
      .from("comment_master_lots")
      .select("id")
      .in("id", restants)
      .eq("statut", "lance");
    if (error) throw error;
    restants = (data ?? []).map((l) => l.id as string);
  }
  return bilan;
}

/** Relève les lots en vol (tous, ou ceux de `ids`) dont le run Apify est fini. */
async function collecterLots(ctx: Contexte, ids: string[] | null): Promise<BilanLots> {
  let requete = ctx.supabase
    .from("comment_master_lots")
    .select("id, apify_run_id, lance_at")
    .eq("statut", "lance")
    .order("lance_at")
    .limit(40);
  if (ids) requete = requete.in("id", ids);
  const { data, error } = await requete;
  if (error) throw error;

  let bilan = bilanVide();
  for (const lot of (data ?? []) as LigneLot[]) {
    if (Date.now() - ctx.debut > BUDGET_MS) break;
    try {
      bilan = cumuler(bilan, await collecterLot(ctx, lot));
    } catch (error) {
      bilan.erreurs.push(`lot ${lot.id} : ${messageErreur(error)}`);
    }
  }
  return bilan;
}

async function echecLot(supabase: Supabase, lotId: string, erreur: string, nbResultats = 0) {
  await supabase
    .from("comment_master_lots")
    .update({ statut: "echec", erreur, termine_at: new Date().toISOString(), nb_resultats: nbResultats })
    .eq("id", lotId);
  // Les posts du lot repartent : ils seront dus au passage suivant.
  await supabase.from("comment_master_suivis").update({ lot_id: null }).eq("lot_id", lotId);
}

async function collecterLot(ctx: Contexte, lot: LigneLot): Promise<BilanLots> {
  const { supabase } = ctx;
  const age = Date.now() - Date.parse(lot.lance_at);
  if (!lot.apify_run_id) {
    // Lot créé mais run jamais lancé (passage mort entre les deux).
    if (age > 10 * 60_000) await echecLot(supabase, lot.id, "run jamais lancé");
    return bilanVide();
  }

  const run = (await apify<{ data: { status: string; defaultDatasetId: string } }>(
    `/actor-runs/${lot.apify_run_id}`,
  )).data;
  if (run.status === "READY" || run.status === "RUNNING") {
    if (age > RUN_PERIME_MS) await echecLot(supabase, lot.id, `run Apify ${lot.apify_run_id} trop long`);
    return bilanVide();
  }
  if (run.status !== "SUCCEEDED") {
    await echecLot(supabase, lot.id, `run Apify ${lot.apify_run_id} : ${run.status}`);
    return bilanVide();
  }

  const items = await apify<Array<{ id?: string; playCount?: number }>>(
    `/datasets/${run.defaultDatasetId}/items?clean=true&fields=id,playCount`,
  );
  const vuesParId = new Map(
    items.filter((i) => i.id).map((i) => [String(i.id), typeof i.playCount === "number" ? i.playCount : null]),
  );

  const { data: lignes, error } = await supabase
    .from("comment_master_suivis")
    .select("passage_id, compte_id, langue, pays, url_releve, publie_at, statut, nb_releves, vues, dernier_releve_at, lot_id")
    .eq("lot_id", lot.id);
  if (error) throw error;

  const bilan = bilanVide();
  bilan.lots = 1;
  const declencher: Array<{ suivi: LigneSuivi; vues: number; seuil: number; ageMin: number }> = [];
  const lanceMs = Date.parse(lot.lance_at);

  await mapPool((lignes ?? []) as LigneSuivi[], 8, async (s) => {
    const releve = vuesParId.get(idDuLien(s.url_releve));
    const vues = releve ?? null;
    const conf = ctx.config.index.get(cleSeuil(s.langue, s.pays));
    const ageMin = Math.round((lanceMs - Date.parse(s.publie_at)) / 60_000);
    let decision: DecisionReleve;
    let motif: string | null = null;
    if (!conf) {
      decision = "terminer";
      motif = "région éteinte";
    } else {
      decision = decisionReleve({ ageMin, vues, seuil: conf.seuil, fenetreHeures: conf.region.fenetre_heures });
      if (decision === "abandonner") motif = `${vues ?? 0} vues à ${ageMin} min`;
      if (decision === "terminer") motif = "fin de fenêtre";
    }
    if (vues !== null) bilan.releves += 1;

    const maj: Record<string, unknown> = {
      lot_id: null,
      nb_releves: s.nb_releves + 1,
      dernier_releve_at: lot.lance_at,
      maj_at: new Date().toISOString(),
      ...(vues !== null ? { vues } : {}),
      ...(conf ? { seuil_vues: conf.seuil } : {}),
    };
    if (decision === "abandonner" || decision === "terminer") {
      maj.statut = decision === "abandonner" ? "abandonne" : "termine";
      maj.motif = motif;
    }
    if (decision === "abandonner") bilan.abandonnes += 1;
    const { error: errMaj } = await supabase.from("comment_master_suivis").update(maj).eq("passage_id", s.passage_id);
    if (errMaj) throw errMaj;
    if (decision === "declencher" && conf && vues !== null) {
      declencher.push({ suivi: s, vues, seuil: conf.seuil, ageMin });
    }
  });

  for (const d of declencher) {
    try {
      const envoye = await declencherCommentaire(ctx, d.suivi, d.vues, d.seuil, d.ageMin);
      bilan.declenches += 1;
      if (envoye) bilan.envoyes += 1;
    } catch (error) {
      // Le post reste suivi : le relevé suivant retentera.
      bilan.erreurs.push(`${d.suivi.passage_id} : ${messageErreur(error)}`);
    }
  }

  await supabase
    .from("comment_master_lots")
    .update({ statut: "termine", nb_resultats: items.length, termine_at: new Date().toISOString() })
    .eq("id", lot.id);
  return bilan;
}

// ---------------------------------------------------------------------------
// Déclencher : générer, enregistrer, envoyer
// ---------------------------------------------------------------------------

interface PassageCommentaire {
  id: string;
  compte_id: string | null;
  application_id: string | null;
  publie_url: string;
  slides: unknown;
  hashtags: string | null;
  comptes: { handle_tiktok: string | null; langue: string; pays: string | null; application_id: string | null };
}

async function declencherCommentaire(
  ctx: Contexte,
  suivi: LigneSuivi,
  vues: number,
  seuil: number,
  ageMin: number,
): Promise<boolean> {
  const { supabase, slack } = ctx;
  const { data, error } = await supabase
    .from("passages")
    .select(
      "id, compte_id, application_id, publie_url, slides, hashtags, comptes!inner(handle_tiktok, langue, pays, application_id)",
    )
    .eq("id", suivi.passage_id)
    .single();
  if (error) throw error;
  const p = data as unknown as PassageCommentaire;
  const region = ctx.config.index.get(cleSeuil(suivi.langue, suivi.pays))!.region;

  const entree = entreeCommentaire(p, p.comptes, ctx.nomParId);
  const { commentaire, traduction } = await genererCommentaire(entree, ctx.modele);

  // Insertion AVANT l'envoi : l'unicité sur passage_id garantit qu'un post ne
  // part qu'une fois, même si deux passages se chevauchent.
  const { data: demande, error: errIns } = await supabase
    .from("comment_master_demandes")
    .insert({
      passage_id: p.id,
      compte_id: p.compte_id,
      langue: suivi.langue,
      pays: suivi.pays,
      application: entree.appli,
      publie_url: p.publie_url,
      vues_declenchement: vues,
      seuil_vues: seuil,
      age_minutes: ageMin,
      commentaire,
      traduction_en: traduction,
      slack_channel_id: region.slack_channel_id,
    })
    .select("id")
    .single();
  if (errIns && errIns.code !== "23505") throw errIns;
  await supabase.from("comment_master_suivis").update({ statut: "declenche", motif: null }).eq("passage_id", p.id);
  if (errIns) return false;

  return await envoyer(supabase, slack, {
    id: demande.id,
    langue: suivi.langue,
    pays: suivi.pays,
    handle: p.comptes.handle_tiktok,
    application: entree.appli,
    publie_url: p.publie_url,
    vues_declenchement: vues,
    age_minutes: ageMin,
    commentaire,
    traduction_en: traduction,
  }, region.slack_channel_id);
}

async function nomsApplications(supabase: Supabase): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("applications").select("id, nom");
  if (error) throw error;
  return new Map((data ?? []).map((a) => [a.id as string, a.nom as string]));
}

/** Ce que voit le modèle : la langue et le pays du compte, l'appli du post, ses slides et ses hashtags. */
function entreeCommentaire(
  p: { application_id: string | null; slides: unknown; hashtags: string | null },
  compte: { langue: string; pays: string | null; application_id: string | null },
  nomParId: Map<string, string>,
) {
  return {
    langue: compte.langue,
    pays: compte.pays,
    appli: nomAppli(nomParId.get(p.application_id ?? compte.application_id ?? "") ?? null),
    slides: ((p.slides ?? []) as Array<{ texte_overlay?: string }>)
      .map((s) => s.texte_overlay ?? "")
      .filter((t) => t.trim()),
    hashtags: p.hashtags,
  };
}

// ---------------------------------------------------------------------------
// Aperçu (bouton « Tester » d'Admin → Prompts)
// ---------------------------------------------------------------------------

/**
 * Les n derniers posts au-dessus du seuil de leur pays (vues relevées à J+2),
 * dans les régions actives — ou dans `langue` si elle est donnée, active ou
 * non, pour essayer le prompt avant d'ouvrir une région.
 */
async function apercuCommentaires(supabase: Supabase, n: number, modele: string, langue: string | null) {
  const [{ data: regions, error: errReg }, { data: pays, error: errPays }] = await Promise.all([
    supabase.from("comment_master_regions").select("langue, actif"),
    supabase.from("comment_master_pays").select("langue, pays, seuil_vues"),
  ]);
  if (errReg) throw errReg;
  if (errPays) throw errPays;
  const actives = (regions ?? []).filter((r) => r.actif).map((r) => r.langue as string);
  const langues = langue ? [langue] : actives.length ? actives : (regions ?? []).map((r) => r.langue as string);
  const seuils = new Map(
    ((pays ?? []) as SeuilPays[]).filter((p) => langues.includes(p.langue)).map((p) => [cleSeuil(p.langue, p.pays), p.seuil_vues]),
  );
  if (seuils.size === 0) return [];

  const { data, error } = await supabase
    .from("passages")
    .select(
      "id, application_id, publie_url, vues, slides, hashtags, comptes!inner(handle_tiktok, langue, pays, application_id)",
    )
    .eq("statut", "publie")
    .gte("vues", Math.min(...seuils.values()))
    .in("comptes.langue", langues)
    .order("publie_at", { ascending: false })
    .limit(300);
  if (error) throw error;

  // Les plus récents au-dessus du seuil de leur pays, en alternant les langues.
  const parLangue = new Map<string, Array<(typeof data)[number]>>();
  for (const p of data ?? []) {
    const c = p.comptes as unknown as { langue: string; pays: string | null };
    const seuil = seuils.get(cleSeuil(c.langue, c.pays));
    if (seuil === undefined || (p.vues ?? 0) < seuil) continue;
    parLangue.set(c.langue, [...(parLangue.get(c.langue) ?? []), p]);
  }
  const choisis: Array<(typeof data)[number]> = [];
  for (let i = 0; choisis.length < n && [...parLangue.values()].some((l) => l.length > i); i++) {
    for (const liste of parLangue.values()) if (liste[i] && choisis.length < n) choisis.push(liste[i]);
  }

  const nomParId = await nomsApplications(supabase);
  return await Promise.all(choisis.map(async (p) => {
    const compte = p.comptes as unknown as {
      handle_tiktok: string | null;
      langue: string;
      pays: string | null;
      application_id: string | null;
    };
    const entree = entreeCommentaire(p, compte, nomParId);
    const { commentaire, traduction } = await genererCommentaire(entree, modele);
    return {
      lien: p.publie_url,
      handle: compte.handle_tiktok,
      langue: compte.langue,
      pays: compte.pays,
      appli: entree.appli,
      vues: p.vues,
      accroche: entree.slides[0] ?? null,
      commentaire,
      traduction,
      problemes: problemesCommentaire(commentaire, entree.appli),
    };
  }));
}

async function genererCommentaire(
  input: { langue: string; pays: string | null; appli: string; slides: string[]; hashtags: string | null },
  modele: string,
): Promise<{ commentaire: string; traduction: string }> {
  const prompt = promptCommentaire(input, modele);
  let meilleur: { commentaire: string; traduction: string; problemes: number } | null = null;
  for (let i = 0; i < ESSAIS_GENERATION; i++) {
    const r = lireReponse(await genererTexte(prompt));
    if (!r) continue;
    const commentaire = r.comment.trim();
    const problemes = problemesCommentaire(commentaire, input.appli).length;
    if (!meilleur || problemes < meilleur.problemes) {
      meilleur = { commentaire, traduction: r.translation_en, problemes };
    }
    if (problemes === 0) break;
  }
  if (!meilleur) throw new Error("Gemini n'a renvoyé aucun commentaire lisible");
  return meilleur;
}

async function genererTexte(prompt: string): Promise<string> {
  const cle = Deno.env.get("GEMINI_API_KEY");
  if (!cle) throw new Error("GEMINI_API_KEY manquant");
  const echecs: string[] = [];
  for (const modele of MODELES_TEXTE) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cle}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, responseMimeType: "application/json" },
        }),
      },
    );
    if (!res.ok) {
      echecs.push(`${modele} ${res.status}: ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    const data = await res.json();
    const parts = (data?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string }>;
    return parts.map((p) => p.text ?? "").join("");
  }
  throw new Error(echecs.join(" | "));
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

async function slackApi(token: string, methode: string, corps: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${methode}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(corps),
  });
  return (await res.json()) as { ok: boolean; ts?: string; error?: string };
}

/**
 * Note sur la région l'erreur d'un canal inutilisable (bot pas membre, canal
 * supprimé…), pour que la page l'affiche ; l'efface au premier envoi réussi.
 */
async function noterErreurCanal(supabase: Supabase, langue: string, erreur: string | null) {
  if (erreur) {
    await supabase
      .from("comment_master_regions")
      .update({ slack_erreur: erreur, slack_erreur_at: new Date().toISOString() })
      .eq("langue", langue);
  } else {
    await supabase
      .from("comment_master_regions")
      .update({ slack_erreur: null, slack_erreur_at: null })
      .eq("langue", langue)
      .not("slack_erreur", "is", null);
  }
}

async function envoyer(supabase: Supabase, slack: string, d: DemandeSlack, canal: string): Promise<boolean> {
  const r = await slackApi(slack, "chat.postMessage", {
    channel: canal,
    text: texteNotification(d),
    blocks: blocsSlack(d),
    unfurl_links: false,
    unfurl_media: false,
  });
  await supabase
    .from("comment_master_demandes")
    .update(
      r.ok
        ? { statut: "envoye", slack_ts: r.ts, slack_channel_id: canal, envoye_at: new Date().toISOString(), erreur: null }
        : { erreur: `Slack: ${r.error}` },
    )
    .eq("id", d.id);
  if (r.ok) await noterErreurCanal(supabase, d.langue, null);
  else if (ERREURS_CANAL.has(r.error ?? "")) await noterErreurCanal(supabase, d.langue, r.error!);
  return r.ok;
}

/** Messages restés « à envoyer » (Slack en panne, canal mal réglé) : on retente tant que la demande a moins de 12 h. */
async function renvoyer(supabase: Supabase, slack: string): Promise<number> {
  const { data, error } = await supabase
    .from("comment_master_demandes")
    .select(
      "id, langue, pays, application, publie_url, vues_declenchement, age_minutes, commentaire, traduction_en, slack_channel_id, comptes(handle_tiktok)",
    )
    .eq("statut", "a_envoyer")
    .gte("created_at", new Date(Date.now() - 12 * 3600_000).toISOString());
  if (error) throw error;

  const { data: regions, error: errReg } = await supabase
    .from("comment_master_regions")
    .select("langue, slack_channel_id");
  if (errReg) throw errReg;
  // Le canal en place : un canal corrigé dans la page sert dès le renvoi suivant.
  const canalActuel = new Map((regions ?? []).map((r) => [r.langue as string, r.slack_channel_id as string | null]));

  let n = 0;
  for (const d of data ?? []) {
    const canal = canalActuel.get(d.langue) ?? d.slack_channel_id;
    if (!canal) continue;
    const ok = await envoyer(supabase, slack, {
      ...d,
      handle: (d.comptes as unknown as { handle_tiktok: string | null } | null)?.handle_tiktok ?? null,
      age_minutes: d.age_minutes ?? 0,
    } as DemandeSlack, canal);
    if (ok) n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Mesure des likes à 48 h
// ---------------------------------------------------------------------------

async function mesurer(supabase: Supabase, slack: string, debut: number) {
  const { data, error } = await supabase
    .from("comment_master_demandes")
    .select("id, publie_url, commentaire, envoye_at, slack_channel_id, slack_ts")
    .not("fait_at", "is", null)
    .is("mesure_at", null)
    .lte("fait_at", new Date(Date.now() - DELAI_MESURE_H * 3600_000).toISOString())
    .order("fait_at")
    .limit(MESURES_PAR_PASSAGE);
  if (error) throw error;

  let mesures = 0;
  const erreurs: string[] = [];
  for (const d of data ?? []) {
    // Un run synchrone de commentaires prend ~20 s : on n'en lance pas un de
    // trop près de la coupure, le passage suivant reprendra.
    if (Date.now() - debut > BUDGET_MS - 25_000) break;
    try {
      const commentaires = await scrapeCommentaires(await resoudreLien(d.publie_url), COMMENTAIRES_RELEVES);
      const trouve = retrouverCommentaire(commentaires, d.commentaire, d.envoye_at ?? new Date(0).toISOString());
      await supabase
        .from("comment_master_demandes")
        .update({
          mesure_at: new Date().toISOString(),
          mesure_statut: trouve ? "trouve" : "introuvable",
          mesure_nb_commentaires: commentaires.length,
          likes_commentaire: trouve?.likes ?? null,
          commentaire_cid: trouve?.cid ?? null,
          commentaire_auteur: trouve?.auteur ?? null,
          commentaire_poste: trouve?.texte ?? null,
        })
        .eq("id", d.id);
      if (d.slack_channel_id && d.slack_ts) {
        await slackApi(slack, "chat.postMessage", {
          channel: d.slack_channel_id,
          thread_ts: d.slack_ts,
          text: trouve
            ? `📊 ${DELAI_MESURE_H}h later: your comment has *${trouve.likes} like${trouve.likes === 1 ? "" : "s"}*.`
            : `📊 ${DELAI_MESURE_H}h later: I couldn't find this comment under the post (deleted, or changed a lot?).`,
        });
      }
      mesures += 1;
    } catch (error) {
      erreurs.push(`${d.id}: ${messageErreur(error)}`);
    }
  }
  return { mesures, ...(erreurs.length ? { erreurs } : {}) };
}

// ---------------------------------------------------------------------------
// Recalibrage du lundi
// ---------------------------------------------------------------------------

/**
 * Le lundi (heure de Paris), une fois : chaque pays sans cadenas avec assez de
 * posts suivis jusqu'au bout sur 4 semaines est rapproché de ~1 post sur 20
 * qui déclenche. Le journal des seuils garde chaque changement (trigger).
 */
async function recalibrerSiLundi(supabase: Supabase) {
  const jour = aujourdhuiParis();
  if (!estLundi(jour)) return null;
  const { data: dernier, error: errDernier } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", CLE_RECALIBRAGE)
    .maybeSingle();
  if (errDernier) throw errDernier;
  if ((dernier?.valeur as { jour?: string } | null)?.jour === jour) return null;

  const depuis = new Date(Date.now() - JOURS_RECALIBRAGE * 24 * 3600_000).toISOString();
  const [{ data: taux, error: errTaux }, { data: pays, error: errPays }] = await Promise.all([
    supabase.rpc("comment_masters_taux_pays", { p_depuis: depuis }),
    supabase.from("comment_master_pays").select("langue, pays, seuil_vues, verrou"),
  ]);
  if (errTaux) throw errTaux;
  if (errPays) throw errPays;
  const parCle = new Map(
    ((taux ?? []) as Array<{ langue: string; pays: string; conclus: number; declenches: number }>)
      .map((t) => [cleSeuil(t.langue, t.pays), t]),
  );

  const changements: Array<Record<string, unknown>> = [];
  let ignores = 0;
  for (const p of (pays ?? []) as Array<SeuilPays & { verrou: boolean }>) {
    if (p.verrou) continue;
    const t = parCle.get(cleSeuil(p.langue, p.pays));
    const r = seuilRecalibre(p.seuil_vues, t?.conclus ?? 0, t?.declenches ?? 0);
    if (r.raison === "echantillon") ignores += 1;
    if (r.raison !== "ajuste") continue;
    const detail = { taux: r.taux, facteur: r.facteur, conclus: t!.conclus, declenches: t!.declenches, jours: JOURS_RECALIBRAGE };
    const { error } = await supabase
      .from("comment_master_pays")
      .update({ seuil_vues: r.seuil, seuil_source: "auto", seuil_detail: detail })
      .eq("langue", p.langue)
      .eq("pays", p.pays)
      .eq("verrou", false);
    if (error) throw error;
    changements.push({ langue: p.langue, pays: p.pays, ancien: p.seuil_vues, nouveau: r.seuil, ...detail });
  }

  const valeur = { jour, at: new Date().toISOString(), changements, echantillon_insuffisant: ignores };
  const { error } = await supabase
    .from("reglages")
    .upsert({ cle: CLE_RECALIBRAGE, valeur, updated_at: new Date().toISOString() }, { onConflict: "cle" });
  if (error) throw error;
  return valeur;
}

// ---------------------------------------------------------------------------
// Actions de la page : vérifier un canal, allumer / éteindre une région
// ---------------------------------------------------------------------------

/**
 * Le bot peut-il poster dans le canal de la région ? Écrit le verdict sur la
 * région : canal vérifié, ou code d'erreur Slack affiché par la page. Un canal
 * devenu inutilisable perd sa vérification, ce qui éteint une région active
 * (trigger de 0321) : elle ne paierait plus que des relevés sans destinataire.
 */
async function verifierCanal(supabase: Supabase, slack: string, langue: string) {
  const { data: region, error } = await supabase
    .from("comment_master_regions")
    .select("langue, slack_channel_id")
    .eq("langue", langue)
    .single();
  if (error) throw error;

  const bot = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: { authorization: `Bearer ${slack}` },
  }).then((r) => r.json() as Promise<{ ok: boolean; user?: string }>).catch(() => ({ ok: false, user: undefined }));
  const nomBot = bot.ok ? bot.user ?? null : null;

  if (!region.slack_channel_id) {
    return { ok: false, code: "canal_absent", bot: nomBot };
  }
  const reponse = await fetch(
    `https://slack.com/api/conversations.info?channel=${encodeURIComponent(region.slack_channel_id)}`,
    { headers: { authorization: `Bearer ${slack}` } },
  ).then((r) => r.json());
  const verdict = verdictCanal(reponse);
  const maintenant = new Date().toISOString();

  if (verdict.ok) {
    const { error: errMaj } = await supabase
      .from("comment_master_regions")
      .update({
        slack_verifie_canal: region.slack_channel_id,
        slack_verifie_at: maintenant,
        slack_canal_nom: verdict.nom,
        slack_erreur: null,
        slack_erreur_at: null,
      })
      .eq("langue", langue);
    if (errMaj) throw errMaj;
    return { ok: true, canal: verdict.nom, bot: nomBot };
  }

  const definitif = ERREURS_CANAL.has(verdict.code.split(":")[0]);
  const { error: errMaj } = await supabase
    .from("comment_master_regions")
    .update({
      slack_erreur: verdict.code,
      slack_erreur_at: maintenant,
      ...(definitif ? { slack_verifie_canal: null, slack_verifie_at: null } : {}),
    })
    .eq("langue", langue);
  if (errMaj) throw errMaj;
  return { ok: false, code: verdict.code, bot: nomBot };
}

async function activerRegion(supabase: Supabase, slack: string, langue: string, actif: boolean) {
  if (!actif) {
    const { error } = await supabase.from("comment_master_regions").update({ actif: false }).eq("langue", langue);
    if (error) throw error;
    return { ok: true, actif: false };
  }

  const { data: region, error } = await supabase
    .from("comment_master_regions")
    .select("comment_master_id, slack_channel_id")
    .eq("langue", langue)
    .single();
  if (error) throw error;
  if (!region.comment_master_id) return { ok: false, code: "comment_master_absent" };

  // Toujours revérifier au moment d'allumer : le bot a pu quitter le canal.
  const verif = await verifierCanal(supabase, slack, langue);
  if (!verif.ok) return { ...verif, actif: false };

  const { error: errMaj } = await supabase.from("comment_master_regions").update({ actif: true }).eq("langue", langue);
  if (errMaj) throw errMaj;
  return { ok: true, actif: true, canal: verif.canal };
}

/**
 * Lien COURT (vm./vt.tiktok.com, bouton « Partager ») → URL complète avec l'ID
 * numérique, en suivant la redirection. Même logique que `metriques`.
 */
async function resoudreLien(url: string): Promise<string> {
  if (!/\/\/(?:vm|vt)\.tiktok\.com/i.test(url)) return url;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      },
    });
    return res.url || url;
  } catch {
    return url;
  }
}
