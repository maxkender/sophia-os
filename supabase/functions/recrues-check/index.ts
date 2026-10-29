import { instantLocal, lireMode, lundiParis, partiesLocales, rappelsEnPause } from "../_shared/relances.ts";
import { automationEnPause, noterBloquee, PAUSE } from "../_shared/pause.ts";
import { passageDu } from "../_shared/frequences.ts";
import {
  canalEtape,
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
  texteEtape,
} from "../_shared/etapes.ts";
import { lireModeAuto, type ModeAuto } from "../_shared/accueil.ts";
import {
  ceQuiManqueRecrue,
  jeudiDu,
  killLundiSoir,
  lundiDu,
  lundiSoirDu,
  type PosteurLundiSoir,
  type PosteurSemaine,
  reactionLundiSoir,
  texteJeudi,
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
    const acces = await assertRole(request, ["admin"]);
    if (acces instanceof Response) return acces;
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action === "reponses") return json(await traiterReponses(serviceClient(), new Date()));
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
      "slack_lien_invitation",
      "kill_auto",
      "etapes_delais",
      "etape_texte_connexion",
      "etape_texte_tiktok",
      "etape_texte_warmup_lance",
      "etape_texte_warmup_bien_fait",
      "lien_etapes_tiktok",
      "lundi_message_auto",
      "lundi_texte_tous",
      "lundi_texte_cohorte",
      "lundi_texte_warmup",
      "jeudi_texte",
      "semaine_heures",
      "lundi_soir_auto",
      "lundi_soir_texte",
      "lundi_soir_heure",
      "rappels_reprise_le",
      "slack_boutons",
    ]);
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  const texte = (cle: string) => (typeof v[cle] === "string" ? (v[cle] as string) : "");
  return {
    mode: lireMode(v.relances_auto),
    slack: texte("slack_lien_invitation"),
    kill: lireModeAuto(v.kill_auto) as ModeAuto,
    etapes: lireDelaisAccueil(v.etapes_delais),
    textesEtapes: {
      connexion: texte("etape_texte_connexion"),
      tiktok: texte("etape_texte_tiktok"),
      warmup_lance: texte("etape_texte_warmup_lance"),
      warmup_bien_fait: texte("etape_texte_warmup_bien_fait"),
    } as Record<EtapeAccueil, string>,
    lienEtapes: texte("lien_etapes_tiktok"),
    lundi: lireModeAuto(v.lundi_message_auto) as ModeAuto,
    textesLundi: { tous: texte("lundi_texte_tous"), cohorte: texte("lundi_texte_cohorte"), warmup: texte("lundi_texte_warmup") },
    texteJeudi: texte("jeudi_texte"),
    heures: lireHeuresSemaine(v.semaine_heures),
    lundiSoir: lireModeAuto(v.lundi_soir_auto) as ModeAuto,
    texteLundiSoir: texte("lundi_soir_texte"),
    boutons: lireLibellesBoutons(v.slack_boutons),
    repriseRappels: typeof v.rappels_reprise_le === "string" ? (v.rappels_reprise_le as string) : null,
    heureLundiSoir: Number.isFinite(Number(v.lundi_soir_heure)) && v.lundi_soir_heure !== null ? Number(v.lundi_soir_heure) : 20,
  };
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
  /** Interne : les relances prévues existantes (pas rendu). */
  prevuesConnues?: Set<string>;
  /** Interne : les posteurs en pause (malade, absent, partie E). */
  pauses?: Set<string>;
}

async function lireRecrues(supabase: Supabase): Promise<RecrueAccueil[]> {
  const { data, error } = await supabase.rpc("etapes_recrues");
  if (error) throw error;
  return ((data ?? []) as RecrueAccueil[]).map((x) => ({ ...x, messages: x.messages ?? [], prevues: x.prevues ?? [] }));
}

async function verifier(supabase: Supabase, maintenant: Date): Promise<Bilan & { ok: boolean }> {
  const r = await reglages(supabase);
  const bilan: Bilan = {
    mode: r.mode, kill: r.kill, recrues: 0, semaine: 0, envoyes: 0, prevus: 0, bloques: 0, rouges: 0, resolus: 0,
    kills: 0, killsPartis: 0, killsAnnules: 0, rappelsEnPause: rappelsEnPause(r.repriseRappels, maintenant),
    automationPause: await automationEnPause(supabase), erreurs: [],
  };
  if (r.mode === "off") return { ok: true, ...bilan };

  const { error: errCnx } = await supabase.rpc("relances_noter_connexions");
  if (errCnx) bilan.erreurs.push(`connexions : ${errCnx.message}`);

  const { data: prevues } = await supabase.from("relances_prevues").select("poster_id, type, periode");
  bilan.prevuesConnues = new Set((prevues ?? []).map((x) => clePrevue(x.poster_id, x.type, x.periode)));

  // Partie E : en pause (malade, absent), ni message ni Kill automatique.
  const { data: pauses } = await supabase.from("posteur_pauses").select("poster_id").gt("jusqu_au", maintenant.toISOString());
  bilan.pauses = new Set((pauses ?? []).map((x) => x.poster_id as string));

  let recrues = await lireRecrues(supabase);
  const test = r.mode === "simulation";

  // Avant un message « connexion » : la liaison Slack relancée, une fois pour tout le passage.
  const connexionDue = recrues.some((x) =>
    !killEnCours(x) &&
    etatsAccueil(x, r.etapes).some((e) => e.etape === "connexion" && decision(x, e, maintenant, r.etapes, test).envoyer)
  );
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

  // Prompt 21 : le cron passe toutes les 15 min ; « Step checks » dit si les 4 étapes et les
  // relances passent cette fois. Les Kills, eux, sont vérifiés à chaque passage.
  const etapesDues = await passageDu(supabase, "etapes");
  bilan.etapes = etapesDues;
  for (let x of etapesDues ? recrues : []) {
    // Cohorte commencée : ses vidéos sont ses posts, pas un warm-up raté.
    if (maintenant >= debutCohorte(x)) x = { ...x, videos: null };
    let etats = etatsAccueil(x, r.etapes);
    // Étapes tiktok et warm-up : un relevé TikTok à jour avant d'écrire ou de tuer.
    const aRelever = !killEnCours(x) && x.handle && x.compte_id && etats.some((e) =>
      e.etape !== "connexion" && (() => {
        const d = decision(x, e, maintenant, r.etapes, test);
        return d.envoyer || d.kill;
      })()
    );
    if (aRelever) {
      const frais = await releverTiktok(supabase, x).catch(() => null);
      if (frais) {
        x = maintenant >= debutCohorte(frais) ? { ...frais, videos: null } : frais;
        etats = etatsAccueil(x, r.etapes);
      }
    }
    for (const e of etats) await appliquerEtape(supabase, r, x, e, maintenant, test, bilan);
    await rougeDimanche(supabase, r, x, maintenant, bilan);
  }

  // Prompt 21, A2 : juste avant les Kills, les conversations Upwork de ceux qui en ont un dû.
  if (await lireAvantKills(supabase, r, maintenant, bilan)) recrues = await lireRecrues(supabase);
  await killsEchus(supabase, r, recrues, maintenant, bilan);

  // Une fois par heure (le passage de :00) : le message du lundi, le Nudge du jeudi, le
  // check du lundi soir et les inactifs, comme quand le cron passait toutes les heures.
  if (maintenant.getUTCMinutes() < 15) {
    // Partie D : le message du lundi et le Nudge du jeudi (semaine en cours, heure de Paris).
    await semaine(supabase, r, recrues, maintenant, bilan);
    // Pipeline, partie 2 : le check du lundi soir (1er jour de posts).
    await lundiSoir(supabase, r, maintenant, bilan);

    // Les inactifs : Nudge du jeudi envoyé, rien publié depuis vendredi 20 h (0404).
    const { error: errInactifs } = await supabase.rpc("inactifs_marquer");
    if (errInactifs) bilan.erreurs.push(`inactifs : ${errInactifs.message}`);
  }
  delete bilan.prevuesConnues;
  return { ok: bilan.erreurs.length === 0, ...bilan };
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
  return {
    ...x,
    tiktok_existe: p.existe,
    tiktok_vu_at: x.tiktok_vu_at ?? (p.existe ? new Date().toISOString() : null),
    abonnements: p.abonnements ?? x.abonnements,
    videos: p.videos ?? x.videos,
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

async function appliquerEtape(
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
  const effacerPrevue = async () => {
    if (!bilan.prevuesConnues?.has(clePrevue(x.poster_id, e.etape, periode))) return;
    await supabase.from("relances_prevues").delete().match(cle);
  };
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

  if (e.fait) {
    if (x.messages.some((m) => m.type === e.etape)) {
      const { data } = await supabase
        .from("nudges")
        .update({ resolu_at: new Date().toISOString() })
        .eq("poster_id", x.poster_id)
        .eq("type", e.etape)
        .is("resolu_at", null)
        .select("id");
      bilan.resolus += (data ?? []).length;
    }
    await effacerPrevue();
    return;
  }
  if (killEnCours(x) || bilan.pauses?.has(x.poster_id) || bilan.rappelsEnPause) return;

  const d = deciderEtape(e, maintenant, x.fuseau, r.etapes, { envoyeAt: envoi.envoyeAt, reponduAt: repondu, debut: debutCohorte(x) });
  // Prompt 22 : en pause, ni message ni Kill ; l'action est notée, et reprise au passage suivant la reprise.
  if (bilan.automationPause) {
    if (d.kill || d.envoyer) {
      await noterBloquee(supabase, { fonction: "recrues-check", action: d.kill ? `kill_${e.etape}` : `message_${e.etape}`, poster_id: x.poster_id });
    }
    return;
  }
  if (d.kill) {
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
    else bilan.kills++;
    return;
  }
  if (!d.envoyer && !d.horsFenetre) return;

  const canal = canalEtape(x);
  if (canal === null) {
    await supabase.from("relances_prevues").upsert({ ...cle, statut: "bloque", canal: null, texte: null, raison: "contrat_non_relie", maj_at: new Date().toISOString() });
    bilan.bloques++;
    return;
  }
  const texte = texteEtape(r.textesEtapes[e.etape], e, {
    prenom: x.prenom,
    handle: x.handle,
    url: OS_URL,
    lien_etapes: r.lienEtapes || OS_URL,
    cohorte_lundi: x.cohorte_lundi,
  });
  if (test || d.horsFenetre) {
    await supabase.from("relances_prevues").upsert({
      ...cle,
      statut: "prevu",
      canal,
      texte,
      raison: d.horsFenetre ? "hors_fenetre" : "simulation",
      maj_at: new Date().toISOString(),
    });
    if (test) bilan.prevus++;
    return;
  }

  // Mode « on » : la ligne d'abord. L'index unique (poster, étape, période) refuse un doublon.
  const { data: ligne, error: errIns } = await supabase
    .from("nudges")
    .insert({ ...cle, compte_id: x.compte_id, cible: "recrues-check", canal, texte })
    .select("id")
    .single();
  if (errIns) {
    if (errIns.code !== "23505") bilan.erreurs.push(`relance ${x.poster_id} : ${errIns.message}`);
    return;
  }
  const erreur = canal === "slack"
    ? await envoyerSlack(supabase, x.poster_id, texte, blocsBoutons(texte, r.boutons))
    : await envoyerUpwork(x.contrat_id!, texte);
  if (erreur) {
    await supabase.from("nudges").update({ slack_erreur: erreur }).eq("id", ligne.id);
    bilan.erreurs.push(`${e.etape} ${x.poster_id} : ${erreur}`);
  } else {
    bilan.envoyes++;
  }
  await effacerPrevue();
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
  const parPosteur = new Map(recrues.map((x) => [x.poster_id, x]));
  for (const k of data ?? []) {
    const brut = parPosteur.get(k.poster_id);
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

/** Par la fonction `upwork` (le seul endroit qui parle à Upwork), sans nouvel essai. */
async function envoyerUpwork(contratId: string, texte: string): Promise<string | null> {
  const base = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("CRON_SECRET");
  if (!base || !secret) return "SUPABASE_URL ou CRON_SECRET absent";
  try {
    const r = await fetch(`${base}/functions/v1/upwork`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cron-secret": secret },
      body: JSON.stringify({ action: "message", contrat_id: contratId, texte }),
    });
    const corps = await r.json().catch(() => null);
    if (!r.ok || !corps?.ok) return `upwork : ${corps?.error ?? `HTTP ${r.status}`}`;
    return null;
  } catch (e) {
    return `upwork : ${messageErreur(e)}`;
  }
}

// ---------------------------------------------------------------------------
// Système du 2 nov., partie D : le lundi et le jeudi
// ---------------------------------------------------------------------------

async function semaine(supabase: Supabase, r: Reglages, recrues: RecrueAccueil[], maintenant: Date, bilan: Bilan) {
  if (bilan.rappelsEnPause) return;
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
  const recrue = new Map(recrues.map((x) => [x.poster_id, x]));
  // Le message du mercredi n'existe plus (0404) : ses lignes « prévu » ne s'affichent plus.
  await supabase.from("relances_prevues").delete().eq("type", "mercredi");
  for (const p of (data ?? []) as PosteurSemaine[]) {
    bilan.semaine++;
    if (bilan.pauses?.has(p.poster_id)) continue;
    const posteur = { ...p, envoyes: p.envoyes ?? [], prevus_test: p.prevus_test ?? [] };
    if (r.lundi !== "off" && lundiDu(posteur, lundi, maintenant, { debut: r.heures.lundi_heure, fin: r.heures.fin })) {
      const x = recrue.get(p.poster_id);
      const nouvelle = p.cohorte_lundi === lundi;
      const manque = nouvelle && x ? ceQuiManqueRecrue(etatsAccueil(x, r.etapes), { url: OS_URL, handle: x.handle }) : null;
      const texte = texteLundi(r.textesLundi, { prenom: p.prenom, nouvelleCohorte: nouvelle, ceQuiManque: manque });
      await envoyerSemaine(supabase, posteur, "lundi", lundi, texte, r.lundi === "on", bilan, r.boutons);
    }
    if (r.mode !== "off" && jeudiDu(posteur, lundi, maintenant, { heure: r.heures.jeudi_heure, fin: r.heures.fin })) {
      const texte = texteJeudi(r.texteJeudi, { prenom: p.prenom, faits: p.faits_lun_mer, attendus: p.attendus_lun_mer });
      await envoyerSemaine(supabase, posteur, "jeudi", lundi, texte, r.mode === "on", bilan, r.boutons);
    }
  }
}

/** Un message de la semaine : en test, noté « prévu » ; sinon la ligne d'abord, puis l'envoi (jamais deux). */
async function envoyerSemaine(
  supabase: Supabase,
  p: PosteurSemaine,
  type: "lundi" | "jeudi",
  lundi: string,
  texte: string,
  reel: boolean,
  bilan: Bilan,
  boutons: LibellesBoutons,
) {
  const cle = { poster_id: p.poster_id, type, periode: lundi };
  const canal = canalEtape(p);
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
  const { data: ligne, error: errIns } = await supabase
    .from("nudges")
    .insert({ ...cle, compte_id: null, cible: "recrues-check", canal, texte })
    .select("id")
    .single();
  if (errIns) {
    if (errIns.code !== "23505") bilan.erreurs.push(`${type} ${p.poster_id} : ${errIns.message}`);
    return;
  }
  const erreur = canal === "slack"
    ? await envoyerSlack(supabase, p.poster_id, texte, blocsBoutons(texte, boutons))
    : await envoyerUpwork(p.contrat_id!, texte);
  if (erreur) {
    await supabase.from("nudges").update({ slack_erreur: erreur }).eq("id", ligne.id);
    bilan.erreurs.push(`${type} ${p.poster_id} : ${erreur}`);
  } else {
    bilan.envoyes++;
  }
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
      slack: t("slack_lien_invitation", "").trim() || "https://join.slack.com/t/sophia-system/shared_invite/zt-4ef0h51pi-utjxbNZ7ArY_6iwy3DWazA",
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
  return await envoyerUpwork(data.upwork_contract_id as string, texte);
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
    const test = r.lundiSoir !== "on";
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
        await envoyerLundiSoir(supabase, r, p, l, test, bilan);
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
  if (test) {
    await supabase.from("relances_prevues").upsert({ ...cle, statut: "prevu", canal: "upwork", texte, raison: "simulation", maj_at: new Date().toISOString() });
    bilan.prevus++;
    return;
  }
  const { data: ligne, error: errIns } = await supabase
    .from("nudges")
    .insert({ ...cle, compte_id: p.compte_id, cible: "recrues-check", canal: "upwork", texte })
    .select("id")
    .single();
  if (errIns) {
    if (errIns.code !== "23505") bilan.erreurs.push(`lundi soir ${p.poster_id} : ${errIns.message}`);
    return;
  }
  const erreur = await envoyerUpwork(p.contrat_id, texte);
  if (erreur) {
    await supabase.from("nudges").update({ slack_erreur: erreur }).eq("id", ligne.id);
    bilan.erreurs.push(`lundi soir ${p.poster_id} : ${erreur}`);
  } else bilan.envoyes++;
}

function ajouterJoursIso(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
