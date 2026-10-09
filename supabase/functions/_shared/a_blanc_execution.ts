/**
 * Test à blanc — l'exécution : le VRAI code de la nuit pour un compte, puis la
 * reconstruction de ce qu'il aurait produit.
 *
 * Référence : la nuit passe par le drain (`assignerDrainLot`) : pré-filtre
 * `listerComptesSousQuota`, puis `assignerCompteJour` avec { forcer: false,
 * test: false, ignorerTierlist: false, échéance de cuisson du lot }, puis le
 * journal. Pour un compte seul, `assignerTousComptes(…, compteId, …)` fait la
 * même chose (mêmes réglages, même `select("*")` du compte, même
 * `assignerCompteJour`, même journal) : c'est lui qu'on rejoue, avec la même
 * échéance que le drain et `ignorerWarmup` (qui ne touche QUE le filtre
 * warmup). Ce que le drain ferait de différent est relu à part, en lecture
 * seule, et dit dans « la nuit ne servirait pas ce compte » : la pause
 * `assignation_auto`, le pré-filtre des posts du jour, le warmup.
 *
 * Tout tourne dans le contexte du test (a_blanc_intercepteur.ts) : aucune
 * écriture ne part, et les lignes « créées » n'existent que dans le calque,
 * d'où on les relit pour l'écran.
 */

import {
  assignerTousComptes,
  type AssignationCompteResultat,
  BUDGET_DECKS_APPLICATION_MS,
  listerComptesSousQuota,
  type Supabase,
} from "./assignation_contenu.ts";
import { ID_SOPHIA } from "./multi_app.ts";
import { messageErreur } from "./supabase.ts";
import { VUE_TIER_APPLICATION } from "./tiers_application.ts";
import type { Ligne } from "./a_blanc_postgrest.ts";
import {
  type ContexteABlanc,
  type EtatABlanc,
  intercepteurActif,
  type MotifBlocage,
  type NoteDeck,
  type OperationEcriture,
} from "./a_blanc_intercepteur.ts";

/**
 * Une clé passée en paramètre d'URL (`?key=…`) ne sort jamais dans le flux.
 * Les erreurs réseau de Deno citent l'URL complète (« error sending request
 * for url (…:generateContent?key=…) ») ; `callWithFallback` les agrège, et
 * elles remonteraient jusqu'à l'écran par la raison d'un deck ou les logs.
 */
const CLE_URL = /([?&](?:key|apikey|api_key|token)=)[^&\s)"'\\]+/gi;
export function masquerSecrets<T>(valeur: T): T {
  try {
    return JSON.parse(JSON.stringify(valeur).replace(CLE_URL, "$1***")) as T;
  } catch {
    return valeur;
  }
}

/** Jour Paris de demain (YYYY-MM-DD) : le jour que prépare la nuit qui vient. */
export function demainParis(maintenant: Date = new Date()): string {
  const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(maintenant);
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Fenêtres (UTC) où la case IA est refusée : la nuit (cron 22:00 UTC + drain)
 * et le rattrapage (cron 04:00 UTC + drain). Les appels du test partagent la
 * clé Gemini de la nuit : lancés pendant le drain, ils pourraient lui coûter
 * des 429, donc des decks en échec et des replis RÉELS. C'est la seule voie
 * par laquelle un test à blanc pourrait changer une issue en production.
 */
const FENETRES_NUIT_UTC: ReadonlyArray<[number, number]> = [
  [21 * 60 + 45, 24 * 60],
  [0, 30],
  [3 * 60 + 45, 5 * 60 + 30],
];
/** Un run de minuit (ou un lot du drain) plus récent que ça : IA refusée. */
const DELAI_APRES_RUN_MS = 30 * 60 * 1000;

export function raisonRefusIA(maintenant: Date, dernierRunAt: string | null): string | null {
  const minutes = maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes();
  if (FENETRES_NUIT_UTC.some(([de, a]) => minutes >= de && minutes < a)) {
    return "Option IA refusée pendant la nuit (assignation de minuit et rattrapage de 4 h, heure UTC) : " +
      "les appels du test partagent le quota du modèle avec la nuit. Relance sans l'IA, ou plus tard.";
  }
  const at = dernierRunAt ? Date.parse(dernierRunAt) : NaN;
  if (Number.isFinite(at) && maintenant.getTime() - at >= 0 && maintenant.getTime() - at < DELAI_APRES_RUN_MS) {
    return "Option IA refusée : une assignation de minuit a tourné il y a moins de 30 min (drain peut-être en cours). " +
      "Relance sans l'IA, ou plus tard.";
  }
  return null;
}

export type MotifNuit =
  | "inactif"
  | "pause"
  | "quota_nuit"
  | "warmup_non_demarre"
  | "warmup_en_cours"
  | "cm"
  | "ugc_video"
  | "videos_uniquement";

export interface SlideSimulee {
  position: number;
  texte: string;
  pub: boolean;
  mediaId: string | null;
  mediaUrl: string | null;
  referenceUrl: string | null;
}

export interface CreneauSimule {
  rang: number;
  /** Id FICTIF : n'existe nulle part en base. */
  passageId: string;
  /** Id FICTIF, ou null si la matérialisation n'a pas eu lieu. */
  postId: string | null;
  contenu: { id: string; titre: string | null; tier: string | null; tierCycle: number | null; repeche: boolean };
  application: { id: string; slug: string | null; nom: string | null };
  visee?: { id: string; slug: string | null; nom: string | null; motif: string | null };
  langue: string;
  slides: SlideSimulee[];
  slidePub: number | null;
  hashtags: string;
  musique: { titre: string | null; url: string | null; plateforme: string | null } | null;
  deck: {
    origine: NoteDeck["origine"] | "inconnue";
    besoin?: string;
    fabrication?: string[];
    hashtagsStatiques: boolean;
    appelsIA: { autorises: number; bloques: number };
  };
  faceSwap?: { appelsBloques: number };
}

export interface ResultatABlanc {
  aBlanc: true;
  jour: string;
  ia: boolean;
  dureeMs: number;
  resume: string;
  erreurRun?: string;
  compte: { id: string; nom: string; langue: string | null; quota: number | null; actif: boolean; ugc: boolean } | null;
  laNuit: {
    servirait: boolean;
    motifs: MotifNuit[];
    postsDuJour?: number;
    quota?: number;
  };
  resultat: {
    crees: number;
    raison?: string;
    erreur?: string;
    quotaBaisse?: { avant: number; apres: number; raison: string; simule: true };
    replis?: Array<{ visee: string; motif: string }>;
    nonServable?: boolean;
  };
  creneaux: CreneauSimule[];
  decksEcartes: NoteDeck[];
  ecrituresEvitees: Array<{ table: string; operation: OperationEcriture; requetes: number; lignes: number | null }>;
  appelsBloques: Array<{ hote: string; motif: MotifBlocage; nombre: number }>;
  appelsIA: { autorises: number; bloques: number };
  lectures: number;
  limites: string[];
}

/** Ce que la simulation ne rejoue pas — toujours affiché. */
export const LIMITES_FIXES: readonly string[] = [
  "Rappels J+7 non rejoués : la nuit les programme avant l'assignation, et un rappel prend un créneau du quota du jour.",
  "Requalification tierlist et rattrapage des stats de minuit non rejoués : tiers et budgets sont ceux d'aujourd'hui.",
  "Upscale des médias assignés non simulé (étape suivante de la nuit).",
  "Flotte non simulée : la nuit, ce compte est servi dans un lot de 8, avec un budget de cuisson de 60 s et un compteur d'échecs de deck PARTAGÉS, et d'autres comptes peuvent repêcher les mêmes contenus. Le test a un budget neuf : il est plus optimiste pour les autres applications (moins de replis « budget » ou « deck_echec »).",
  "File du drain : la nuit sert les comptes par lots dans l'ordre de la base ; un compte peut n'être servi qu'au rattrapage de 4 h.",
  "Tirage aléatoire dans une bande de tier : relancer le test peut montrer un autre contenu.",
  "Vues contenu_tier_etat et contenu_application_tier_etat non recalculées après les écritures simulées (sans effet pour un compte : un contenu déjà pris est exclu de la suite du tirage).",
];

export const LIMITE_IA_DECOCHEE =
  "IA décochée : un deck « à fabriquer » est un APERÇU (texte source ou base, sans la slide pub) ; les écritures que ferait sa fabrication (ligne langue, traduction, slide pub, hashtags, cache de deck) sont listées à part et ne figurent pas dans les écritures évitées.";

function nombre(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : n;
}

function texte(v: unknown): string | null {
  return typeof v === "string" ? v : v === null || v === undefined ? null : String(v);
}

/**
 * Reconstruit le résultat du test depuis l'état de l'intercepteur. PURE (aucune
 * lecture) : les titres, tiers, noms d'application et URL de médias sont
 * ajoutés ensuite par `enrichirAffichage`.
 */
export function construireResultat(
  etat: EtatABlanc,
  args: {
    jour: string;
    ia: boolean;
    debut: number;
    compte: ResultatABlanc["compte"];
    laNuit: ResultatABlanc["laNuit"];
    r0?: AssignationCompteResultat;
    erreurRun?: string;
  },
): ResultatABlanc {
  const r0 = args.r0;
  const passageIds = r0?.passageIds ?? [];
  const insertsPassages = etat.journal.filter((e) => e.table === "passages" && e.operation === "insert");
  const seqInsert = (id: string) => insertsPassages.find((e) => e.cles.some((c) => c.id === id))?.seq ?? null;
  const seqs = passageIds.map(seqInsert);
  const postSlides = etat.calque.lignesInserees("post_slides");

  const creneaux: CreneauSimule[] = [];
  passageIds.forEach((id, i) => {
    const p = etat.calque.inseree("passages", id);
    if (!p) return;
    const contenuId = String(p.contenu_id ?? "");
    const langue = String(p.langue ?? "");
    const postId = texte(p.post_id);
    const slidesDeck = (Array.isArray(p.slides) ? p.slides : []) as Array<Ligne>;
    const slidesPost = postSlides
      .filter((s) => postId !== null && s.post_id === postId)
      .sort((a, b) => Number(a.position) - Number(b.position));
    const parPos = new Map(slidesPost.map((s) => [Number(s.position), s]));
    const slides: SlideSimulee[] = [...slidesDeck]
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((s) => {
        const ps = parPos.get(Number(s.position));
        return {
          position: Number(s.position),
          texte: String(s.texte_overlay ?? ""),
          pub: Boolean(s.position_sophia),
          mediaId: texte(ps?.media_id ?? s.media_id ?? null),
          mediaUrl: null,
          referenceUrl: texte(ps?.reference_url ?? null),
        };
      });
    const note = [...etat.decks].reverse().find((n) => n.contenuId === contenuId && n.langue === langue);
    const repeche = etat.journal.some((e) =>
      e.operation === "update" && (e.lignes ?? 0) > 0 &&
      ((e.table === "contenus" && e.cles.some((c) => c.id === contenuId)) ||
        (e.table === "contenu_tiers_application" && e.cles.some((c) => c.contenu_id === contenuId)))
    );
    const debutSeq = seqs[i];
    const finSeq = seqs.slice(i + 1).find((s) => s !== null) ?? Number.POSITIVE_INFINITY;
    const swaps = debutSeq === null ? 0 : etat.bloques.filter((b) =>
      /(^|\.)fal\.(run|ai|media)$/.test(b.hote) && b.seq > debutSeq && b.seq < finSeq
    ).length;
    const applicationId = texte(p.application_id) ?? ID_SOPHIA;
    const viseeId = texte(p.application_visee_id);
    creneaux.push({
      rang: i + 1,
      passageId: id,
      postId,
      contenu: { id: contenuId, titre: null, tier: null, tierCycle: nombre(p.tier_cycle), repeche },
      application: { id: applicationId, slug: null, nom: null },
      ...(viseeId ? { visee: { id: viseeId, slug: null, nom: null, motif: texte(p.repli_motif) } } : {}),
      langue,
      slides,
      slidePub: slides.find((s) => s.pub)?.position ?? null,
      hashtags: String(p.hashtags ?? ""),
      musique: p.musique_url || p.musique_titre
        ? { titre: texte(p.musique_titre), url: texte(p.musique_url), plateforme: texte(p.musique_plateforme) }
        : null,
      deck: {
        origine: note?.origine ?? "inconnue",
        ...(note?.besoin ? { besoin: note.besoin } : {}),
        ...(note?.fabrication?.length ? { fabrication: note.fabrication } : {}),
        hashtagsStatiques: note?.hashtagsIA === "bloques",
        appelsIA: { ...(note?.appelsIA ?? { autorises: 0, bloques: 0 }) },
      },
      ...(swaps > 0 ? { faceSwap: { appelsBloques: swaps } } : {}),
    });
  });

  const contenusCreneaux = new Set(creneaux.map((c) => c.contenu.id));
  const decksEcartes = etat.decks.filter((n) => !contenusCreneaux.has(n.contenuId));

  const ecritures = new Map<string, ResultatABlanc["ecrituresEvitees"][number]>();
  for (const e of etat.journal) {
    const cle = `${e.table}|${e.operation}`;
    const agg = ecritures.get(cle) ?? { table: e.table, operation: e.operation, requetes: 0, lignes: 0 };
    agg.requetes += 1;
    agg.lignes = agg.lignes === null || e.lignes === null ? null : agg.lignes + e.lignes;
    ecritures.set(cle, agg);
  }
  const blocages = new Map<string, ResultatABlanc["appelsBloques"][number]>();
  for (const b of etat.bloques) {
    const cle = `${b.hote}|${b.motif}`;
    const agg = blocages.get(cle) ?? { hote: b.hote, motif: b.motif, nombre: 0 };
    agg.nombre += 1;
    blocages.set(cle, agg);
  }

  const crees = r0?.crees ?? 0;
  const resultat: ResultatABlanc["resultat"] = {
    crees,
    ...(r0?.raison ? { raison: r0.raison } : {}),
    ...(r0?.erreur ? { erreur: r0.erreur } : {}),
    ...(r0?.quotaBaisse
      ? {
        quotaBaisse: {
          avant: r0.quotaBaisse.avant,
          apres: r0.quotaBaisse.apres,
          raison: r0.quotaBaisse.raison,
          simule: true as const,
        },
      }
      : {}),
    ...(r0?.replis?.length ? { replis: r0.replis.map((x) => ({ visee: x.visee, motif: x.motif })) } : {}),
    ...(r0?.nonServable ? { nonServable: true } : {}),
  };
  const sansEcriture = "rien n'a été écrit";
  const resume = args.erreurRun
    ? `Test interrompu : ${args.erreurRun} — ${sansEcriture}`
    : crees > 0
    ? `${crees} créneau(x) simulé(s) — ${sansEcriture}`
    : `${r0?.erreur ?? r0?.raison ?? "Aucun créneau simulé"} — ${sansEcriture}`;

  return {
    aBlanc: true,
    jour: args.jour,
    ia: args.ia,
    dureeMs: Date.now() - args.debut,
    resume,
    ...(args.erreurRun ? { erreurRun: args.erreurRun } : {}),
    compte: args.compte,
    laNuit: args.laNuit,
    resultat,
    creneaux,
    decksEcartes,
    ecrituresEvitees: [...ecritures.values()],
    appelsBloques: [...blocages.values()],
    appelsIA: { ...etat.compteurIA },
    lectures: etat.lectures,
    limites: [
      ...etat.limites,
      ...LIMITES_FIXES,
      ...(args.ia ? [] : [LIMITE_IA_DECOCHEE]),
    ],
  };
}

/** Lectures d'affichage (titres, tiers, applications, vignettes), dans le contexte du test. */
async function enrichirAffichage(supabase: Supabase, r: ResultatABlanc): Promise<void> {
  const noter = (quoi: string, e: unknown) =>
    r.limites.unshift(`Affichage incomplet (${quoi}) : ${messageErreur(e)}`);
  const contenuIds = [...new Set([...r.creneaux.map((c) => c.contenu.id), ...r.decksEcartes.map((d) => d.contenuId)])]
    .filter(Boolean)
    .slice(0, 100);
  try {
    if (contenuIds.length > 0) {
      const { data, error } = await supabase.from("contenus").select("id, titre").in("id", contenuIds);
      if (error) throw error;
      const titres = new Map((data ?? []).map((c) => [String(c.id), texte(c.titre)]));
      for (const c of r.creneaux) c.contenu.titre = titres.get(c.contenu.id) ?? null;
    }
  } catch (e) {
    noter("titres", e);
  }
  try {
    const sophia = r.creneaux.filter((c) => c.application.id === ID_SOPHIA).map((c) => c.contenu.id);
    if (sophia.length > 0) {
      const { data, error } = await supabase.from("contenu_tier_etat").select("contenu_id, tier").in("contenu_id", sophia);
      if (error) throw error;
      const tiers = new Map((data ?? []).map((t) => [String(t.contenu_id), texte(t.tier)]));
      for (const c of r.creneaux) if (c.application.id === ID_SOPHIA) c.contenu.tier = tiers.get(c.contenu.id) ?? null;
    }
    const autres = r.creneaux.filter((c) => c.application.id !== ID_SOPHIA);
    for (const appId of new Set(autres.map((c) => c.application.id))) {
      const ids = autres.filter((c) => c.application.id === appId).map((c) => c.contenu.id);
      const { data, error } = await supabase
        .from(VUE_TIER_APPLICATION)
        .select("contenu_id, tier")
        .eq("application_id", appId)
        .in("contenu_id", ids);
      if (error) throw error;
      const tiers = new Map((data ?? []).map((t) => [String(t.contenu_id), texte(t.tier)]));
      for (const c of autres) if (c.application.id === appId) c.contenu.tier = tiers.get(c.contenu.id) ?? null;
    }
  } catch (e) {
    noter("tiers", e);
  }
  try {
    const { data, error } = await supabase.from("applications").select("id, slug, nom").limit(100);
    if (error) throw error;
    const apps = new Map((data ?? []).map((a) => [String(a.id), { slug: texte(a.slug), nom: texte(a.nom) }]));
    for (const c of r.creneaux) {
      const a = apps.get(c.application.id) ?? (c.application.id === ID_SOPHIA ? { slug: "sophia", nom: "Sophia" } : null);
      if (a) c.application = { id: c.application.id, ...a };
      if (c.visee) {
        const v = apps.get(c.visee.id);
        if (v) c.visee = { ...c.visee, ...v };
      }
    }
  } catch (e) {
    for (const c of r.creneaux) {
      if (c.application.id === ID_SOPHIA) c.application = { id: ID_SOPHIA, slug: "sophia", nom: "Sophia" };
    }
    noter("applications", e);
  }
  try {
    const mediaIds = [...new Set(r.creneaux.flatMap((c) => c.slides.map((s) => s.mediaId)).filter((m): m is string => !!m))]
      .slice(0, 300);
    for (let i = 0; i < mediaIds.length; i += 100) {
      const { data, error } = await supabase.from("media_library").select("id, url").in("id", mediaIds.slice(i, i + 100));
      if (error) throw error;
      const urls = new Map((data ?? []).map((m) => [String(m.id), texte(m.url)]));
      for (const c of r.creneaux) {
        for (const s of c.slides) if (s.mediaId && urls.has(s.mediaId)) s.mediaUrl = urls.get(s.mediaId) ?? null;
      }
    }
  } catch (e) {
    noter("vignettes", e);
  }
}

/**
 * Le test à blanc d'un compte. À appeler DANS le contexte `ctx` (nature run),
 * avec un client créé dans ce contexte. Lève seulement si l'interception n'est
 * pas prouvée active — AVANT toute étape ; toute autre erreur est rendue dans
 * le résultat (`erreurRun`), journal compris.
 */
export async function executerAssignationABlanc(
  supabase: Supabase,
  ctx: ContexteABlanc,
  args: { compteId: string; jour: string; ia: boolean; onLog?: (detail: string) => void },
): Promise<ResultatABlanc> {
  const debut = Date.now();
  const etat = ctx.etat;
  const log = (detail: string) => {
    try {
      args.onLog?.(detail);
    } catch {
      // un flux fermé n'arrête pas le test
    }
  };

  // a. SONDE : l'intercepteur est posé ET cette lecture est passée par lui.
  if (!intercepteurActif()) {
    throw new Error("Interception inactive : test annulé avant toute étape (rien n'a été lancé).");
  }
  const avant = etat.lectures;
  const sonde = await supabase.from("comptes").select("id").eq("id", args.compteId).limit(1);
  if (!intercepteurActif() || etat.lectures === avant) {
    throw new Error("Interception inactive : test annulé avant toute étape (rien n'a été lancé).");
  }
  const fin = (
    p: Partial<Pick<Parameters<typeof construireResultat>[1], "compte" | "laNuit" | "r0" | "erreurRun">>,
  ) =>
    construireResultat(etat, {
      jour: args.jour,
      ia: args.ia,
      debut,
      compte: p.compte ?? null,
      laNuit: p.laNuit ?? { servirait: false, motifs: [] },
      r0: p.r0,
      erreurRun: p.erreurRun,
    });
  if (sonde.error) return fin({ erreurRun: `lecture de sonde : ${messageErreur(sonde.error)}` });

  // b. Option IA : refusée pendant la nuit (quota du modèle partagé).
  if (args.ia) {
    const { data: run } = await supabase.from("reglages").select("valeur").eq("cle", "minuit_dernier_run").maybeSingle();
    const at = (run?.valeur as { at?: string } | null)?.at ?? null;
    const refus = raisonRefusIA(new Date(), at);
    if (refus) return fin({ erreurRun: refus });
  }

  // c. Le compte, et ce que la nuit en ferait.
  const { data: compte, error: errCompte } = await supabase.from("comptes").select("*").eq("id", args.compteId).maybeSingle();
  if (errCompte) return fin({ erreurRun: `lecture du compte : ${messageErreur(errCompte)}` });
  if (!compte) return fin({ erreurRun: "Compte introuvable" });
  const c = compte as Record<string, unknown>;
  const resume: ResultatABlanc["compte"] = {
    id: String(c.id),
    nom: String(c.persona_nom ?? c.handle_tiktok ?? String(c.id).slice(0, 8)),
    langue: texte(c.langue),
    quota: nombre(c.posts_par_jour),
    actif: Boolean(c.is_active),
    ugc: Boolean(c.ugc_ai) && !c.ugc_ai_video,
  };
  const motifs: MotifNuit[] = [];
  const laNuit: ResultatABlanc["laNuit"] = { servirait: true, motifs };
  if (!c.is_active) motifs.push("inactif");
  if (c.type_compte === "cm") motifs.push("cm");
  if (c.ugc_ai_video) motifs.push("ugc_video");
  if (c.videos_uniquement) motifs.push("videos_uniquement");
  const warmup = texte(c.warmup_ends_at);
  if (!warmup) motifs.push("warmup_non_demarre");
  else if (new Date(warmup).getTime() > Date.now()) motifs.push("warmup_en_cours");
  try {
    const { data: pause } = await supabase.from("reglages").select("valeur").eq("cle", "assignation_auto").maybeSingle();
    if ((pause?.valeur as { actif?: boolean } | null)?.actif === false) motifs.push("pause");
  } catch (e) {
    etat.limites.add(`Pause assignation_auto illisible : ${messageErreur(e)}`);
  }
  // Pré-filtre du drain : la nuit ne sert que les comptes dont les POSTS du
  // jour (hors test, coquilles comprises) sont sous le quota — AVANT la purge
  // que fait ensuite assignerCompteJour.
  if (c.is_active && !motifs.some((m) => m === "cm" || m === "ugc_video" || m === "videos_uniquement")) {
    try {
      const sousQuota = await listerComptesSousQuota(supabase, args.jour, { ignorerWarmup: true });
      if (!sousQuota.some((x) => x.id === args.compteId)) {
        motifs.push("quota_nuit");
        const { count } = await supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("compte_id", args.compteId)
          .eq("date_publication_prevue", args.jour)
          .eq("est_test", false);
        laNuit.postsDuJour = count ?? undefined;
        const brut = Number(c.posts_par_jour ?? 1);
        laNuit.quota = !Number.isFinite(brut) ? 1 : Math.min(3, Math.max(1, Math.round(brut)));
      }
    } catch (e) {
      etat.limites.add(`Pré-filtre du drain (posts du jour sous quota) illisible : ${messageErreur(e)}`);
    }
  }
  laNuit.servirait = motifs.length === 0;
  if (motifs.length > 0) log(`La nuit ne servirait pas ce compte : ${motifs.join(", ")}`);

  if (!c.is_active) {
    return fin({
      compte: resume,
      laNuit,
      r0: { compteId: args.compteId, crees: 0, raison: "Compte inactif — la nuit ne l'assigne pas." },
    });
  }
  if (!laNuit.servirait) log("Simulation faite quand même, comme si la nuit le servait.");

  // d. LE VRAI CODE DE LA NUIT, pour ce compte.
  let resultats: AssignationCompteResultat[] = [];
  let erreurRun: string | undefined;
  try {
    resultats = await assignerTousComptes(supabase, args.jour, args.compteId, {
      forcer: false,
      test: false,
      ignorerTierlist: false,
      ignorerWarmup: true,
      echeance: Date.now() + BUDGET_DECKS_APPLICATION_MS,
      onLog: log,
    });
  } catch (e) {
    erreurRun = messageErreur(e);
    log(`Erreur : ${erreurRun}`);
  }

  // e. Ce qu'elle aurait produit.
  const r = fin({ compte: resume, laNuit, r0: resultats[0], erreurRun });
  await enrichirAffichage(supabase, r);
  r.dureeMs = Date.now() - debut;
  return r;
}
