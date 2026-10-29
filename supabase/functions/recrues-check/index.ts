import { dansFenetre, type Delais, instantLocal, lireMode, lundiParis, partiesLocales, rappelsEnPause } from "../_shared/relances.ts";
import { automationEnPause, noterBloquee, PAUSE } from "../_shared/pause.ts";
import { passageDu } from "../_shared/frequences.ts";
import {
  libelleCanaux,
  MOT_DE_PASSE_DEPART,
  type DelaisAccueil,
  deciderEtape,
  envoiEtape,
  type EtapeAccueil,
  type EtatAccueil,
  debutCohorte,
  etapeRouge,
  etatsAccueil,
  killEnCours,
  killEtape,
  lireDelaisAccueil,
  nuitDuRouge,
  type RecrueAccueil,
} from "../_shared/etapes.ts";
import { GUIDE_POSTER, lireModeAuto, messageAccueil, type ModeAuto } from "../_shared/accueil.ts";
import {
  type Canal,
  canalUnique,
  canauxMessage,
  cleServi,
  clesPersonne,
  decisionRattrapage,
  estLimiteUpwork,
  prioriteUpwork,
  trierFile,
  upworkAccorde,
} from "../_shared/garde_fous.ts";
import { type ElementRelance, planRelance, type TextesRelance, TEXTES_RELANCE_DEFAUT, texteRelance } from "../_shared/relance_jour.ts";
import {
  ceQuiManqueRecrue,
  killLundiSoir,
  lundiDu,
  lundiSoirDu,
  type PosteurLundiSoir,
  type PosteurSemaine,
  reactionLundiSoir,
  texteLundi,
  texteLundiSoir,
} from "../_shared/semaine.ts";
import {
  BOUTONS,
  blocsBoutons,
  type LibellesBoutons,
  lireLibellesBoutons,
  boutonDeSource,
  type CanalReponse,
  type Classement,
  construirePromptReponse,
  lireClassement,
  planReponse,
  REGLAGES_REPONSES_DEFAUT,
  type ReglagesReponses,
} from "../_shared/reponses.ts";
import { chargerBase } from "../_shared/faq_moteur.ts";
import { generateTextFast } from "../_shared/gemini.ts";
import { lireProfilTiktok } from "../_shared/profil_tiktok.ts";
import { jetonLectureSlack, synchroniser } from "../_shared/slack_relier.ts";
import { ecrireAuPosteur } from "../_shared/slack_posteur.ts";
import { construirePromptContestation, lireContestation, texteAccuse } from "../_shared/contestations.ts";
import { assertRole, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

const OS_URL = "https://sophia-marketing-orga.vercel.app";

/**
 * recrues-check — une seule relance par étape (prompt 17 A, 0391), et depuis
 * le système du 2 nov. (partie B, 0402) les 4 étapes de l'accueil et le Kill
 * automatique à 48 h.
 *
 *   { action: "verifier" }   cron `recrues-check`, minute 10 de chaque heure ; admin
 *       1. note les 1res connexions (relances_noter_connexions) ;
 *       2. les 4 étapes des recrues (connexion, tiktok, warmup_lance,
 *          warmup_bien_fait) : un message par étape (Slack si relié, sinon
 *          Upwork, 10 h-20 h heure du pays) ; avant un message, liaison Slack
 *          relancée (une fois par passage) et profil TikTok relu ;
 *       3. selon `relances_auto` : off → rien ; test → `relances_prevues`
 *          (« ✉ prévu »), rien ne part ; on → la ligne `nudges` d'abord (index
 *          unique : une seule relance même si deux passages se croisent), puis
 *          l'envoi (Slack, ou Upwork par la fonction `upwork`) ;
 *       4. 48 h après le message, ni étape faite ni réponse : Kill (`kills_auto`,
 *          selon `kill_auto` : test → « simulé » ; on → annulable 12 h, puis
 *          la file `arrets`, partie C) ; dimanche minuit, une étape pas faite :
 *          rouge (pas de posts lundi), effacé dès que tout est fait ;
 *       5. partie D (0404) : le message du lundi 10 h (`lundi_message_auto`)
 *          et le Nudge du jeudi 12 h (posts ou liens manquants de lundi à
 *          mercredi, `relances_auto`), heure du pays ; les inactifs.
 *   { action: "reponses" }   cron `reponses`, toutes les 10 minutes ; admin
 *       Partie E (0406) : les messages reçus des posteurs (Slack, boutons,
 *       Upwork) sont classés (IA, seuil 0,8) puis traités selon
 *       `reponses_auto` : réponse, arrêt, pause, ou listes « Questions de
 *       paie » et « À lire ».
 * Jamais de nouvel essai d'envoi : un échec est noté sur la relance.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    // Prompt 21, R : « Reply » sur Disputes est ouvert au Head of Ops ; le reste : admin.
    const acces = await assertRole(request, ["admin", "head_of_ops"]);
    if (acces instanceof Response) return acces;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      id?: string;
      texte?: string;
      contrat_id?: string;
      prenom?: string;
      poster_id?: string;
      quoi?: string;
    };
    if (body.action === "contestation_repondre") {
      return json(await repondreContestation(serviceClient(), String(body.id ?? ""), String(body.texte ?? "")));
    }
    if (acces.role !== "admin") return json({ error: "forbidden" }, 403);
    // 0432 : ce qui partirait maintenant, par type (rien n'est écrit ni envoyé).
    if (body.action === "apercu") return json(await apercu(serviceClient(), new Date(), { demain: (body as { demain?: unknown }).demain === true }));
    // Prompt 25 : « Send selected » (To approve) et Send (Thursday) : la file part tout de suite, peu à peu.
    if (body.action === "envoyer_file") return json(await envoyerFileMaintenant(serviceClient(), new Date()));
    // Prompt 25 v4 (0440) : les contrats de test. « Create test poster » et « Run now ».
    if (body.action === "test_poster_creer") {
      return json(await creerPosteurTest(serviceClient(), String(body.contrat_id ?? ""), String(body.prenom ?? ""), acces.userId));
    }
    if (body.action === "test_lancer") return json(await lancerTest(serviceClient(), String(body.poster_id ?? ""), String(body.quoi ?? "")));
    if (body.action === "reponses") {
      const maintenant = new Date();
      const r = await traiterReponses(serviceClient(), maintenant);
      // Prompt 21, R : les contestations (tableau de bord, réponse automatique), même sans nouveau message.
      const contestations = await traiterContestations(serviceClient())
        .catch((e) => ({ ok: false, erreurs: [`contestations : ${messageErreur(e)}`] }));
      return json({ ...r, contestations });
    }
    if (body.action !== "verifier") return json({ ok: false, error: "action inconnue" }, 400);
    return json(await verifier(serviceClient(), new Date()));
  } catch (erreur) {
    console.error("[recrues-check]", messageErreur(erreur));
    return json({ ok: false, error: messageErreur(erreur) }, 500);
  }
});

async function reglages(supabase: Supabase) {
  const { data, error } = await supabase
    .from("reglages")
    .select("cle, valeur")
    .in("cle", [
      "relances_auto",
      "kill_auto",
      "etapes_delais",
      "etape_texte_connexion",
      "etape_texte_tiktok",
      "etape_texte_warmup_lance",
      "etape_texte_warmup_bien_fait",
      "etape_texte_warmup_lance_deuxieme",
      "etape_texte_warmup_bien_fait_deuxieme",
      "lien_etapes_tiktok",
      "lundi_message_auto",
      "lundi_texte_tous",
      "lundi_texte_cohorte",
      "lundi_texte_warmup",
      "jeudi_texte",
      "jeudi_texte_recrue",
      "semaine_heures",
      "lundi_soir_auto",
      "lundi_soir_texte",
      "lundi_soir_heure",
      "rappels_reprise_le",
      "slack_boutons",
      "etape_texte_tiktok_verifier",
      "etape_texte_connexion_identifiants",
      "envoi_attente_par_passage",
      "paie_minimum_posts",
      "relance_texte_cadre",
      "relance_texte_connexion",
      "relance_texte_compte_tiktok",
      "relance_texte_start_warmup",
      "relance_texte_follows",
      "relance_texte_slack",
      "relances_upwork_max_par_recrue",
      "slack_lien_invitation",
      "accueil_auto",
      "accueil_message_texte",
    ]);
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  const texte = (cle: string) => (typeof v[cle] === "string" ? (v[cle] as string) : "");
  // Prompt 25 : les textes de la relance du jour (un réglage absent : le texte par défaut).
  const relance = (cle: string, d: string) => (typeof v[cle] === "string" ? (v[cle] as string) : d);
  return {
    mode: lireModeRelances(v.relances_auto),
    kill: lireModeAuto(v.kill_auto) as ModeAuto,
    etapes: lireDelaisAccueil(v.etapes_delais),
    textesEtapes: {
      connexion: texte("etape_texte_connexion"),
      tiktok: texte("etape_texte_tiktok"),
      warmup_lance: texte("etape_texte_warmup_lance"),
      warmup_bien_fait: texte("etape_texte_warmup_bien_fait"),
    } as Record<EtapeAccueil, string>,
    // Prompt 21, C4 : le 2e compte d'un Double (étapes 3 et 4 seulement).
    textesDeuxieme: {
      warmup_lance: texte("etape_texte_warmup_lance_deuxieme"),
      warmup_bien_fait: texte("etape_texte_warmup_bien_fait_deuxieme"),
    } as Partial<Record<EtapeAccueil, string>>,
    // 0432 : le bon @ (Start warmup cliqué, compte introuvable) ; les identifiants (bienvenue pas envoyée par l'OS).
    tiktokVerifier: texte("etape_texte_tiktok_verifier"),
    connexionIdentifiants: texte("etape_texte_connexion_identifiants"),
    // 0432 : les messages en attente validés partent peu à peu (par passage).
    envoiParPassage: Number.isFinite(Number(v.envoi_attente_par_passage)) && v.envoi_attente_par_passage !== null
      ? Math.max(1, Number(v.envoi_attente_par_passage)) : 20,
    postsMin: Number.isFinite(Number(v.paie_minimum_posts)) && v.paie_minimum_posts !== null ? Number(v.paie_minimum_posts) : 6,
    lienEtapes: texte("lien_etapes_tiktok"),
    lundi: lireModeAuto(v.lundi_message_auto) as ModeAuto,
    textesLundi: { tous: texte("lundi_texte_tous"), cohorte: texte("lundi_texte_cohorte"), warmup: texte("lundi_texte_warmup") },
    texteJeudi: texte("jeudi_texte"),
    // Prompt 21, C7 : les recrues du lundi suivant pas encore prêtes.
    texteJeudiRecrue: texte("jeudi_texte_recrue"),
    heures: lireHeuresSemaine(v.semaine_heures),
    lundiSoir: (v.lundi_soir_auto === "approve" ? "approve" : lireModeAuto(v.lundi_soir_auto)) as ModeAuto | "approve",
    textesRelance: {
      cadre: relance("relance_texte_cadre", TEXTES_RELANCE_DEFAUT.cadre),
      connexion: relance("relance_texte_connexion", TEXTES_RELANCE_DEFAUT.connexion),
      tiktok: relance("relance_texte_compte_tiktok", TEXTES_RELANCE_DEFAUT.tiktok),
      warmup: relance("relance_texte_start_warmup", TEXTES_RELANCE_DEFAUT.warmup),
      follows: relance("relance_texte_follows", TEXTES_RELANCE_DEFAUT.follows),
      slack: relance("relance_texte_slack", TEXTES_RELANCE_DEFAUT.slack),
    } as TextesRelance,
    // Prompt 25 v4 : l'étape 0 (Join Slack), le plafond de relances Upwork par recrue, la bienvenue (Approve).
    slackLien: texte("slack_lien_invitation").trim(),
    relancesUpworkMax: Number.isFinite(Number(v.relances_upwork_max_par_recrue)) && v.relances_upwork_max_par_recrue !== null
      ? Math.max(0, Number(v.relances_upwork_max_par_recrue)) : 5,
    accueil: (v.accueil_auto === "approve" ? "approve" : lireModeAuto(v.accueil_auto)) as ModeAuto | "approve",
    texteAccueil: texte("accueil_message_texte"),
    texteLundiSoir: texte("lundi_soir_texte"),
    boutons: lireLibellesBoutons(v.slack_boutons),
    repriseRappels: typeof v.rappels_reprise_le === "string" ? (v.rappels_reprise_le as string) : null,
    heureLundiSoir: Number.isFinite(Number(v.lundi_soir_heure)) && v.lundi_soir_heure !== null ? Number(v.lundi_soir_heure) : 20,
  };
}

/**
 * Prompt 25 : « Step reminders (new recruits) » : off / test / approve / on.
 * Approve : l'OS prépare les relances dans Messages sent → To approve ; rien ne
 * part sans « Send selected ».
 */
type ModeRelances = "off" | "simulation" | "approve" | "on";
function lireModeRelances(v: unknown): ModeRelances {
  return v === "approve" ? "approve" : lireMode(v);
}

function lireHeuresSemaine(v: unknown): { lundi_heure: number; jeudi_heure: number; fin: number } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = (x: unknown, d: number) => (Number.isFinite(Number(x)) && x !== null ? Number(x) : d);
  return { lundi_heure: n(o.lundi_heure, 10), jeudi_heure: n(o.jeudi_heure, 12), fin: n(o.fin, 20) };
}

/** Les relances prévues déjà notées : on ne les efface que si elles existent. */
const clePrevue = (posterId: string, type: string, periode: string) => `${posterId}|${type}|${periode}`;

interface Bilan {
  mode: string;
  kill: string;
  recrues: number;
  semaine: number;
  envoyes: number;
  prevus: number;
  bloques: number;
  rouges: number;
  resolus: number;
  kills: number;
  killsPartis: number;
  killsAnnules: number;
  /** Rappels en pause pour tous (`rappels_reprise_le`) : ni message, ni Kill. */
  rappelsEnPause: boolean;
  /** Prompt 22 : le grand interrupteur (`automation_pause`) : rien ne part, chaque action est notée. */
  automationPause: boolean;
  /** Prompt 21 : les 4 étapes et les relances sont passées cette fois (« Step checks »). */
  etapes?: boolean;
  erreurs: string[];
  /** 0432 : messages retenus « en attente » (dus avant le passage sur « on », ou liste du jeudi à valider). */
  attente: number;
  /** 0432 : messages pas envoyés car un autre profil (même contrat ou même Slack) les a déjà reçus. */
  doublons: number;
  /** Interne : les messages en attente validés (« Send »), et ceux partis à ce passage. */
  valides?: Set<string>;
  partisValides?: number;
  /** Interne : ce qui est déjà parti, par Slack et par contrat (un seul message par personne). */
  servis?: Set<string>;
  /** Interne : depuis quand chaque interrupteur est sur « on ». */
  onDepuis?: { relances: Date | null; lundi: Date | null; lundiSoir: Date | null };
  /** Interne : les relances prévues existantes (pas rendu). */
  prevuesConnues?: Set<string>;
  /** Interne : les posteurs en pause (malade, absent, partie E). */
  pauses?: Set<string>;
  /** Prompt 25 : relances préparées pour « To approve » à ce passage. */
  aApprouver: number;
  /** Prompt 25 : Start warmup cliqué, compte introuvable : Needs you, pas de message. */
  needsYou: number;
  /** Prompt 25 : la file d'envoi (messages validés) à ce passage. */
  file: { envoyes: number; perimes: number; doublons: number; upwork_bloque: number };
  /** Interne : relances du jour déjà préparées ou parties (`poster|jour`). */
  relancesFaites?: Set<string>;
  /** Interne : posteurs avec une relance validée pas encore partie (elle part d'abord). */
  relanceEnFile?: Set<string>;
  /** Interne : messages préparés, par clé de personne (Slack, contrat) → le profil. */
  preparees?: Map<string, string>;
  /** Interne : Upwork plein pour aujourd'hui (budget ou limite d'Upwork). */
  upworkPlein?: boolean;
  /** Interne : relances déjà parties sur Upwork, par recrue (plafond `relances_upwork_max_par_recrue`). */
  relancesUpwork?: Map<string, number>;
  /** Interne : les contrats de test (0440) ; bienvenue et relances partent pour de vrai même sur Test ou Approve. */
  contratsTest?: Set<string>;
}

async function lireRecrues(supabase: Supabase): Promise<RecrueAccueil[]> {
  // Prompt 21, C3 et C4 (0423) : « Ready » calculé par la base, et les 2es comptes d'un Double.
  const { data, error } = await supabase.rpc("etapes_recrues_v2");
  if (error) throw error;
  const recrues = ((data ?? []) as RecrueAccueil[]).map((x) => ({ ...x, messages: x.messages ?? [], prevues: x.prevues ?? [] }));
  // 0432 : l'e-mail de connexion, et si l'OS a lui-même envoyé la bienvenue (avec les identifiants).
  const ids = [...new Set(recrues.map((x) => x.poster_id))];
  const emails = new Map<string, string | null>();
  const bienvenues = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const lot = ids.slice(i, i + 200);
    const { data: pr } = await supabase.from("profiles").select("id, email").in("id", lot);
    for (const x of pr ?? []) emails.set(x.id as string, (x.email as string | null) ?? null);
    const { data: ac } = await supabase.from("accueils").select("poster_id").in("poster_id", lot).eq("statut", "envoye").not("message_at", "is", null);
    for (const x of ac ?? []) bienvenues.add(x.poster_id as string);
  }
  return recrues.map((x) => ({ ...x, email: emails.get(x.poster_id) ?? null, bienvenue_os: bienvenues.has(x.poster_id) }));
}

interface ExempleMessage {
  poster_id: string;
  nom: string | null;
  hm: string | null;
  canaux: Canal[];
  /** Pas envoyé : un autre profil (même contrat, même Slack) l'a déjà reçu. */
  doublon: boolean;
  variante: string;
  texte: string;
  donnees: Record<string, unknown>;
}

/**
 * 0432, prompt 25 : pour chaque type de message, ce qui partirait (destinataire,
 * HM, canal, texte, données utilisées), avec les mêmes règles que l'envoi.
 * `demain` : les relances préparées demain (15 h à Paris, sans la fenêtre
 * 10 h-20 h) ; le lundi et le lundi 20 h : pour le prochain lundi. Rien n'est
 * écrit, rien n'est envoyé.
 */
async function apercu(supabase: Supabase, maintenant: Date, o: { demain?: boolean } = {}) {
  const r = await reglages(supabase);
  const recrues = await lireRecrues(supabase);
  const bilanVide = {
    servis: o.demain ? new Set<string>() : await lireServis(supabase, maintenant),
    preparees: new Map<string, string>(),
    relancesUpwork: await lireRelancesUpwork(supabase),
  } as Bilan;
  const lundi = lundiParis(maintenant);
  const prochain = ajouterJoursIso(lundi, 7);
  const instant = o.demain ? instantLocal(ajouterJoursIso(partiesLocales(maintenant, "Europe/Paris").date, 1), 15, "Europe/Paris") : maintenant;
  const sortie: Record<string, { total: number; exemples: ExempleMessage[] }> = {};
  const needsYou: { poster_id: string; nom: string | null; handle: string | null; start_warmup: string | null }[] = [];
  const ajouter = (type: string, ex: ExempleMessage) => {
    const t = (sortie[type] ??= { total: 0, exemples: [] });
    t.total++;
    if (t.exemples.length < 10) t.exemples.push(ex);
  };
  const ids = [...new Set(recrues.map((x) => x.poster_id))];
  const { data: noms } = await supabase.from("profiles").select("id, prenom, nom, manager_id").in("id", ids);
  const nomDe = new Map((noms ?? []).map((n) => [n.id as string, [n.prenom, n.nom].filter(Boolean).join(" ") || null]));
  const hmIds = [...new Set((noms ?? []).map((n) => n.manager_id as string | null).filter((x): x is string => Boolean(x)))];
  const { data: hms } = hmIds.length ? await supabase.from("profiles").select("id, prenom, nom").in("id", hmIds) : { data: [] };
  const hmNom = new Map((hms ?? []).map((h) => [h.id as string, [h.prenom, h.nom].filter(Boolean).join(" ") || null]));
  const hmDe = new Map((noms ?? []).map((n) => [n.id as string, n.manager_id ? hmNom.get(n.manager_id as string) ?? null : null]));
  const { data: pauses } = await supabase.from("posteur_pauses").select("poster_id").gt("jusqu_au", maintenant.toISOString());
  const enPause = new Set((pauses ?? []).map((x) => x.poster_id as string));
  const { data: faites } = await supabase.from("nudges").select("poster_id, periode").eq("type", "relance")
    .gte("periode", ajouterJoursIso(partiesLocales(maintenant, "Europe/Paris").date, -1));
  const dejaParties = new Set((faites ?? []).map((n) => `${n.poster_id}|${n.periode}`));

  // La relance du jour : une par recrue, avec ce qui lui manque.
  for (const x of recrues) {
    if (killEnCours(x) || enPause.has(x.poster_id) || instant >= debutCohorte(x)) continue;
    const plan = planRelance(x, etatsAccueil(x, r.etapes), instant, r.etapes, { slack: Boolean(r.slackLien) });
    if (plan.needsYou) needsYou.push({ poster_id: x.poster_id, nom: nomDe.get(x.poster_id) ?? x.prenom, handle: x.handle, start_warmup: x.warmup_started_at });
    if (!plan.element) continue;
    const jour = partiesLocales(instant, x.fuseau).date;
    if (dejaParties.has(`${x.poster_id}|${jour}`)) continue;
    const texte = texteRelancePour(r, x, plan);
    if (!texte) continue;
    const { canaux, doublon } = canauxPour(bilanVide, x, "relance", jour, { upwork: upworkPourRelance(r, bilanVide, x.poster_id) });
    if (!doublon && canaux.length) noterPrepare(bilanVide, x, "relance", jour);
    ajouter("relance", {
      poster_id: x.poster_id, nom: nomDe.get(x.poster_id) ?? x.prenom, hm: hmDe.get(x.poster_id) ?? null,
      canaux, doublon, variante: plan.elements.join("+"), texte,
      donnees: { ...donneesRelance(x, plan, bilanVide), jour },
    });
  }

  // Le message du lundi (le prochain lundi).
  const { data: semaineProchaine } = await supabase.rpc("semaine_posteurs", { p_lundi: prochain });
  const recrue = new Map(recrues.filter((x) => !x.deuxieme).map((x) => [x.poster_id, x]));
  for (const p of (semaineProchaine ?? []) as PosteurSemaine[]) {
    const x = recrue.get(p.poster_id);
    const nouvelle = p.cohorte_lundi === prochain;
    const manque = nouvelle && x
      ? ceQuiManqueRecrue(etatsAccueil(x, r.etapes), { url: OS_URL, handle: x.handle, warmupClique: Boolean(x.warmup_started_at) })
      : null;
    const { canal, doublon } = canalPour(bilanVide, p, "lundi", prochain);
    if (!doublon && canal) noterPrepare(bilanVide, p, "lundi", prochain);
    ajouter("lundi", {
      poster_id: p.poster_id, nom: nomDe.get(p.poster_id) ?? p.prenom, hm: hmDe.get(p.poster_id) ?? null, canaux: canal ? [canal] : [], doublon,
      variante: nouvelle ? (manque ? "nouvelle_cohorte_pas_prete" : "nouvelle_cohorte_prete") : "posteur",
      texte: texteLundi(r.textesLundi, { prenom: p.prenom, nouvelleCohorte: nouvelle, ceQuiManque: manque }),
      donnees: { lundi: prochain, cohorte: p.cohorte_lundi, posts_prevus_semaine: p.prevus_semaine, ce_qui_manque: manque },
    });
  }

  // Lundi 20 h (le prochain lundi) : les recrues de la cohorte, si elles n'ont rien publié ce jour-là.
  for (const x of recrues) {
    if (x.deuxieme || x.cohorte_lundi !== prochain || !x.contrat_id) continue;
    const dest = { poster_id: x.poster_id, slack_user_id: null, contrat_id: x.contrat_id };
    const { doublon } = canalPour(bilanVide, dest, "lundi_soir", prochain);
    if (!doublon) noterPrepare(bilanVide, dest, "lundi_soir", prochain);
    ajouter("lundi_soir", {
      poster_id: x.poster_id, nom: nomDe.get(x.poster_id) ?? x.prenom, hm: hmDe.get(x.poster_id) ?? null, canaux: doublon ? [] : ["upwork"], doublon,
      variante: "si_aucun_post_lundi", texte: texteLundiSoir(r.texteLundiSoir, x.prenom),
      donnees: { cohorte: x.cohorte_lundi, condition: `seulement si aucun post avec lien publié le lundi à ${r.heureLundiSoir} h (heure du pays)` },
    });
  }
  return {
    ok: true, genere_at: maintenant.toISOString(), pour: instant.toISOString(), minimum_posts: r.postsMin, types: sortie,
    needs_you: needsYou,
  };
}

/** 0432 : ce qui est déjà parti ces 10 derniers jours, par Slack et par contrat. */
async function lireServis(supabase: Supabase, maintenant: Date): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("nudges_servis", { p_depuis: new Date(maintenant.getTime() - 10 * 86_400_000).toISOString() });
  if (error) throw error;
  const servis = new Set<string>();
  for (const x of (data ?? []) as { type: string; periode: string; slack_user_id: string | null; contrat_id: string | null }[]) {
    if (x.slack_user_id) servis.add(cleServi(x.type, x.periode, "slack", x.slack_user_id));
    if (x.contrat_id) servis.add(cleServi(x.type, x.periode, "upwork", x.contrat_id));
  }
  return servis;
}

async function onDepuis(supabase: Supabase, cle: string): Promise<Date | null> {
  const { data } = await supabase.rpc("interrupteur_on_depuis", { p_cle: cle });
  return typeof data === "string" ? new Date(data) : null;
}

/**
 * 0432 : un message dû avant le passage de l'interrupteur sur « on » (ou la liste
 * du jeudi) n'est pas rattrapé d'un coup : il reste « en attente » jusqu'à
 * « Send », puis part peu à peu. Rend vrai s'il peut partir maintenant.
 */
async function peutPartir(
  supabase: Supabase,
  r: Reglages,
  bilan: Bilan,
  o: { cle: { poster_id: string; type: string; periode: string }; du: Date | null; onDepuis: Date | null; toujoursValider?: boolean; canaux: Canal[]; texte: string },
): Promise<boolean> {
  const k = clePrevue(o.cle.poster_id, o.cle.type, o.cle.periode);
  const valide = bilan.valides?.has(k) ?? false;
  const d = decisionRattrapage({
    du: o.du, onDepuis: o.onDepuis, toujoursValider: o.toujoursValider, valide, partisCeTour: bilan.partisValides ?? 0, cap: r.envoiParPassage,
  });
  if (d === "attendre") {
    await supabase.from("relances_prevues").upsert({
      ...o.cle, statut: "prevu", canal: libelleCanaux(o.canaux), texte: o.texte,
      raison: o.toujoursValider ? "a_valider" : "en_attente", maj_at: new Date().toISOString(),
    });
    bilan.attente++;
    return false;
  }
  if (valide) bilan.partisValides = (bilan.partisValides ?? 0) + 1;
  return true;
}

async function verifier(supabase: Supabase, maintenant: Date): Promise<Bilan & { ok: boolean }> {
  const r = await reglages(supabase);
  const bilan: Bilan = {
    mode: r.mode, kill: r.kill, recrues: 0, semaine: 0, envoyes: 0, prevus: 0, bloques: 0, rouges: 0, resolus: 0,
    kills: 0, killsPartis: 0, killsAnnules: 0, rappelsEnPause: rappelsEnPause(r.repriseRappels, maintenant),
    automationPause: await automationEnPause(supabase), erreurs: [], attente: 0, doublons: 0,
    aApprouver: 0, needsYou: 0, file: { envoyes: 0, perimes: 0, doublons: 0, upwork_bloque: 0 },
  };
  bilan.servis = await lireServis(supabase, maintenant);
  await ajouterPreparees(supabase, bilan);
  bilan.relancesUpwork = await lireRelancesUpwork(supabase);
  bilan.contratsTest = await lireContratsTest(supabase);
  // Prompt 25 : les relances d'hier pas approuvées ne partent plus (jamais de rattrapage) ; la bienvenue, elle, attend.
  await supabase.from("relances_prevues").update({ statut: "expire", maj_at: new Date().toISOString() })
    .eq("statut", "prevu").is("valide_at", null).eq("raison", "a_approuver").neq("type", "accueil")
    .lt("periode", ajouterJoursIso(partiesLocales(maintenant, "Europe/Paris").date, -1));

  if (r.mode === "off") {
    // Les messages validés à la main (Thursday, To approve) partent quand même, peu à peu.
    await envoyerFile(supabase, r, null, maintenant, bilan);
    return { ok: bilan.erreurs.length === 0, ...nettoyer(bilan) };
  }

  const { error: errCnx } = await supabase.rpc("relances_noter_connexions");
  if (errCnx) bilan.erreurs.push(`connexions : ${errCnx.message}`);

  const { data: prevues } = await supabase.from("relances_prevues").select("poster_id, type, periode, statut, raison, valide_at");
  bilan.prevuesConnues = new Set((prevues ?? []).map((x) => clePrevue(x.poster_id, x.type, x.periode)));
  // 0432 : les messages en attente que l'admin a validés (« Send ») ; depuis quand chaque interrupteur est sur « on ».
  bilan.valides = new Set((prevues ?? []).filter((x) => x.valide_at).map((x) => clePrevue(x.poster_id, x.type, x.periode)));
  bilan.partisValides = 0;
  bilan.onDepuis = {
    relances: await onDepuis(supabase, "relances_auto"),
    lundi: await onDepuis(supabase, "lundi_message_auto"),
    lundiSoir: await onDepuis(supabase, "lundi_soir_auto"),
  };
  // Prompt 25 : les relances du jour déjà préparées, écartées ou parties (une par recrue et par jour).
  bilan.relancesFaites = new Set(
    (prevues ?? []).filter((x) => x.type === "relance" && x.raison !== "simulation" && ["prevu", "ecarte"].includes(x.statut))
      .map((x) => `${x.poster_id}|${x.periode}`),
  );
  bilan.relanceEnFile = new Set(
    (prevues ?? []).filter((x) => x.type === "relance" && x.statut === "prevu" && x.valide_at).map((x) => x.poster_id as string),
  );
  const { data: parties } = await supabase.from("nudges").select("poster_id, periode").eq("type", "relance")
    .gte("periode", ajouterJoursIso(partiesLocales(maintenant, "Europe/Paris").date, -2));
  for (const n of parties ?? []) bilan.relancesFaites.add(`${n.poster_id}|${n.periode}`);

  // Partie E : en pause (malade, absent), ni message ni Kill automatique.
  const { data: pauses } = await supabase.from("posteur_pauses").select("poster_id").gt("jusqu_au", maintenant.toISOString());
  bilan.pauses = new Set((pauses ?? []).map((x) => x.poster_id as string));

  let recrues = await lireRecrues(supabase);
  const test = r.mode === "simulation";

  // Avant une relance « connexion » ou « Join Slack » : la liaison Slack relancée, une fois pour tout le passage.
  const connexionDue = recrues.some((x) => {
    if (killEnCours(x)) return false;
    const e = planRelance(x, etatsAccueil(x, r.etapes), maintenant, r.etapes, { slack: Boolean(r.slackLien) }).elements;
    return e.includes("connexion") || e.includes("slack");
  });
  if (connexionDue) {
    const jeton = jetonLectureSlack();
    if (jeton) {
      await synchroniser(supabase, jeton, { simuler: false, source: "recrues-check" }).catch((e) =>
        bilan.erreurs.push(`slack : ${messageErreur(e)}`)
      );
      recrues = await lireRecrues(supabase);
    }
  }
  bilan.recrues = recrues.length;

  // Les relances de l'ancien système (accès, warm-up) ne s'affichent plus.
  if (recrues.length > 0) {
    await supabase.from("relances_prevues").delete().in("type", ["acces", "warmup"]).in(
      "poster_id",
      recrues.map((x) => x.poster_id),
    );
  }

  // Prompt 21 : le cron passe toutes les 15 min ; « Step checks » dit si les relances
  // passent cette fois. Les Kills, eux, sont vérifiés à chaque passage.
  const etapesDues = await passageDu(supabase, "etapes");
  bilan.etapes = etapesDues;
  for (let x of etapesDues ? recrues : []) {
    // Cohorte commencée : ses vidéos sont ses posts, pas un warm-up raté.
    if (maintenant >= debutCohorte(x)) x = { ...x, videos: null };
    let etats = etatsAccueil(x, r.etapes);
    // Une relance tiktok ou warm-up due (ou un Kill d'un ancien message) : un relevé TikTok à jour avant.
    const plan = planRelance(x, etats, maintenant, r.etapes);
    const aRelever = !killEnCours(x) && x.handle && x.compte_id && (
      (plan.element !== null && plan.element !== "connexion" && !bilan.relancesFaites.has(`${x.poster_id}|${partiesLocales(maintenant, x.fuseau).date}`)) ||
      etats.some((e) => e.etape !== "connexion" && decision(x, e, maintenant, r.etapes, test).kill)
    );
    if (aRelever) {
      const frais = await releverTiktok(supabase, x).catch(() => null);
      if (frais) {
        x = maintenant >= debutCohorte(frais) ? { ...frais, videos: null } : frais;
        etats = etatsAccueil(x, r.etapes);
      }
    }
    for (const e of etats) await suivreEtape(supabase, r, x, e, maintenant, test, bilan);
    await relanceDuJour(supabase, r, x, etats, maintenant, bilan);
    // Le 2e compte d'un Double ne reporte jamais la cohorte du posteur.
    if (!x.deuxieme) await rougeDimanche(supabase, r, x, maintenant, bilan);
  }

  // Prompt 21, A2 : juste avant les Kills, les conversations Upwork de ceux qui en ont un dû.
  if (await lireAvantKills(supabase, r, maintenant, bilan)) recrues = await lireRecrues(supabase);
  await killsEchus(supabase, r, recrues, maintenant, bilan);

  // Une fois par heure (le passage de :00) : le message du lundi, le check du lundi soir
  // et les inactifs. Prompt 25 : le nudge du jeudi ne part plus d'ici (page Thursday).
  if (maintenant.getUTCMinutes() < 15) {
    await semaine(supabase, r, recrues, maintenant, bilan);
    // Pipeline, partie 2 : le check du lundi soir (1er jour de posts).
    await lundiSoir(supabase, r, maintenant, bilan);

    // Les inactifs : Nudge du jeudi envoyé, rien publié depuis vendredi 20 h (0404).
    const { error: errInactifs } = await supabase.rpc("inactifs_marquer");
    if (errInactifs) bilan.erreurs.push(`inactifs : ${errInactifs.message}`);
  }

  // Prompt 25 : ce qui est validé (On, To approve, Thursday) part, peu à peu.
  await envoyerFile(supabase, r, recrues, maintenant, bilan);
  return { ok: bilan.erreurs.length === 0, ...nettoyer(bilan) };
}

/** Le bilan rendu, sans les champs internes. */
function nettoyer(bilan: Bilan): Bilan {
  const { prevuesConnues: _p, valides: _v, servis: _s, onDepuis: _o, relancesFaites: _r, relanceEnFile: _f, pauses: _z, preparees: _q, upworkPlein: _u, relancesUpwork: _w, contratsTest: _t, ...reste } = bilan;
  return reste;
}

/**
 * Prompt 25 : les messages déjà préparés (To approve, file d'envoi) comptent
 * pour « un seul message par personne » : un autre profil sur le même Slack ou
 * le même contrat n'en reçoit pas un 2e.
 */
async function ajouterPreparees(supabase: Supabase, bilan: Bilan) {
  bilan.preparees = new Map();
  const { data } = await supabase.from("relances_prevues")
    .select("poster_id, type, periode, raison, profiles(slack_user_id, upwork_contract_id)")
    .in("statut", ["prevu", "ecarte"]).neq("raison", "simulation");
  for (const x of data ?? []) {
    const p = (x as unknown as { profiles: { slack_user_id: string | null; upwork_contract_id: string | null } | null }).profiles;
    if (!p) continue;
    for (const k of clesPersonne({ slack_user_id: p.slack_user_id, contrat_id: p.upwork_contract_id }, x.type, x.periode)) {
      if (!bilan.preparees.has(k)) bilan.preparees.set(k, x.poster_id as string);
    }
  }
}

/**
 * Prompt 25 : le canal d'un message, Slack d'abord (Upwork seulement sans
 * Slack), et « doublon » si un autre profil sur le même Slack ou le même
 * contrat l'a déjà reçu ou l'a déjà préparé.
 */
function canalPour(
  bilan: Bilan,
  p: { poster_id: string; slack_user_id: string | null; contrat_id: string | null },
  type: string,
  periode: string,
): { canal: Canal | null; doublon: boolean } {
  const autre = clesPersonne(p, type, periode).some((k) => {
    const prepare = bilan.preparees?.get(k);
    return prepare !== undefined && prepare !== p.poster_id;
  });
  if (autre) return { canal: null, doublon: true };
  return canalUnique(p, type, periode, bilan.servis ?? new Set());
}

/**
 * Prompt 25 v4 : les canaux d'un message (Slack ET Upwork, le même texte), et
 * « doublon » si un autre profil sur le même Slack ou le même contrat l'a déjà
 * reçu ou préparé.
 */
function canauxPour(
  bilan: Bilan,
  p: { poster_id: string; slack_user_id: string | null; contrat_id: string | null },
  type: string,
  periode: string,
  o: { slack?: boolean; upwork: boolean },
): { canaux: Canal[]; doublon: boolean } {
  const autre = clesPersonne(p, type, periode).some((k) => {
    const prepare = bilan.preparees?.get(k);
    return prepare !== undefined && prepare !== p.poster_id;
  });
  if (autre) return { canaux: [], doublon: true };
  return canauxMessage(p, type, periode, bilan.servis ?? new Set(), o);
}

/** Prompt 25 v4 : Upwork pour la relance de cette recrue, tant qu'elle n'a pas atteint le plafond. */
function upworkPourRelance(r: Reglages, bilan: Bilan, posterId: string): boolean {
  return (bilan.relancesUpwork?.get(posterId) ?? 0) < r.relancesUpworkMax;
}

/** Les relances déjà parties sur Upwork, par recrue. */
async function lireRelancesUpwork(supabase: Supabase): Promise<Map<string, number>> {
  const n = new Map<string, number>();
  const { data } = await supabase.from("nudges").select("poster_id").eq("type", "relance").contains("canaux", ["upwork"]).limit(10000);
  for (const x of data ?? []) n.set(x.poster_id as string, (n.get(x.poster_id as string) ?? 0) + 1);
  return n;
}

/** Prompt 25 v4 (0440) : les contrats de test (pas retirés). */
async function lireContratsTest(supabase: Supabase): Promise<Set<string>> {
  const { data } = await supabase.from("contrats_test").select("contrat_id").is("retire_at", null);
  return new Set((data ?? []).map((x) => String(x.contrat_id)));
}

/** Après un message préparé ou parti : la personne (son Slack et son contrat) est servie. */
function noterPrepare(bilan: Bilan, p: { poster_id: string; slack_user_id: string | null; contrat_id: string | null }, type: string, periode: string) {
  for (const k of clesPersonne(p, type, periode)) if (!bilan.preparees?.has(k)) bilan.preparees?.set(k, p.poster_id);
}

async function releverTiktok(supabase: Supabase, x: RecrueAccueil): Promise<RecrueAccueil | null> {
  const p = await lireProfilTiktok(x.handle!);
  await supabase.from("ckd_warmup_releves").insert({
    compte_id: x.compte_id,
    handle: x.handle,
    existe: p.existe,
    cree_tiktok_at: p.creeLe,
    abonnements: p.abonnements,
    likes: p.likes,
    abonnes: p.abonnes,
    videos: p.videos,
    erreur: p.erreur,
  });
  if (p.existe === null) return null;
  // Prompt 21, C3 : « Ready » relu dans la base avec ce relevé (une seule définition).
  const { data: pret, error } = await supabase.rpc("compte_pret", { p_compte: x.compte_id });
  return {
    ...x,
    tiktok_existe: p.existe,
    tiktok_vu_at: x.tiktok_vu_at ?? (p.existe ? new Date().toISOString() : null),
    abonnements: p.abonnements ?? x.abonnements,
    videos: p.videos ?? x.videos,
    pret: error || typeof pret !== "boolean" ? x.pret : pret,
  };
}

// ---------------------------------------------------------------------------
// Système du 2 nov., partie B : les 4 étapes et le Kill à 48 h
// ---------------------------------------------------------------------------

type Reglages = Awaited<ReturnType<typeof reglages>>;

function reponduAt(x: RecrueAccueil): Date | null {
  return x.repondu_at ? new Date(x.repondu_at) : null;
}

function decision(x: RecrueAccueil, e: EtatAccueil, maintenant: Date, d: DelaisAccueil, test: boolean) {
  return deciderEtape(e, maintenant, x.fuseau, d, {
    envoyeAt: envoiEtape(x, e.etape, test).envoyeAt,
    reponduAt: reponduAt(x),
    debut: debutCohorte(x),
  });
}

/**
 * Une étape : une réaction (étape faite, réponse) annule un Kill en attente ;
 * l'étape faite résout son ancien message ; un ancien message d'étape sans
 * réaction 48 h après → Kill (`kill_auto`, sur « off »). Prompt 25 : plus aucun
 * message d'étape d'ici, c'est la relance du jour qui écrit.
 */
async function suivreEtape(
  supabase: Supabase,
  r: Reglages,
  x: RecrueAccueil,
  e: EtatAccueil,
  maintenant: Date,
  test: boolean,
  bilan: Bilan,
): Promise<void> {
  const periode = x.cohorte_lundi;
  const cle = { poster_id: x.poster_id, type: e.etape, periode };
  const envoi = envoiEtape(x, e.etape, test);
  const kill = killEtape(x, e.etape);

  // Une réaction (étape faite, ou réponse après le message) annule un Kill en attente.
  const repondu = reponduAt(x);
  const reaction = e.fait || (repondu !== null && envoi.envoyeAt !== null && repondu >= envoi.envoyeAt);
  if (kill && (kill.statut === "en_attente" || kill.statut === "simule") && reaction) {
    await supabase.from("kills_auto")
      .update({ statut: "annule", annule_at: new Date().toISOString(), raison: e.fait ? "étape faite" : "réponse reçue" })
      .eq("id", kill.id)
      .in("statut", ["en_attente", "simule"]);
    bilan.killsAnnules++;
  }

  // Les anciennes relances d'étape « prévues » ne s'affichent plus (la relance du jour les remplace).
  if (bilan.prevuesConnues?.has(clePrevue(x.poster_id, e.etape, periode))) {
    await supabase.from("relances_prevues").delete().match(cle);
  }
  if (e.fait) {
    if (x.messages.some((m) => m.type === e.etape)) {
      const { data } = await supabase
        .from("nudges")
        .update({ resolu_at: new Date().toISOString() })
        .eq("poster_id", x.poster_id)
        .eq("type", e.etape)
        .eq("periode", periode)
        .is("resolu_at", null)
        .select("id");
      bilan.resolus += (data ?? []).length;
    }
    return;
  }
  if (killEnCours(x) || bilan.pauses?.has(x.poster_id) || bilan.rappelsEnPause) return;

  const d = deciderEtape(e, maintenant, x.fuseau, r.etapes, { envoyeAt: envoi.envoyeAt, reponduAt: repondu, debut: debutCohorte(x) });
  if (!d.kill) return;
  // Prompt 22 : en pause, ni message ni Kill ; l'action est notée.
  if (bilan.automationPause) {
    await noterBloquee(supabase, { fonction: "recrues-check", action: `kill_${e.etape}`, poster_id: x.poster_id });
    return;
  }
  // 0432 : Start warmup cliqué mais @ introuvable : on ne sait pas ; jamais de Kill.
  if (e.etape === "tiktok" && x.warmup_started_at) return;
  if (r.kill === "off" || (kill && kill.statut !== "simule")) return;
  // Un vrai Kill : interrupteur sur « on » ET un message vraiment parti.
  const reel = r.kill === "on" && envoi.reel;
  if (kill && !reel) return;
  const { error } = await supabase.rpc("kill_noter", {
    p_poster: x.poster_id,
    p_etape: e.etape,
    p_periode: periode,
    p_nudge: envoi.nudgeId,
    p_message_at: envoi.envoyeAt!.toISOString(),
    p_statut: reel ? "en_attente" : "simule",
    p_annulation_h: r.etapes.kill_annulation_h,
  });
  if (error) bilan.erreurs.push(`kill ${x.poster_id} : ${error.message}`);
  else {
    bilan.kills++;
    // Prompt 21, C4 : le Kill du 2e compte d'un Double n'arrête que ce compte (killsEchus).
    if (x.deuxieme && x.compte_id) {
      await supabase.from("kills_auto").update({ compte_id: x.compte_id })
        .eq("poster_id", x.poster_id).eq("etape", e.etape).eq("periode", periode).is("compte_id", null);
    }
  }
}

/** Le texte de la relance du jour (vide : rien ne part). */
function texteRelancePour(r: Reglages, x: RecrueAccueil, plan: ReturnType<typeof planRelance>): string {
  return texteRelance(r.textesRelance, plan, {
    prenom: x.prenom,
    handle: x.handle,
    url: OS_URL,
    lien_etapes: r.lienEtapes || OS_URL,
    cohorte_lundi: x.cohorte_lundi,
    email: x.email,
    mot_de_passe: MOT_DE_PASSE_DEPART,
    slack: r.slackLien,
  });
}

/** Les données utilisées par une relance (To approve, Aperçu). */
function donneesRelance(x: RecrueAccueil, plan: ReturnType<typeof planRelance>, bilan?: Bilan) {
  return {
    element: plan.element,
    elements: plan.elements,
    sur_slack: Boolean(x.slack_user_id),
    relances_upwork: bilan?.relancesUpwork?.get(x.poster_id) ?? 0,
    cohorte: x.cohorte_lundi,
    email: x.email ?? null,
    premiere_connexion: x.premiere_connexion_at,
    handle: x.handle,
    start_warmup: x.warmup_started_at,
    tiktok_trouve: x.tiktok_existe,
    abonnements: x.abonnements,
    pret: x.pret ?? null,
    deuxieme_compte: x.deuxieme ?? false,
    slack: x.slack_user_id,
    contrat: x.contrat_id,
  };
}

/**
 * Prompt 25 : la relance du jour d'une recrue, une seule par jour (jour du
 * pays), entre 10 h et 20 h, avec seulement ce qui lui manque. Test : notée
 * « prévue » ; Approve : préparée dans To approve ; On : dans la file d'envoi
 * (elle part peu à peu). Start warmup cliqué et compte introuvable : rien,
 * la recrue est dans Needs you.
 */
async function relanceDuJour(
  supabase: Supabase,
  r: Reglages,
  x: RecrueAccueil,
  etats: EtatAccueil[],
  maintenant: Date,
  bilan: Bilan,
) {
  if (killEnCours(x) || bilan.pauses?.has(x.poster_id) || bilan.rappelsEnPause) return;
  if (maintenant >= debutCohorte(x)) return;
  const plan = planRelance(x, etats, maintenant, r.etapes, { slack: Boolean(r.slackLien) });
  if (plan.needsYou) bilan.needsYou++;
  if (!plan.element || !dansFenetre(maintenant, x.fuseau, r.etapes as unknown as Delais)) return;
  const jour = partiesLocales(maintenant, x.fuseau).date;
  const cle = { poster_id: x.poster_id, type: "relance", periode: jour };
  if (bilan.relancesFaites?.has(`${x.poster_id}|${jour}`)) return;
  // Une relance validée d'hier pas encore partie (budget Upwork) : elle part d'abord, pas une 2e.
  if (bilan.relanceEnFile?.has(x.poster_id)) return;
  if (bilan.automationPause) {
    await noterBloquee(supabase, { fonction: "recrues-check", action: "relance", poster_id: x.poster_id });
    return;
  }
  // Prompt 25 v4 : Slack (s'il y est) ET Upwork (jusqu'au plafond par recrue), le même texte.
  const upwork = upworkPourRelance(r, bilan, x.poster_id);
  const { canaux, doublon } = canauxPour(bilan, x, "relance", jour, { upwork });
  if (doublon) {
    bilan.doublons++;
    return;
  }
  if (canaux.length === 0) {
    // Pas sur Slack : sans contrat, ou le plafond de relances Upwork atteint.
    const raison = x.contrat_id && !upwork ? "upwork_max" : "contrat_non_relie";
    await supabase.from("relances_prevues").upsert({ ...cle, statut: "bloque", canal: null, texte: null, raison, maj_at: new Date().toISOString() });
    bilan.bloques++;
    return;
  }
  const texte = texteRelancePour(r, x, plan);
  if (!texte) return;
  const ligne = { ...cle, statut: "prevu", canal: libelleCanaux(canaux), texte, donnees: donneesRelance(x, plan, bilan), maj_at: new Date().toISOString() };
  // Prompt 25 v4 : un contrat de test reçoit sa relance pour de vrai, même sur Test ou Approve.
  const test = Boolean(x.contrat_id && bilan.contratsTest?.has(x.contrat_id));
  if (r.mode === "simulation" && !test) {
    await supabase.from("relances_prevues").upsert({ ...ligne, raison: "simulation" });
    bilan.prevus++;
    return;
  }
  // Une relance plus ancienne pas approuvée : remplacée par celle du jour.
  await supabase.from("relances_prevues").update({ statut: "expire", maj_at: new Date().toISOString() })
    .eq("poster_id", x.poster_id).eq("type", "relance").eq("statut", "prevu").is("valide_at", null).lt("periode", jour);
  const approuver = r.mode === "approve" && !test;
  const { error } = await supabase.from("relances_prevues").upsert({
    ...ligne,
    raison: approuver ? "a_approuver" : "auto",
    valide_at: approuver ? null : new Date().toISOString(),
  });
  if (error) {
    bilan.erreurs.push(`relance ${x.poster_id} : ${error.message}`);
    return;
  }
  bilan.relancesFaites?.add(`${x.poster_id}|${jour}`);
  noterPrepare(bilan, x, "relance", jour);
  if (approuver) bilan.aApprouver++;
}

interface LigneFile {
  poster_id: string;
  type: string;
  periode: string;
  texte: string | null;
  premier_at: string;
  donnees: Record<string, unknown> | null;
  profiles: { prenom: string | null; slack_user_id: string | null; upwork_contract_id: string | null; is_active: boolean | null } | null;
}

/** Le budget Upwork du jour (UTC) : ce qui reste, et les contrats déjà écrits (ils ne comptent pas une 2e fois). */
interface BudgetFile {
  restant: number;
  restantPrioritaire: number;
  limite: boolean;
  ecrits: Set<string>;
}

async function lireBudgetFile(supabase: Supabase, maintenant: Date): Promise<BudgetFile> {
  const { data, error } = await supabase.rpc("upwork_budget_jour", { p_contrat: null });
  if (error || !data) return { restant: 0, restantPrioritaire: 0, limite: true, ecrits: new Set() };
  const b = data as { conversations: number; max: number; reserve: number; limite_atteinte: boolean; restant?: number; restant_prioritaire?: number };
  const debut = `${maintenant.toISOString().slice(0, 10)}T00:00:00Z`;
  const { data: appels } = await supabase.from("upwork_appels").select("contrat")
    .eq("action", "message").is("erreur", null).gte("at", debut).not("contrat", "is", null).limit(5000);
  return {
    restant: b.restant ?? Math.max(0, b.max - b.reserve - b.conversations),
    restantPrioritaire: b.restant_prioritaire ?? Math.max(0, b.max - b.conversations),
    limite: b.limite_atteinte,
    ecrits: new Set((appels ?? []).map((x) => String(x.contrat))),
  };
}

/**
 * Prompt 25 : la file d'envoi. Les messages validés (On, « Send selected »,
 * Send du jeudi) partent au plus `envoi_attente_par_passage` par passage.
 * Prompt 25 v4 : ce qui reste d'hier (Upwork plein) d'abord, puis la
 * bienvenue, les relances des recrues pas sur Slack, les autres relances, le
 * lundi, le lundi 20 h. Les relances et le nudge du jeudi partent sur Slack ET
 * sur Upwork (le même texte) ; la relance s'arrête sur Upwork au plafond par
 * recrue ; quand Upwork manque, ceux qui sont sur Slack n'ont que Slack ce
 * jour-là et les autres attendent demain. La limite d'Upwork atteinte : plus
 * rien sur Upwork jusqu'à demain. Une relance dont l'étape est faite
 * entre-temps ne part pas.
 */
async function envoyerFile(supabase: Supabase, r: Reglages, recrues: RecrueAccueil[] | null, maintenant: Date, bilan: Bilan) {
  if (bilan.automationPause) return;
  const { data, error } = await supabase.from("relances_prevues")
    .select("poster_id, type, periode, texte, premier_at, donnees, profiles(prenom, slack_user_id, upwork_contract_id, is_active)")
    .eq("statut", "prevu").not("valide_at", "is", null)
    .order("periode").order("premier_at")
    .limit(300);
  if (error) {
    bilan.erreurs.push(`file : ${error.message}`);
    return;
  }
  const lignes = trierFile(
    ((data ?? []) as unknown as LigneFile[]).map((l) => ({ ...l, surSlack: Boolean(l.profiles?.slack_user_id) })),
    partiesLocales(maintenant, "Europe/Paris").date,
  );
  if (lignes.length === 0) return;
  const budget = await lireBudgetFile(supabase, maintenant);
  if (budget.limite) bilan.upworkPlein = true;
  bilan.relancesUpwork ??= await lireRelancesUpwork(supabase);
  const contratsTest = (bilan.contratsTest ??= await lireContratsTest(supabase));
  // Les messages plus prioritaires (bienvenue, recrues pas sur Slack) qui attendent Upwork.
  let attente = lignes.filter((l) => prioriteUpwork(l.type, l.surSlack) <= 1 && l.profiles?.upwork_contract_id).length;
  const recrueDe = new Map((recrues ?? []).filter((x) => !x.deuxieme).map((x) => [x.poster_id, x]));
  const marquer = (l: LigneFile, statut: string, raison?: string) =>
    supabase.from("relances_prevues").update({ statut, ...(raison ? { raison } : {}), maj_at: new Date().toISOString() })
      .match({ poster_id: l.poster_id, type: l.type, periode: l.periode });
  for (const l of lignes) {
    if (bilan.file.envoyes >= r.envoiParPassage) break;
    // L'interrupteur de ce type : sur off ou test, rien ne part (le jeudi n'a pas d'interrupteur) ;
    // un contrat de test (0440) : la relance et la bienvenue partent même sur Test.
    const surTest = Boolean(l.profiles?.upwork_contract_id && contratsTest.has(l.profiles.upwork_contract_id));
    if (l.type === "relance" && !(r.mode === "approve" || r.mode === "on" || (surTest && r.mode !== "off"))) continue;
    if (l.type === "lundi_soir" && !(r.lundiSoir === "approve" || r.lundiSoir === "on")) continue;
    if (l.type === "lundi" && r.lundi !== "on") continue;
    if (l.type === "accueil" && !(r.accueil === "approve" || r.accueil === "on" || (surTest && r.accueil !== "off"))) continue;
    const priorite = prioriteUpwork(l.type, l.surSlack);
    const p = l.profiles;
    const contrat = p?.upwork_contract_id ?? null;
    const sortir = () => {
      if (priorite <= 1 && contrat) attente--;
    };
    if (!p?.is_active || !l.texte?.trim()) {
      await marquer(l, "perime");
      bilan.file.perimes++;
      sortir();
      continue;
    }
    // Une relance : l'étape est-elle encore à faire ? (recrues lues à ce passage)
    if (l.type === "relance" && recrues) {
      const x = recrueDe.get(l.poster_id);
      const plan = x ? planRelance(x, etatsAccueil(x, r.etapes), maintenant, r.etapes, { slack: Boolean(r.slackLien) }) : null;
      // Un élément du texte fait entre-temps (Slack rejoint, connecté…) : périmée, celle du jour la remplace.
      const avant = Array.isArray(l.donnees?.elements) ? (l.donnees.elements as string[]) : [];
      if (!x || !plan || maintenant >= debutCohorte(x) || plan.element === null || avant.some((e) => !plan.elements.includes(e as never))) {
        await marquer(l, "perime");
        bilan.file.perimes++;
        sortir();
        continue;
      }
    }
    // La bienvenue : une seule fois.
    if (l.type === "accueil") {
      const { data: a } = await supabase.from("accueils").select("statut").eq("poster_id", l.poster_id).maybeSingle();
      if (a?.statut === "envoye") {
        await marquer(l, "deja_envoye");
        sortir();
        continue;
      }
    }
    // Un seul message par personne : un autre profil sur le même Slack ou le même contrat.
    const personne = { poster_id: l.poster_id, slack_user_id: p.slack_user_id, contrat_id: contrat };
    const slack = ["relance", "jeudi", "lundi"].includes(l.type) && Boolean(p.slack_user_id);
    let upworkVoulu = Boolean(contrat) && (l.type !== "lundi" || !slack);
    if (l.type === "relance" && !upworkPourRelance(r, bilan, l.poster_id)) upworkVoulu = false;
    const { canaux: possibles, doublon } = canauxPour(bilan, personne, l.type, l.periode, { slack, upwork: upworkVoulu });
    if (doublon) {
      await marquer(l, "doublon");
      bilan.file.doublons++;
      sortir();
      continue;
    }
    const upwork = possibles.includes("upwork") && upworkAccorde({
      priorite,
      deja: budget.ecrits.has(contrat!),
      limite: Boolean(bilan.upworkPlein),
      restant: budget.restant,
      restantPrioritaire: budget.restantPrioritaire,
      attentePrioritaire: priorite <= 1 ? 0 : attente,
    });
    const canaux = possibles.filter((c) => c === "slack" || upwork);
    if (canaux.length === 0) {
      if (possibles.includes("upwork")) {
        // Pas sur Slack, Upwork plein : le message attend demain (il partira d'abord).
        bilan.file.upwork_bloque++;
        continue;
      }
      await marquer(l, "bloque", l.type === "relance" && contrat ? "upwork_max" : "contrat_non_relie");
      bilan.bloques++;
      sortir();
      continue;
    }
    const { data: ligne, error: errIns } = await supabase
      .from("nudges")
      .insert({ poster_id: l.poster_id, type: l.type, periode: l.periode, compte_id: null, cible: surTest ? "test" : "recrues-check", canal: canaux[0], texte: l.texte })
      .select("id")
      .single();
    if (errIns) {
      // Déjà parti (index unique : un seul message par type et par période).
      if (errIns.code === "23505") await marquer(l, "deja_envoye");
      else bilan.erreurs.push(`file ${l.type} ${l.poster_id} : ${errIns.message}`);
      sortir();
      continue;
    }
    const partis: Canal[] = [];
    const erreurs: string[] = [];
    let plein = false;
    if (canaux.includes("slack")) {
      // « I want to stop » seulement sur les relances d'accueil (prompt 21, C6).
      const e = await envoyerSlack(supabase, l.poster_id, l.texte, blocsBoutons(l.texte, r.boutons, { stop: l.type === "relance" }));
      if (e) erreurs.push(`slack : ${e}`);
      else partis.push("slack");
    }
    if (canaux.includes("upwork")) {
      const deja = budget.ecrits.has(contrat!);
      const u = await envoyerUpwork(contrat!, l.texte, { prioritaire: priorite === 0 });
      if (u.budget || estLimiteUpwork(u.erreur)) {
        // Upwork plein (budget, ou limite d'Upwork) : plus rien sur Upwork aujourd'hui.
        bilan.upworkPlein = true;
        plein = true;
      } else if (u.reporter) {
        // Le compte de secours n'a pas pu écrire à cette personne : demain, avec Max.
        plein = true;
      } else if (u.erreur) {
        erreurs.push(u.erreur);
      } else {
        partis.push("upwork");
        budget.ecrits.add(contrat!);
        if (!deja) {
          budget.restant--;
          budget.restantPrioritaire--;
        }
        if (l.type === "relance") bilan.relancesUpwork?.set(l.poster_id, (bilan.relancesUpwork.get(l.poster_id) ?? 0) + 1);
      }
    }
    if (plein && partis.length === 0 && erreurs.length === 0) {
      // Rien n'est parti (Upwork seul, plein) : le message reste dans la file, il part demain.
      await supabase.from("nudges").delete().eq("id", ligne.id);
      bilan.file.upwork_bloque++;
      continue;
    }
    sortir();
    await noterEnvoi(supabase, ligne.id, { partis, erreurs }, `${l.type} ${l.poster_id}`, bilan);
    if (l.type === "accueil") await noterAccueil(supabase, l, partis.length > 0, erreurs.join(" · "));
    if (partis.length) {
      for (const k of clesPersonne(personne, l.type, l.periode)) bilan.servis?.add(k);
      bilan.file.envoyes++;
    }
    // Jamais de nouvel essai : la ligne quitte la file (le résultat est sur le message).
    await supabase.from("relances_prevues").delete().match({ poster_id: l.poster_id, type: l.type, periode: l.periode });
  }
}

/** Prompt 25 v4 : la bienvenue approuvée est partie (ou pas) : notée sur l'accueil, comme avant. */
async function noterAccueil(supabase: Supabase, l: LigneFile, ok: boolean, erreur: string) {
  await supabase.from("accueils").update(
    ok
      ? { statut: "envoye", message_texte: l.texte, message_at: new Date().toISOString(), raison: null, updated_at: new Date().toISOString() }
      : { statut: "erreur", raison: `message de bienvenue : ${erreur || "non envoyé"}`, message_texte: l.texte, updated_at: new Date().toISOString() },
  ).eq("poster_id", l.poster_id);
}

/** « Send selected » / Send : la file part tout de suite (au plus `envoi_attente_par_passage`, le reste aux passages suivants). */
async function envoyerFileMaintenant(supabase: Supabase, maintenant: Date) {
  const r = await reglages(supabase);
  const bilan: Bilan = {
    mode: r.mode, kill: r.kill, recrues: 0, semaine: 0, envoyes: 0, prevus: 0, bloques: 0, rouges: 0, resolus: 0,
    kills: 0, killsPartis: 0, killsAnnules: 0, rappelsEnPause: false, automationPause: await automationEnPause(supabase),
    erreurs: [], attente: 0, doublons: 0, aApprouver: 0, needsYou: 0, file: { envoyes: 0, perimes: 0, doublons: 0, upwork_bloque: 0 },
  };
  bilan.servis = await lireServis(supabase, maintenant);
  await ajouterPreparees(supabase, bilan);
  await envoyerFile(supabase, r, await lireRecrues(supabase), maintenant, bilan);
  return { ok: bilan.erreurs.length === 0, pause: bilan.automationPause, ...bilan.file, erreurs: bilan.erreurs };
}

/** Le budget Upwork du jour permet-il d'écrire à ce contrat (relances et nudges) ? */
async function upworkPossible(supabase: Supabase, contratId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("upwork_budget_jour", { p_contrat: contratId });
  if (error || !data) return false;
  const b = data as { conversations: number; max: number; reserve: number; limite_atteinte: boolean; deja: boolean };
  if (b.limite_atteinte) return false;
  return b.deja || b.conversations < Math.max(0, b.max - b.reserve);
}

/**
 * Dimanche minuit (heure du pays), une étape pas faite : rouge, pas de posts
 * lundi. Tout fait : le rouge pas encore décidé de cette cohorte s'efface.
 */
async function rougeDimanche(supabase: Supabase, r: Reglages, x: RecrueAccueil, maintenant: Date, bilan: Bilan) {
  const etape = etapeRouge(x, r.etapes);
  if (etape === null) {
    await supabase.from("recrues_rouges").delete()
      .eq("poster_id", x.poster_id)
      .eq("periode", x.cohorte_lundi)
      .is("decision", null)
      .in("etape", ["acces", "tiktok", "warmup"]);
    return;
  }
  if (!nuitDuRouge(x, maintenant)) return;
  // Prompt 21, A1 : pas prête dimanche minuit (heure du pays) → reportée seule au
  // lundi suivant (0413) ; ses posts n'arrivent pas, les étapes et le Kill continuent.
  const { error } = await supabase.rpc("cohorte_reporter_auto", { p_poster: x.poster_id, p_etape: etape, p_periode: x.cohorte_lundi });
  if (error) bilan.erreurs.push(`report ${x.poster_id} : ${error.message}`);
  else bilan.rouges++;
}

/**
 * Les Kills en attente dont le délai d'annulation est passé : l'arrêt complet
 * part (file `arrets`, partie C), seulement si `kill_auto` est sur « on ».
 */
/** Les Kills dus : leurs conversations Upwork relues (lecture seule). Vrai si un message est arrivé. */
async function lireAvantKills(supabase: Supabase, r: Reglages, maintenant: Date, bilan: Bilan): Promise<boolean> {
  if (r.kill !== "on" || bilan.rappelsEnPause) return false;
  const { data } = await supabase
    .from("kills_auto")
    .select("poster_id")
    .eq("statut", "en_attente")
    .lte("prevu_at", maintenant.toISOString());
  const posteurs = [...new Set((data ?? []).map((k) => k.poster_id as string))];
  if (posteurs.length === 0) return false;
  const base = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("CRON_SECRET");
  if (!base || !secret) return false;
  try {
    const rep = await fetch(`${base}/functions/v1/upwork`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": secret },
      body: JSON.stringify({ action: "reponses_lire", posteurs }),
    });
    const corps = await rep.json().catch(() => null);
    if (!rep.ok) bilan.erreurs.push(`lecture avant Kill : HTTP ${rep.status}`);
    return Number(corps?.nouveaux ?? 0) > 0;
  } catch (e) {
    bilan.erreurs.push(`lecture avant Kill : ${messageErreur(e)}`);
    return false;
  }
}

async function killsEchus(supabase: Supabase, r: Reglages, recrues: RecrueAccueil[], maintenant: Date, bilan: Bilan) {
  if (r.kill !== "on" || bilan.rappelsEnPause) return;
  const { data, error } = await supabase
    .from("kills_auto")
    .select("id, poster_id, compte_id, etape, message_at")
    .eq("statut", "en_attente")
    .lte("prevu_at", maintenant.toISOString());
  // Prompt 22 : en pause, aucun Kill ne part ; il reste en attente.
  if (bilan.automationPause) {
    for (const k of data ?? []) await noterBloquee(supabase, { fonction: "recrues-check", action: "kill", poster_id: k.poster_id, cible: k.id });
    return;
  }
  if (error) {
    bilan.erreurs.push(`kills : ${error.message}`);
    return;
  }
  const parPosteur = new Map(recrues.filter((x) => !x.deuxieme).map((x) => [x.poster_id, x]));
  // Prompt 21, C4 : le Kill d'un 2e compte de Double se vérifie sur ce compte.
  const parCompte = new Map(recrues.filter((x) => x.deuxieme && x.compte_id).map((x) => [x.compte_id!, x]));
  for (const k of data ?? []) {
    // Un Kill d'étape noté sur un compte = le 2e compte d'un Double (C4) : jamais
    // vérifié sur le 1er compte ; s'il n'est plus dans la liste, il attend.
    const deuxieme = k.etape !== "lundi_soir" && Boolean(k.compte_id);
    if (deuxieme && !parCompte.has(k.compte_id!)) continue;
    const brut = deuxieme ? parCompte.get(k.compte_id!) : parPosteur.get(k.poster_id);
    const x = brut && maintenant >= debutCohorte(brut) ? { ...brut, videos: null } : brut;
    // Dernière vérification : une réaction depuis le Kill l'annule.
    let reaction: boolean;
    let fait = false;
    if (k.etape === "lundi_soir") {
      reaction = k.message_at !== null && await reactionDepuis(supabase, k.poster_id, k.compte_id, k.message_at);
    } else {
      const e = x ? etatsAccueil(x, r.etapes).find((y) => y.etape === k.etape) : null;
      const repondu = x ? reponduAt(x) : null;
      fait = Boolean(e?.fait);
      reaction = fait || (repondu !== null && k.message_at !== null && repondu >= new Date(k.message_at));
    }
    if (reaction) {
      await supabase.from("kills_auto").update({ statut: "annule", annule_at: new Date().toISOString(), raison: fait ? "étape faite" : "réaction reçue" })
        .eq("id", k.id).eq("statut", "en_attente");
      bilan.killsAnnules++;
      continue;
    }
    // La ligne passe « parti » d'abord (un seul passage la prend), puis l'arrêt.
    const { data: pris } = await supabase.from("kills_auto")
      .update({ statut: "parti", parti_at: new Date().toISOString() })
      .eq("id", k.id).eq("statut", "en_attente")
      .select("id");
    if (!pris?.length) continue;
    // Un 2e compte (lundi soir) : seulement ce compte s'arrête, le 1er continue.
    if (k.compte_id && await autreCompteActif(supabase, k.poster_id, k.compte_id)) {
      const { error: errCompte } = await supabase.from("ckd_arrets").upsert(
        { compte_id: k.compte_id, raison: "ne_pas_renouveler", prevu_at: new Date().toISOString() },
        { onConflict: "compte_id" },
      );
      if (errCompte) {
        await supabase.from("kills_auto").update({ statut: "erreur", raison: errCompte.message }).eq("id", k.id);
        bilan.erreurs.push(`arrêt du compte ${k.compte_id} : ${errCompte.message}`);
      } else bilan.killsPartis++;
      continue;
    }
    const { error: errArret } = await supabase.from("arrets").insert({ poster_id: k.poster_id, source: "kill_48h", kill_id: k.id });
    if (errArret && errArret.code !== "23505") {
      await supabase.from("kills_auto").update({ statut: "erreur", raison: errArret.message }).eq("id", k.id);
      bilan.erreurs.push(`arrêt ${k.poster_id} : ${errArret.message}`);
    } else {
      bilan.killsPartis++;
    }
  }
}

async function envoyerSlack(supabase: Supabase, posterId: string, texte: string, blocs?: unknown[]): Promise<string | null> {
  const issue = await ecrireAuPosteur(supabase, posterId, texte, fetch, blocs);
  if (issue.statut === "envoye") return null;
  return issue.statut === "erreur" ? issue.erreur : "introuvable sur Slack";
}

/** Sur la ligne du message : les canaux partis ; « slack_erreur » seulement si rien n'est parti. */
async function noterEnvoi(supabase: Supabase, id: string, r: { partis: string[]; erreurs: string[] }, quoi: string, bilan: Bilan) {
  await supabase.from("nudges").update({
    canaux: r.partis,
    erreur_canal: r.erreurs.join(" · ") || null,
    ...(r.partis.length === 0 ? { slack_erreur: r.erreurs.join(" · ") || "aucun canal" } : {}),
  }).eq("id", id);
  if (r.partis.length === 0) bilan.erreurs.push(`${quoi} : ${r.erreurs.join(" · ")}`);
  else bilan.envoyes++;
}

/**
 * Par la fonction `upwork` (le seul endroit qui parle à Upwork), sans nouvel
 * essai. Prompt 25 : `prioritaire: false` (relances, nudges, lundi 20 h)
 * s'arrête avant la réserve du budget Upwork du jour ; `budget` : pas envoyé
 * parce qu'Upwork est plein aujourd'hui (le message peut repartir demain).
 */
async function envoyerUpwork(
  contratId: string,
  texte: string,
  o: { prioritaire?: boolean } = {},
): Promise<{ erreur: string | null; budget: boolean; reporter?: boolean }> {
  const base = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("CRON_SECRET");
  if (!base || !secret) return { erreur: "SUPABASE_URL ou CRON_SECRET absent", budget: false };
  try {
    const r = await fetch(`${base}/functions/v1/upwork`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": secret },
      body: JSON.stringify({ action: "message", contrat_id: contratId, texte, priorite: o.prioritaire !== false }),
    });
    const corps = await r.json().catch(() => null);
    // Prompt 25 v4 : « reporter » : le compte de secours n'a pas pu écrire ici ; le message repart demain (Max d'abord).
    if (!r.ok || !corps?.ok) return { erreur: `upwork : ${corps?.error ?? `HTTP ${r.status}`}`, budget: corps?.budget === true, reporter: corps?.reporter === true };
    return { erreur: null, budget: false };
  } catch (e) {
    return { erreur: `upwork : ${messageErreur(e)}`, budget: false };
  }
}

// ---------------------------------------------------------------------------
// Système du 2 nov., partie D : le lundi et le jeudi
// ---------------------------------------------------------------------------

/**
 * Le message du lundi 10 h (`lundi_message_auto`). Prompt 25 : le nudge du
 * jeudi ne part plus d'ici (Weekly decisions → Thursday, toujours validé), ni
 * le message du jeudi aux recrues (la relance du jour s'en charge).
 */
async function semaine(supabase: Supabase, r: Reglages, recrues: RecrueAccueil[], maintenant: Date, bilan: Bilan) {
  if (bilan.rappelsEnPause || r.lundi === "off") return;
  if (bilan.automationPause) {
    await noterBloquee(supabase, { fonction: "recrues-check", action: "semaine" });
    return;
  }
  const lundi = lundiParis(maintenant);
  const { data, error } = await supabase.rpc("semaine_posteurs", { p_lundi: lundi });
  if (error) {
    bilan.erreurs.push(`semaine : ${error.message}`);
    return;
  }
  // Le 1er compte de chaque recrue (pas le 2e compte d'un Double).
  const recrue = new Map(recrues.filter((x) => !x.deuxieme).map((x) => [x.poster_id, x]));
  for (const p of (data ?? []) as PosteurSemaine[]) {
    bilan.semaine++;
    if (bilan.pauses?.has(p.poster_id)) continue;
    const posteur = { ...p, envoyes: p.envoyes ?? [], prevus_test: p.prevus_test ?? [] };
    if (!lundiDu(posteur, lundi, maintenant, { debut: r.heures.lundi_heure, fin: r.heures.fin })) continue;
    const x = recrue.get(p.poster_id);
    const nouvelle = p.cohorte_lundi === lundi;
    const manque = nouvelle && x
      ? ceQuiManqueRecrue(etatsAccueil(x, r.etapes), { url: OS_URL, handle: x.handle, warmupClique: Boolean(x.warmup_started_at) })
      : null;
    const texte = texteLundi(r.textesLundi, { prenom: p.prenom, nouvelleCohorte: nouvelle, ceQuiManque: manque });
    await envoyerSemaine(supabase, posteur, "lundi", lundi, texte, r.lundi === "on", bilan, r.boutons, r, {
      du: instantLocal(lundi, r.heures.lundi_heure, p.fuseau), onDepuis: bilan.onDepuis?.lundi ?? null,
    });
  }
}

/**
 * Le message du lundi : en test, noté « prévu » ; sinon la ligne d'abord, puis
 * l'envoi (jamais deux). Prompt 25 : un seul canal, Slack d'abord, Upwork
 * seulement sans Slack (relances et nudges : dans le budget Upwork du jour).
 */
async function envoyerSemaine(
  supabase: Supabase,
  p: PosteurSemaine,
  type: "lundi",
  lundi: string,
  texte: string,
  reel: boolean,
  bilan: Bilan,
  boutons: LibellesBoutons,
  r: Reglages,
  quand: { du: Date | null; onDepuis: Date | null; toujoursValider?: boolean },
) {
  const cle = { poster_id: p.poster_id, type, periode: lundi };
  const { canal, doublon } = canalPour(bilan, p, type, lundi);
  if (doublon) {
    bilan.doublons++;
    return;
  }
  if (canal === null) {
    await supabase.from("relances_prevues").upsert({ ...cle, statut: "bloque", canal: null, texte: null, raison: "contrat_non_relie", maj_at: new Date().toISOString() });
    bilan.bloques++;
    return;
  }
  if (!reel) {
    if (p.prevus_test.includes(type)) return;
    await supabase.from("relances_prevues").upsert({ ...cle, statut: "prevu", canal, texte, raison: "simulation", maj_at: new Date().toISOString() });
    bilan.prevus++;
    return;
  }
  // 0432 : dû avant le passage sur « on » → en attente (« Send », puis peu à peu).
  if (!(await peutPartir(supabase, r, bilan, { cle, ...quand, canaux: [canal], texte }))) return;
  if (canal === "upwork" && (bilan.upworkPlein || !(await upworkPossible(supabase, p.contrat_id!)))) {
    bilan.upworkPlein = true;
    return;
  }
  const { data: ligne, error: errIns } = await supabase
    .from("nudges")
    .insert({ ...cle, compte_id: null, cible: "recrues-check", canal, texte })
    .select("id")
    .single();
  if (errIns) {
    if (errIns.code !== "23505") bilan.erreurs.push(`${type} ${p.poster_id} : ${errIns.message}`);
    return;
  }
  // Prompt 21, C6 : pas de « I want to stop » sur le lundi.
  let erreur: string | null;
  if (canal === "slack") erreur = await envoyerSlack(supabase, p.poster_id, texte, blocsBoutons(texte, boutons, { stop: false }));
  else {
    const u = await envoyerUpwork(p.contrat_id!, texte, { prioritaire: false });
    if (u.budget || u.reporter) {
      await supabase.from("nudges").delete().eq("id", ligne.id);
      if (u.budget) bilan.upworkPlein = true;
      return;
    }
    erreur = u.erreur;
  }
  await noterEnvoi(supabase, ligne.id, { partis: erreur ? [] : [canal], erreurs: erreur ? [erreur] : [] }, `${type} ${p.poster_id}`, bilan);
  if (!erreur) for (const k of clesPersonne(p, type, lundi)) bilan.servis?.add(k);
  if (bilan.prevuesConnues?.has(clePrevue(p.poster_id, type, lundi))) {
    await supabase.from("relances_prevues").delete().match(cle);
  }
}

// ---------------------------------------------------------------------------
// Système du 2 nov., partie E : l'OS lit et répond
// ---------------------------------------------------------------------------

interface LigneReponse {
  id: string;
  poster_id: string;
  canal: CanalReponse;
  source_id: string | null;
  texte: string | null;
}

async function reglagesReponses(supabase: Supabase): Promise<{ mode: ModeAuto; r: ReglagesReponses }> {
  const { data } = await supabase
    .from("reglages")
    .select("cle, valeur")
    .in("cle", [
      "reponses_auto",
      "reponses_reglages",
      "reponse_texte_upwork",
      "reponse_texte_augmentation",
      "reponse_texte_propre_compte",
      "reponse_texte_absent",
      "paie_reponse_attente_texte",
      "slack_lien_invitation",
    ]);
  const v = Object.fromEntries((data ?? []).map((x) => [x.cle as string, x.valeur]));
  const t = (cle: string, d: string) => (typeof v[cle] === "string" ? (v[cle] as string) : d);
  const o = (v.reponses_reglages && typeof v.reponses_reglages === "object" ? v.reponses_reglages : {}) as Record<string, unknown>;
  const n = (x: unknown, d: number) => (x !== undefined && x !== null && Number.isFinite(Number(x)) ? Number(x) : d);
  const D = REGLAGES_REPONSES_DEFAUT;
  return {
    mode: lireModeAuto(v.reponses_auto),
    r: {
      seuil: n(o.seuil, D.seuil),
      max_jour: n(o.max_jour, D.max_jour),
      pause_max_jours: n(o.pause_max_jours, D.pause_max_jours),
      textes: {
        upwork: t("reponse_texte_upwork", D.textes.upwork),
        augmentation: t("reponse_texte_augmentation", D.textes.augmentation),
        propre_compte: t("reponse_texte_propre_compte", D.textes.propre_compte),
        absent: t("reponse_texte_absent", D.textes.absent),
        paie_attente: t("paie_reponse_attente_texte", D.textes.paie_attente),
      },
      // Prompt 21, C8 : un seul lien Slack, ce réglage (plus de lien écrit en dur).
      slack: t("slack_lien_invitation", "").trim(),
    },
  };
}

/** Minuit à Paris aujourd'hui : le début du compteur « 3 réponses par jour ». */
function minuitParis(maintenant: Date): Date {
  return instantLocal(partiesLocales(maintenant, "Europe/Paris").date, 0, "Europe/Paris");
}

async function traiterReponses(supabase: Supabase, maintenant: Date) {
  const { mode, r } = await reglagesReponses(supabase);
  const bilan = { mode, classes: 0, reponses: 0, simules: 0, arrets: 0, pauses: 0, a_lire: 0, paie: 0, erreurs: [] as string[] };
  if (mode === "off") return { ok: true, ...bilan };
  const { data, error } = await supabase
    .from("posteur_reponses")
    .select("id, poster_id, canal, source_id, texte")
    .eq("statut", "a_classer")
    .order("recu_at")
    .limit(30);
  if (error) throw error;
  const lignes = (data ?? []) as LigneReponse[];
  if (lignes.length === 0) return { ok: true, ...bilan };

  // Le guide du poster, chargé une fois (seulement s'il y a un vrai message à classer).
  let guide: string | null = null;
  // Prompt 22 : en pause, le classement continue et la réponse ne part pas. Une
  // demande d'arrêt ou une pause sont notées (internes) : l'arrêt complet, lui,
  // attend la reprise dans sa file.
  const pause = await automationEnPause(supabase);
  const reel = mode === "on";
  for (const l of lignes) {
    let c: Classement | null = null;
    let erreur: string | null = null;
    const bouton = l.canal === "bouton" ? boutonDeSource(l.source_id) : null;
    if (bouton) {
      c = BOUTONS[bouton]!.classement;
    } else {
      try {
        if (guide === null) guide = (await chargerBase(supabase, "poster")).base.guide;
        const { data: a } = await supabase.from("accueils").select("job_titre").eq("poster_id", l.poster_id).maybeSingle();
        const prompt = construirePromptReponse({ message: l.texte ?? "", canal: l.canal, guide, annonce: a?.job_titre ?? null });
        c = lireClassement(await generateTextFast(prompt));
        if (!c) erreur = "classement illisible";
      } catch (e) {
        erreur = `classement : ${messageErreur(e)}`;
      }
    }
    const classement = c ?? { cas: "a_lire" as const, confiance: 0, sous_cas: null, reponse: "", jours: null };
    let maj_paie: string | null = null;

    const { count } = await supabase
      .from("posteur_reponses")
      .select("id", { count: "exact", head: true })
      .eq("poster_id", l.poster_id)
      .eq("reponse_statut", "envoye")
      .gte("reponse_at", minuitParis(maintenant).toISOString());
    const plan = planReponse(classement, l.canal, r, count ?? 0);
    // Prompt 21, P3 : une question de paie. L'OS regarde la ligne du posteur :
    // payée, déjà payée, semaine suivante financée → la réponse ; sinon une
    // réponse d'attente et la liste « Pay questions ».
    if (plan.cas === "paie") {
      const q = await questionPaie(l.poster_id, !reel || pause);
      if (q.texte) plan.liste = null;
      maj_paie = q.cas;
      const texte = q.texte ?? (r.textes.paie_attente.trim() || null);
      if (texte && (count ?? 0) >= r.max_jour) plan.bloque = "limite";
      else plan.repondre = texte;
    }

    const maj: Record<string, unknown> = {
      statut: "classe",
      cas: plan.cas,
      cas_ia: c?.cas ?? null,
      confiance: c?.confiance ?? null,
      sous_cas: classement.sous_cas,
      liste: plan.liste,
      erreur,
      traite_at: new Date().toISOString(),
      reponse_statut: plan.bloque ?? (plan.repondre ? null : "aucune"),
      // Prompt 21, R : une contestation (le déclencheur l'ajoute à Disputes).
      conteste: classement.conteste ?? null,
      ...(maj_paie ? { action: `paie_${maj_paie}` } : {}),
    };
    if (plan.liste === "a_lire") bilan.a_lire++;
    if (plan.liste === "paie") bilan.paie++;

    // 1 réponse automatique par message reçu, sur le canal du message.
    if (plan.repondre) {
      maj.reponse_texte = plan.repondre;
      if (pause && reel) {
        maj.reponse_statut = PAUSE;
        await noterBloquee(supabase, { fonction: "reponses", action: "reponse_auto", poster_id: l.poster_id, cible: l.id });
      } else if (!reel) {
        maj.reponse_statut = "simule";
        bilan.simules++;
      } else {
        const envoi = l.canal === "upwork" ? await repondreUpwork(supabase, l.poster_id, plan.repondre) : await envoyerSlack(supabase, l.poster_id, plan.repondre);
        maj.reponse_statut = envoi ? "erreur" : "envoye";
        maj.reponse_at = new Date().toISOString();
        if (envoi) maj.erreur = envoi;
        else bilan.reponses++;
      }
    }
    if (plan.arret) {
      if (!reel) maj.action = "arret_simule";
      else {
        const { error: errA } = await supabase.from("arrets").insert({ poster_id: l.poster_id, source: "je_ne_veux_plus" });
        maj.action = "arret";
        if (errA && errA.code !== "23505") maj.erreur = `arrêt : ${errA.message}`;
        else bilan.arrets++;
      }
    }
    if (plan.pause) {
      if (!reel) maj.action = "pause_simulee";
      else {
        const jusqu = new Date(maintenant.getTime() + plan.pause * 86_400_000).toISOString();
        const { error: errP } = await supabase.from("posteur_pauses").insert({ poster_id: l.poster_id, jusqu_au: jusqu, reponse_id: l.id, raison: (l.texte ?? "").slice(0, 300) });
        maj.action = "pause";
        if (errP) maj.erreur = `pause : ${errP.message}`;
        else bilan.pauses++;
      }
    }
    const { error: errMaj } = await supabase.from("posteur_reponses").update(maj).eq("id", l.id).eq("statut", "a_classer");
    if (errMaj) bilan.erreurs.push(`${l.id} : ${errMaj.message}`);
    else bilan.classes++;
  }
  return { ok: bilan.erreurs.length === 0, ...bilan };
}

// ---------------------------------------------------------------------------
// Prompt 21, partie R : Disputes
// ---------------------------------------------------------------------------

/**
 * 1. Les questions du tableau de bord (chat) des 2 derniers jours : l'IA dit
 *    si c'est une contestation (le déclencheur l'ajoute à Disputes).
 * 2. La réponse automatique « we're checking it », sur le canal du message
 *    (`reponses_auto` : test → simulée, rien ne part).
 */
async function traiterContestations(supabase: Supabase) {
  const { data: regl } = await supabase.from("reglages").select("cle, valeur").in("cle", ["reponses_auto", "contestation_accuse_texte"]);
  const v = Object.fromEntries((regl ?? []).map((x) => [x.cle as string, x.valeur]));
  const mode = lireModeAuto(v.reponses_auto);
  const bilan = { ok: true, mode, tableau: 0, contestations_tableau: 0, accuses: 0, simules: 0, erreurs: [] as string[] };
  if (mode === "off") return bilan;

  const { data: questions } = await supabase
    .from("chatbot_questions")
    .select("id, question")
    .eq("source", "os")
    .eq("role", "poster")
    .is("conteste_vu_at", null)
    .not("user_id", "is", null)
    .gte("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString())
    .order("created_at")
    .limit(10);
  for (const q of (questions ?? []) as { id: string; question: string | null }[]) {
    let conteste: string | null = null;
    try {
      conteste = (q.question ?? "").trim() ? lireContestation(await generateTextFast(construirePromptContestation(q.question ?? ""))) : null;
    } catch (e) {
      bilan.erreurs.push(`tableau ${q.id} : ${messageErreur(e)}`);
      continue;
    }
    await supabase.from("chatbot_questions").update({ conteste_vu_at: new Date().toISOString(), conteste }).eq("id", q.id);
    bilan.tableau++;
    if (conteste) bilan.contestations_tableau++;
  }

  const { data: file, error } = await supabase.rpc("contestations_accuses");
  if (error) throw error;
  const reel = mode === "on";
  if (reel && (await automationEnPause(supabase))) return bilan;
  for (const c of (file ?? []) as { id: string; poster_id: string; canal: string | null; prenom: string | null }[]) {
    const texte = texteAccuse(v.contestation_accuse_texte, c.prenom);
    let statut = "simule";
    let erreur: string | null = null;
    if (reel) {
      erreur = c.canal === "upwork" ? await repondreUpwork(supabase, c.poster_id, texte) : await envoyerSlack(supabase, c.poster_id, texte);
      statut = erreur ? "erreur" : "envoye";
    }
    await supabase.from("contestations")
      .update({ accuse_statut: statut, accuse_at: new Date().toISOString(), accuse_erreur: erreur, maj_at: new Date().toISOString() })
      .eq("id", c.id).eq("accuse_statut", "a_envoyer");
    await supabase.rpc("contestation_noter_journal", { p_id: c.id, p_action: "accuse", p_detail: `${statut}${erreur ? ` : ${erreur}` : ""} · ${texte}` });
    if (statut === "simule") bilan.simules++;
    else if (statut === "envoye") bilan.accuses++;
    else bilan.erreurs.push(`${c.id} : ${erreur}`);
  }
  bilan.ok = bilan.erreurs.length === 0;
  return bilan;
}

/** « Reply » sur Disputes : le texte relu par une personne, dans le canal du message (Upwork, sinon Slack). */
async function repondreContestation(supabase: Supabase, id: string, texte: string) {
  if (!id || !texte.trim()) return { ok: false, error: "id et texte requis" };
  const { data: c } = await supabase.from("contestations").select("id, poster_id, canal").eq("id", id).maybeSingle();
  if (!c) return { ok: false, error: "contestation introuvable" };
  const erreur = c.canal === "upwork"
    ? await repondreUpwork(supabase, c.poster_id as string, texte.trim())
    : await envoyerSlack(supabase, c.poster_id as string, texte.trim());
  await supabase.from("contestations")
    .update({ reponse_texte: texte.trim(), reponse_statut: erreur ? "erreur" : "envoye", reponse_at: new Date().toISOString(), maj_at: new Date().toISOString() })
    .eq("id", id);
  await supabase.rpc("contestation_noter_journal", { p_id: id, p_action: "reponse", p_detail: `${erreur ? `erreur : ${erreur}` : "envoyée"} · ${texte.trim()}` });
  return erreur ? { ok: false, error: erreur } : { ok: true, canal: c.canal === "upwork" ? "upwork" : "slack" };
}

/** Prompt 21, P3 : la fonction upwork regarde (et règle, si elle le peut) la paie du posteur. */
async function questionPaie(posterId: string, simuler: boolean): Promise<{ cas: string; texte: string | null }> {
  const base = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("CRON_SECRET");
  if (!base || !secret) return { cas: "attente", texte: null };
  try {
    const r = await fetch(`${base}/functions/v1/upwork`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": secret },
      body: JSON.stringify({ action: "paie_question", poster_id: posterId, simuler }),
    });
    const corps = await r.json().catch(() => null);
    if (!r.ok || !corps?.ok) return { cas: "attente", texte: null };
    return { cas: String(corps.cas ?? "attente"), texte: typeof corps.texte === "string" && corps.texte.trim() ? corps.texte : null };
  } catch {
    return { cas: "attente", texte: null };
  }
}

async function repondreUpwork(supabase: Supabase, posterId: string, texte: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("upwork_contract_id").eq("id", posterId).maybeSingle();
  if (!data?.upwork_contract_id) return "contrat Upwork non relié";
  return (await envoyerUpwork(data.upwork_contract_id as string, texte)).erreur;
}

// ---------------------------------------------------------------------------
// Pipeline, partie 2 : le check du lundi soir
// ---------------------------------------------------------------------------

/** Un post publié (avec son lien) ou une réponse depuis `depuis`. */
async function reactionDepuis(supabase: Supabase, posterId: string, compteId: string | null, depuis: string): Promise<boolean> {
  const [{ data: rep }, { data: slack }, posts] = await Promise.all([
    supabase.from("posteur_reponses").select("id").eq("poster_id", posterId).gte("recu_at", depuis).limit(1),
    // Prompt 21, A2 : un message dans n'importe quel canal Slack compte aussi.
    supabase.from("posteur_reactions").select("poster_id").eq("poster_id", posterId).gte("slack_at", depuis).limit(1),
    compteId
      ? supabase.from("passages").select("id").eq("compte_id", compteId).not("publie_url", "is", null).gte("publie_at", depuis).limit(1)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  return (rep ?? []).length > 0 || (slack ?? []).length > 0 || (posts.data ?? []).length > 0;
}

async function autreCompteActif(supabase: Supabase, posterId: string, compteId: string): Promise<boolean> {
  const { data } = await supabase.from("comptes").select("id").eq("poster_id", posterId).eq("is_active", true).neq("id", compteId).limit(1);
  return (data ?? []).length > 0;
}

/**
 * Chaque lundi, 20 h heure du pays : la nouvelle cohorte et les 2es comptes
 * qui démarrent, sans aucun post publié avec son lien ce jour-là → un seul
 * message sur Upwork (`lundi_soir_auto`). 48 h après, ni post ni réponse →
 * Kill (comme pendant l'accueil, `kill_auto`, 12 h pour annuler). Un 2e
 * compte : seul ce compte s'arrête.
 */
async function lundiSoir(supabase: Supabase, r: Reglages, maintenant: Date, bilan: Bilan) {
  if (r.lundiSoir === "off" || bilan.rappelsEnPause) return;
  if (bilan.automationPause) {
    await noterBloquee(supabase, { fonction: "recrues-check", action: "lundi_soir" });
    return;
  }
  // Le lundi de cette semaine et celui de la semaine d'avant (le Kill tombe le mercredi).
  const lundi = lundiParis(maintenant);
  for (const l of [lundi, ajouterJoursIso(lundi, -7)]) {
    const { data, error } = await supabase.rpc("lundi_soir_posteurs", { p_lundi: l });
    if (error) {
      bilan.erreurs.push(`lundi soir : ${error.message}`);
      return;
    }
    // Prompt 25 : Approve prépare le message (To approve) ; il part après « Send selected ».
    const test = r.lundiSoir === "test";
    for (const p of (data ?? []) as PosteurLundiSoir[]) {
      if (bilan.pauses?.has(p.poster_id)) continue;
      const envoyeAt = p.message_at ? new Date(p.message_at) : test && p.prevu_at ? new Date(p.prevu_at) : null;
      // Une réaction annule un Kill en attente.
      if (p.kill_id && (p.kill_statut === "en_attente" || p.kill_statut === "simule") && envoyeAt && reactionLundiSoir(p, envoyeAt)) {
        await supabase.from("kills_auto").update({ statut: "annule", annule_at: new Date().toISOString(), raison: "réaction reçue" })
          .eq("id", p.kill_id).in("statut", ["en_attente", "simule"]);
        bilan.killsAnnules++;
        continue;
      }
      if (l === lundi && lundiSoirDu(p, l, maintenant, r.heureLundiSoir, test)) {
        if (!bilan.prevuesConnues?.has(clePrevue(p.poster_id, "lundi_soir", l)) || test) await envoyerLundiSoir(supabase, r, p, l, test, bilan);
        continue;
      }
      if (r.kill !== "off" && (!p.kill_id || p.kill_statut === "simule") && killLundiSoir(p, envoyeAt, maintenant, r.etapes.kill_h)) {
        const reel = r.kill === "on" && !test && Boolean(p.message_at) && !p.message_erreur;
        if (p.kill_id && !reel) continue;
        const { data: id, error: errK } = await supabase.rpc("kill_noter", {
          p_poster: p.poster_id,
          p_etape: "lundi_soir",
          p_periode: l,
          p_nudge: p.message_id,
          p_message_at: envoyeAt!.toISOString(),
          p_statut: reel ? "en_attente" : "simule",
          p_annulation_h: r.etapes.kill_annulation_h,
        });
        if (errK) bilan.erreurs.push(`kill lundi soir ${p.poster_id} : ${errK.message}`);
        else {
          bilan.kills++;
          if (id && p.compte_id) await supabase.from("kills_auto").update({ compte_id: p.compte_id }).eq("id", id);
        }
      }
    }
  }
}

/** Sur Upwork seulement (dans la conversation du contrat), une fois. */
async function envoyerLundiSoir(supabase: Supabase, r: Reglages, p: PosteurLundiSoir, lundi: string, test: boolean, bilan: Bilan) {
  const cle = { poster_id: p.poster_id, type: "lundi_soir", periode: lundi };
  if (!p.contrat_id) {
    await supabase.from("relances_prevues").upsert({ ...cle, statut: "bloque", canal: null, texte: null, raison: "contrat_non_relie", maj_at: new Date().toISOString() });
    bilan.bloques++;
    return;
  }
  const texte = texteLundiSoir(r.texteLundiSoir, p.prenom);
  // Un seul message par personne : un autre profil sur le même contrat l'a déjà reçu (ou préparé).
  if (canalPour(bilan, { poster_id: p.poster_id, slack_user_id: null, contrat_id: p.contrat_id }, "lundi_soir", lundi).doublon) {
    bilan.doublons++;
    return;
  }
  if (test) {
    await supabase.from("relances_prevues").upsert({ ...cle, statut: "prevu", canal: "upwork", texte, raison: "simulation", maj_at: new Date().toISOString() });
    bilan.prevus++;
    return;
  }
  // Prompt 25 : Approve → To approve (le destinataire, le texte, les données) ; rien ne part sans « Send selected ».
  if (r.lundiSoir === "approve") {
    await supabase.from("relances_prevues").upsert({
      ...cle, statut: "prevu", canal: "upwork", texte, raison: "a_approuver", valide_at: null, maj_at: new Date().toISOString(),
      donnees: { cohorte: lundi, deuxieme_compte: p.deuxieme, posts_avec_lien_lundi: p.publies_lundi, contrat: p.contrat_id, heure_locale: `${r.heureLundiSoir}:00 (${p.fuseau})` },
    });
    noterPrepare(bilan, { poster_id: p.poster_id, slack_user_id: null, contrat_id: p.contrat_id }, "lundi_soir", lundi);
    bilan.aApprouver++;
    return;
  }
  // 0432 : dû avant le passage sur « on » → en attente.
  if (!(await peutPartir(supabase, r, bilan, {
    cle, du: instantLocal(lundi, r.heureLundiSoir, p.fuseau), onDepuis: bilan.onDepuis?.lundiSoir ?? null, canaux: ["upwork"], texte,
  }))) return;
  const { data: ligne, error: errIns } = await supabase
    .from("nudges")
    .insert({ ...cle, compte_id: p.compte_id, cible: "recrues-check", canal: "upwork", texte })
    .select("id")
    .single();
  if (errIns) {
    if (errIns.code !== "23505") bilan.erreurs.push(`lundi soir ${p.poster_id} : ${errIns.message}`);
    return;
  }
  const u = await envoyerUpwork(p.contrat_id, texte, { prioritaire: false });
  if (u.budget || u.reporter) {
    // Upwork plein aujourd'hui (ou le compte de secours n'a pas pu) : rien n'est parti, le message pourra repartir.
    await supabase.from("nudges").delete().eq("id", ligne.id);
    if (u.budget) bilan.upworkPlein = true;
    return;
  }
  const erreur = u.erreur;
  if (erreur) {
    await supabase.from("nudges").update({ slack_erreur: erreur }).eq("id", ligne.id);
    bilan.erreurs.push(`lundi soir ${p.poster_id} : ${erreur}`);
  } else {
    bilan.envoyes++;
    bilan.servis?.add(cleServi("lundi_soir", lundi, "upwork", p.contrat_id));
  }
}

// ---------------------------------------------------------------------------
// Prompt 25 v4 (0440) : les contrats de test
// ---------------------------------------------------------------------------

/** Ce que « Run now » peut envoyer au posteur de test (chaque clic : une fois, tout de suite). */
const ELEMENTS_TEST: Record<string, ElementRelance> = {
  etape0: "slack",
  etape1: "connexion",
  etape2: "tiktok",
  etape3: "warmup",
  etape4: "follows",
};

/** Le contrat de test d'un posteur TEST (null : pas un posteur de test, ou contrat retiré). */
async function contratDuPosteurTest(supabase: Supabase, posterId: string): Promise<string | null> {
  const { data } = await supabase.from("contrats_test").select("contrat_id").eq("poster_id", posterId).is("retire_at", null).maybeSingle();
  return (data?.contrat_id as string | undefined) ?? null;
}

/**
 * « Create test poster » : « TEST {prénom} », créé comme par l'accueil
 * (manage-users, mot de passe de départ), relié au contrat de test, dans la
 * cohorte du lundi suivant. Rien n'est envoyé.
 */
async function creerPosteurTest(supabase: Supabase, contrat: string, prenom: string, par: string) {
  const contratId = (contrat.match(/[0-9]{6,}/) ?? [""])[0];
  const { data: t } = await supabase.from("contrats_test").select("contrat_id, poster_id").eq("contrat_id", contratId).is("retire_at", null).maybeSingle();
  if (!t) return { ok: false, error: "ce contrat n'est pas dans Test contracts" };
  if (t.poster_id) {
    const { data: p } = await supabase.from("profiles").select("is_active").eq("id", t.poster_id).maybeSingle();
    if (p?.is_active) return { ok: false, error: "ce contrat a déjà un posteur de test actif" };
  }
  const { data: reel } = await supabase.from("profiles").select("id").eq("upwork_contract_id", contratId).eq("is_active", true).limit(1);
  if ((reel ?? []).some((x) => x.id !== t.poster_id)) return { ok: false, error: "ce contrat est relié à un vrai posteur actif" };
  const base = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("CRON_SECRET");
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !secret) return { ok: false, error: "SUPABASE_URL ou CRON_SECRET absent" };
  const nom = `TEST ${prenom.trim() || "poster"}`;
  const contratUrl = `https://www.upwork.com/nx/wm/workroom/${contratId}/overview`;
  const r = await fetch(`${base}/functions/v1/manage-users`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cron-secret": secret, ...(cle ? { authorization: `Bearer ${cle}`, apikey: cle } : {}) },
    body: JSON.stringify({
      action: "create", prenom: nom, nom: "", password: MOT_DE_PASSE_DEPART, langue: "en", type_compte: "perso", posts_par_jour: 2,
      upwork_contrat_url: contratUrl,
    }),
  });
  const cree = await r.json().catch(() => null) as { userId?: string; email?: string; error?: string } | null;
  if (!r.ok || !cree?.userId) return { ok: false, error: `création du posteur : ${cree?.error ?? `HTTP ${r.status}`}` };
  const cohorte = ajouterJoursIso(lundiParis(new Date()), 7);
  await supabase.from("profiles").update({
    upwork_contract_id: contratId, upwork_contrat_url: contratUrl, cohorte_lundi: cohorte, offre_acceptee_le: new Date().toISOString(),
  }).eq("id", cree.userId);
  await supabase.from("contrats_test").update({ poster_id: cree.userId }).eq("contrat_id", contratId);
  await supabase.from("recrue_evenements").insert({
    poster_id: cree.userId, type: "test_poster_cree", at: new Date().toISOString(), detail: `TEST : contrat ${contratId}, cohorte ${cohorte}`,
    cle: `test_poster_cree:${contratId}`,
  });
  return { ok: true, poster_id: cree.userId, email: cree.email ?? null, nom, cohorte, par };
}

/**
 * « Run now » sur le posteur de test : la bienvenue, une étape (0 Slack, 1
 * login, 2 TikTok, 3 warm-up lancé, 4 warm-up fait) ou le lundi 20 h part tout
 * de suite, pour de vrai, quel que soit l'interrupteur (Slack s'il y est, et
 * Upwork ; la bienvenue et le lundi 20 h : Upwork). « reset » : le posteur de
 * test recommence (pas connecté, Start warmup pas cliqué, cohorte du lundi
 * suivant). Tout est noté dans les Logs (type « test_… »).
 */
async function lancerTest(supabase: Supabase, posterId: string, quoi: string) {
  const contrat = await contratDuPosteurTest(supabase, posterId);
  if (!contrat) return { ok: false, error: "pas un posteur de test (Overview → Test contracts)" };
  if (await automationEnPause(supabase)) return { ok: false, error: PAUSE };
  const r = await reglages(supabase);
  const { data: p } = await supabase.from("profiles").select("prenom, email, slack_user_id, cohorte_lundi").eq("id", posterId).maybeSingle();
  if (!p) return { ok: false, error: "posteur introuvable" };
  const cohorte = (p.cohorte_lundi as string | null) ?? ajouterJoursIso(lundiParis(new Date()), 7);
  if (quoi === "reset") {
    await supabase.from("profiles").update({ premiere_connexion_at: null, cohorte_lundi: ajouterJoursIso(lundiParis(new Date()), 7) }).eq("id", posterId);
    await supabase.from("comptes").update({ warmup_started_at: null }).eq("poster_id", posterId);
    await supabase.from("relances_prevues").update({ statut: "perime", maj_at: new Date().toISOString() }).eq("poster_id", posterId).eq("statut", "prevu");
    await supabase.from("recrue_evenements").insert({
      poster_id: posterId, type: "test_reset", at: new Date().toISOString(), detail: "TEST : posteur de test remis au départ", cle: `test_reset:${Date.now()}`,
    });
    return { ok: true, quoi };
  }
  const { data: compte } = await supabase.from("comptes").select("handle_tiktok").eq("poster_id", posterId).eq("is_active", true)
    .order("created_at").limit(1).maybeSingle();
  let texte = "";
  let slack = false;
  if (quoi === "accueil") {
    texte = messageAccueil(r.texteAccueil, {
      prenom: p.prenom, url: OS_URL, email: (p.email as string | null) ?? "", mot_de_passe: MOT_DE_PASSE_DEPART, slack: r.slackLien,
      guide: GUIDE_POSTER, cohorte_lundi: cohorte,
    });
  } else if (quoi === "lundi_soir") {
    texte = texteLundiSoir(r.texteLundiSoir, p.prenom);
  } else if (ELEMENTS_TEST[quoi]) {
    const element = ELEMENTS_TEST[quoi]!;
    texte = texteRelance(r.textesRelance, { element, elements: [element], needsYou: false, follows: 3 }, {
      prenom: p.prenom, handle: (compte?.handle_tiktok as string | null) ?? null, url: OS_URL, lien_etapes: r.lienEtapes || OS_URL,
      cohorte_lundi: cohorte, email: p.email as string | null, mot_de_passe: MOT_DE_PASSE_DEPART, slack: r.slackLien,
    });
    slack = Boolean(p.slack_user_id);
  } else {
    return { ok: false, error: `« ${quoi} » inconnu` };
  }
  if (!texte.trim()) return { ok: false, error: "texte vide (réglage vide, ou lien Slack / e-mail manquant)" };
  const canaux: Canal[] = slack ? ["slack", "upwork"] : ["upwork"];
  const { data: ligne, error: errIns } = await supabase.from("nudges")
    .insert({ poster_id: posterId, type: `test_${quoi}`, periode: null, compte_id: null, cible: "test", canal: canaux[0], texte })
    .select("id").single();
  if (errIns) return { ok: false, error: errIns.message };
  const partis: string[] = [];
  const erreurs: string[] = [];
  if (slack) {
    const e = await envoyerSlack(supabase, posterId, texte, blocsBoutons(texte, r.boutons, { stop: true }));
    if (e) erreurs.push(`slack : ${e}`);
    else partis.push("slack");
  }
  const u = await envoyerUpwork(contrat, texte, { prioritaire: true });
  if (u.erreur) erreurs.push(u.erreur);
  else partis.push("upwork");
  await supabase.from("nudges").update({
    canaux: partis, erreur_canal: erreurs.join(" · ") || null, ...(partis.length === 0 ? { slack_erreur: erreurs.join(" · ") || "aucun canal" } : {}),
  }).eq("id", ligne.id);
  return { ok: partis.length > 0, quoi, partis, erreurs, texte };
}

function ajouterJoursIso(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
