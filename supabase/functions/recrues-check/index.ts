import {
  choisirCanal,
  composerTexte,
  decider,
  type Etape,
  type EtatEtape,
  etapeMercredi,
  lireDelais,
  lireMode,
  lundiParis,
  type PosteurMercredi,
} from "../_shared/relances.ts";
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
 *       5. l'étape du mercredi des posteurs actifs, les inactifs (0385/0391).
 * Jamais de nouvel essai d'envoi : un échec est noté sur la relance.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const acces = await assertRole(request, ["admin"]);
    if (acces instanceof Response) return acces;
    const body = (await request.json().catch(() => ({}))) as { action?: string };
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
      "relances_delais",
      "relance_texte_acces",
      "relance_texte_tiktok",
      "relance_texte_warmup",
      "relance_texte_mercredi",
      "slack_lien_invitation",
      "kill_auto",
      "etapes_delais",
      "etape_texte_connexion",
      "etape_texte_tiktok",
      "etape_texte_warmup_lance",
      "etape_texte_warmup_bien_fait",
      "lien_etapes_tiktok",
    ]);
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  const texte = (cle: string) => (typeof v[cle] === "string" ? (v[cle] as string) : "");
  return {
    mode: lireMode(v.relances_auto),
    delais: lireDelais(v.relances_delais),
    textes: {
      acces: texte("relance_texte_acces"),
      tiktok: texte("relance_texte_tiktok"),
      warmup: texte("relance_texte_warmup"),
      mercredi: texte("relance_texte_mercredi"),
    } as Record<Etape, string>,
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
  };
}

/** Les relances prévues déjà notées : on ne les efface que si elles existent. */
const clePrevue = (posterId: string, type: string, periode: string) => `${posterId}|${type}|${periode}`;

interface Bilan {
  mode: string;
  kill: string;
  recrues: number;
  mercredi: number;
  envoyes: number;
  prevus: number;
  bloques: number;
  rouges: number;
  resolus: number;
  kills: number;
  killsPartis: number;
  killsAnnules: number;
  erreurs: string[];
  /** Interne : les relances prévues existantes (pas rendu). */
  prevuesConnues?: Set<string>;
}

async function lireRecrues(supabase: Supabase): Promise<RecrueAccueil[]> {
  const { data, error } = await supabase.rpc("etapes_recrues");
  if (error) throw error;
  return ((data ?? []) as RecrueAccueil[]).map((x) => ({ ...x, messages: x.messages ?? [], prevues: x.prevues ?? [] }));
}

async function verifier(supabase: Supabase, maintenant: Date): Promise<Bilan & { ok: boolean }> {
  const r = await reglages(supabase);
  const bilan: Bilan = {
    mode: r.mode, kill: r.kill, recrues: 0, mercredi: 0, envoyes: 0, prevus: 0, bloques: 0, rouges: 0, resolus: 0,
    kills: 0, killsPartis: 0, killsAnnules: 0, erreurs: [],
  };
  if (r.mode === "off") return { ok: true, ...bilan };

  const { error: errCnx } = await supabase.rpc("relances_noter_connexions");
  if (errCnx) bilan.erreurs.push(`connexions : ${errCnx.message}`);

  const { data: prevues } = await supabase.from("relances_prevues").select("poster_id, type, periode");
  bilan.prevuesConnues = new Set((prevues ?? []).map((x) => clePrevue(x.poster_id, x.type, x.periode)));

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

  for (let x of recrues) {
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

  await killsEchus(supabase, r, recrues, maintenant, bilan);

  // Étape 4 : le mercredi des posteurs actifs (semaine en cours, heure de Paris).
  const lundi = lundiParis(maintenant);
  const { data: semaine, error: errSem } = await supabase.rpc("relances_mercredi", { p_lundi: lundi });
  if (errSem) bilan.erreurs.push(`mercredi : ${errSem.message}`);
  for (const p of (semaine ?? []) as PosteurMercredi[]) {
    bilan.mercredi++;
    const e = etapeMercredi(p, lundi, r.delais);
    const d = decider(e, maintenant, p.fuseau, r.delais, p.publies_semaine > 0);
    await appliquer(supabase, r, p.poster_id, null, e, d, {
      prenom: p.prenom,
      handle: null,
      slack_user_id: p.slack_user_id,
      contrat_id: p.contrat_id,
      fuseau: p.fuseau,
    }, bilan);
  }

  // Les inactifs suivent la nouvelle règle (mercredi envoyé, rien vendredi 20 h).
  const { error: errInactifs } = await supabase.rpc("inactifs_marquer");
  if (errInactifs) bilan.erreurs.push(`inactifs : ${errInactifs.message}`);
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
  if (killEnCours(x)) return;

  const d = deciderEtape(e, maintenant, x.fuseau, r.etapes, { envoyeAt: envoi.envoyeAt, reponduAt: repondu, debut: debutCohorte(x) });
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
  const erreur = canal === "slack" ? await envoyerSlack(supabase, x.poster_id, texte) : await envoyerUpwork(x.contrat_id!, texte);
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
  const { error } = await supabase
    .from("recrues_rouges")
    .upsert({ poster_id: x.poster_id, etape, periode: x.cohorte_lundi }, { onConflict: "poster_id,etape,periode", ignoreDuplicates: true });
  if (error) bilan.erreurs.push(`rouge ${x.poster_id} : ${error.message}`);
  else bilan.rouges++;
}

/**
 * Les Kills en attente dont le délai d'annulation est passé : l'arrêt complet
 * part (file `arrets`, partie C), seulement si `kill_auto` est sur « on ».
 */
async function killsEchus(supabase: Supabase, r: Reglages, recrues: RecrueAccueil[], maintenant: Date, bilan: Bilan) {
  if (r.kill !== "on") return;
  const { data, error } = await supabase
    .from("kills_auto")
    .select("id, poster_id, etape, message_at")
    .eq("statut", "en_attente")
    .lte("prevu_at", maintenant.toISOString());
  if (error) {
    bilan.erreurs.push(`kills : ${error.message}`);
    return;
  }
  const parPosteur = new Map(recrues.map((x) => [x.poster_id, x]));
  for (const k of data ?? []) {
    const brut = parPosteur.get(k.poster_id);
    const x = brut && maintenant >= debutCohorte(brut) ? { ...brut, videos: null } : brut;
    // Dernière vérification : une réaction depuis le Kill l'annule.
    const e = x ? etatsAccueil(x, r.etapes).find((y) => y.etape === k.etape) : null;
    const repondu = x ? reponduAt(x) : null;
    const reaction = Boolean(e?.fait) || (repondu !== null && k.message_at !== null && repondu >= new Date(k.message_at));
    if (reaction) {
      await supabase.from("kills_auto").update({ statut: "annule", annule_at: new Date().toISOString(), raison: e?.fait ? "étape faite" : "réponse reçue" })
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
    const { error: errArret } = await supabase.from("arrets").insert({ poster_id: k.poster_id, source: "kill_48h", kill_id: k.id });
    if (errArret && errArret.code !== "23505") {
      await supabase.from("kills_auto").update({ statut: "erreur", raison: errArret.message }).eq("id", k.id);
      bilan.erreurs.push(`arrêt ${k.poster_id} : ${errArret.message}`);
    } else {
      bilan.killsPartis++;
    }
  }
}

async function appliquer(
  supabase: Supabase,
  r: Awaited<ReturnType<typeof reglages>>,
  posterId: string,
  compteId: string | null,
  e: EtatEtape,
  d: ReturnType<typeof decider>,
  p: { prenom: string | null; handle: string | null; slack_user_id: string | null; contrat_id: string | null; fuseau: string },
  bilan: Bilan,
): Promise<void> {
  const cle = { poster_id: posterId, type: e.etape, periode: e.periode };
  const effacerPrevue = async () => {
    if (!bilan.prevuesConnues?.has(clePrevue(posterId, e.etape, e.periode))) return;
    await supabase.from("relances_prevues").delete().match(cle);
  };
  if (d.fait) {
    if (d.resoudre) {
      const { data } = await supabase
        .from("nudges")
        .update({ resolu_at: new Date().toISOString() })
        .eq("poster_id", posterId)
        .eq("type", e.etape)
        .is("resolu_at", null)
        .select("id");
      bilan.resolus += (data ?? []).length;
    }
    await effacerPrevue();
    return;
  }
  if (d.rouge) {
    const { error } = await supabase
      .from("recrues_rouges")
      .upsert({ poster_id: posterId, etape: e.etape, periode: e.periode }, { onConflict: "poster_id,etape,periode", ignoreDuplicates: true });
    if (error) bilan.erreurs.push(`rouge ${posterId} : ${error.message}`);
    else bilan.rouges++;
    await effacerPrevue();
    return;
  }
  if (!d.envoyer && !d.horsFenetre) return;

  const choix = choisirCanal(e.etape, p);
  if (choix.canal === null) {
    await supabase.from("relances_prevues").upsert({ ...cle, statut: "bloque", canal: null, texte: null, raison: choix.raison, maj_at: new Date().toISOString() });
    bilan.bloques++;
    return;
  }
  const texte = composerTexte(r.textes[e.etape], e, { prenom: p.prenom, handle: p.handle, url: OS_URL, slack: r.slack, canal: choix.canal });
  if (r.mode === "simulation" || d.horsFenetre) {
    await supabase.from("relances_prevues").upsert({
      ...cle,
      statut: "prevu",
      canal: choix.canal,
      texte,
      raison: d.horsFenetre ? "hors_fenetre" : "simulation",
      maj_at: new Date().toISOString(),
    });
    if (r.mode === "simulation") bilan.prevus++;
    return;
  }

  // Mode « on » : la ligne d'abord. L'index unique (poster, étape, période) refuse un doublon.
  const { data: ligne, error: errIns } = await supabase
    .from("nudges")
    .insert({ ...cle, compte_id: compteId, cible: "recrues-check", canal: choix.canal, texte })
    .select("id")
    .single();
  if (errIns) {
    if (errIns.code !== "23505") bilan.erreurs.push(`relance ${posterId} : ${errIns.message}`);
    return;
  }
  const erreur = choix.canal === "slack"
    ? await envoyerSlack(supabase, posterId, texte)
    : await envoyerUpwork(p.contrat_id!, texte);
  if (erreur) {
    await supabase.from("nudges").update({ slack_erreur: erreur }).eq("id", ligne.id);
    bilan.erreurs.push(`${e.etape} ${posterId} : ${erreur}`);
  } else {
    bilan.envoyes++;
  }
  await effacerPrevue();
}

async function envoyerSlack(supabase: Supabase, posterId: string, texte: string): Promise<string | null> {
  const issue = await ecrireAuPosteur(supabase, posterId, texte);
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
