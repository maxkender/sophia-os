/**
 * join — l'API de l'app « Join » (parcours posteur, 22/11, Max). POST JSON `{ action, ... }`, sans JWT, CORS ouvert.
 *
 * MODE TEST (réglage join_mode) : toutes les candidatures sont `test = true`, les codes sont renvoyés au client
 * (`codes_test`) pour être affichés à l'écran, un email réel ne part que vers un testeur (join_mode.testeurs_emails),
 * aucun WhatsApp n'est envoyé. Slack, Ruul, Upwork et la création de compte OS sont SIMULÉS (journal
 * join_evenements). Jamais d'utilisateur Supabase Auth ni de ligne `profiles`.
 *
 * Session : un jeton aléatoire renvoyé au client (en-tête `authorization: Bearer <jeton>` ou champ `jeton`),
 * gardé haché (sha256) dans join_sessions. Une session courte (24 h) est ouverte à la candidature pour les codes,
 * la décision et la signature ; la signature (ou la reconnexion) ouvre une session de 30 jours.
 *
 * Actions : visite, pays_et_paie, candidater, verifier, renvoyer_code, decision, contrat, signer, connexion_code,
 * connexion, moi, etape ; `relances` (cron horaire, x-cron-secret) : relance des codes et du contrat, expiration à
 * J+7, et enchaînement automatique après la signature (compte OS → Slack → Ruul → message d'accès).
 *
 * 0841 (v2) : formulaire inspiré du site Lovable (18+, canal d'arrivée, parrain, tarif accepté, engagement, opt-in
 * WhatsApp horodaté, champ piège, limites par email et IP), provenance (ref/UTM/fbclid), pays fermés enregistrés
 * sans codes, signature avec nom légal + email Ruul et date limite (dimanche minuit Paris → sinon lundi suivant),
 * contrat join-v2.
 */
import { corsHeaders, estSecretCron, json, serviceClient } from "../_shared/supabase.ts";
import { envoyerWhatsApp } from "../_shared/whatsapp_envoi.ts";
import { envoyerEmailSite, rendreEmailRuul } from "../_shared/ruul.ts";
import { lireProfilTiktok } from "../_shared/profil_tiktok.ts";
import {
  type CandidatureJoin,
  CODE_DUREE_MIN,
  CODE_ESSAIS_MAX,
  CONSENTEMENT,
  CONSENTEMENT_WHATSAPP,
  CONTRAT_RESUME,
  CONTRAT_TEXTE,
  CONTRAT_VERSION,
  cohorteASignature,
  cohorteDe,
  dateLimiteSignature,
  decider,
  emailAutorise,
  estEtapeJoin,
  etapeRelanceSignature,
  etapesRestantes,
  etatCode,
  genererCode,
  genererJeton,
  handlePropose,
  jourParis,
  lireModeJoin,
  lundiLisible,
  MESSAGE_A_TRAITER,
  type ModeJoin,
  nettoyerHandle,
  nettoyerSource,
  paysEtPaie,
  premierPost,
  relanceCodeDue,
  sha256Hex,
  texteContratComplet,
  texteMessage,
  validerCandidature,
} from "../_shared/join.ts";

type Db = ReturnType<typeof serviceClient>;
type Corps = Record<string, unknown>;
type Candidature = CandidatureJoin & {
  id: string;
  test: boolean;
  whatsapp_e164: string;
  langue: string;
  email_verifie_at: string | null;
  decision: "auto" | "a_traiter" | null;
  decision_at: string | null;
  manques: string[];
  cohorte: string | null;
  handle_tiktok: string | null;
  ruul_visible: boolean;
  whatsapp_optin_at: string | null;
  expire_at: string | null;
  cree_at: string;
};

const HEURE = 3_600_000;
const SESSION_COURTE_H = 24;
const SESSION_LONGUE_H = 24 * 30;

const erreur = (message: string, status = 400) => json({ ok: false, error: message }, status);

const JOIN_URL = () => Deno.env.get("JOIN_URL") ?? "https://join.vikstudios.com";

function aujourdhuiParis(): string {
  return jourParis(new Date());
}

function ipDe(request: Request): string | null {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
}

async function lireMode(db: Db): Promise<ModeJoin> {
  const { data } = await db.from("reglages").select("valeur").eq("cle", "join_mode").maybeSingle();
  return lireModeJoin(data?.valeur);
}

async function evenement(db: Db, type: string, candidatureId: string | null, test: boolean, detail: Corps = {}) {
  const { error } = await db.from("join_evenements").insert({ type, candidature_id: candidatureId, test, detail });
  if (error) console.error("join_evenements", type, error.message);
}

/** Une action réelle qui n'est pas faite : journalisée comme simulée. */
function simuler(db: Db, c: Candidature, quoi: string, detail: Corps = {}) {
  return evenement(db, "simule", c.id, c.test, { quoi, ...detail });
}

async function ouvrirSession(db: Db, candidatureId: string, heures: number): Promise<string> {
  const jeton = genererJeton();
  const { error } = await db.from("join_sessions").insert({
    jeton_hash: await sha256Hex(jeton),
    candidature_id: candidatureId,
    expire_at: new Date(Date.now() + heures * HEURE).toISOString(),
  });
  if (error) throw new Error(`session : ${error.message}`);
  return jeton;
}

async function candidatureDeSession(db: Db, request: Request, b: Corps): Promise<Candidature | null> {
  const entete = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const jeton = typeof b.jeton === "string" && b.jeton ? b.jeton : entete;
  if (!jeton || jeton.length < 20) return null;
  const { data: s } = await db.from("join_sessions").select("candidature_id, expire_at")
    .eq("jeton_hash", await sha256Hex(jeton)).maybeSingle();
  if (!s || new Date(s.expire_at).getTime() < Date.now()) return null;
  const { data } = await db.from("join_candidatures").select("*").eq("id", s.candidature_id).maybeSingle();
  return (data as Candidature | null) ?? null;
}

/** Crée un code (haché) ; renvoie le code en clair pour l'email (testeur) ou l'affichage à l'écran (test). */
async function creerCode(db: Db, candidatureId: string, canal: "email" | "whatsapp" | "connexion"): Promise<string> {
  const code = genererCode();
  const { error } = await db.from("join_verifications").insert({
    candidature_id: candidatureId,
    canal,
    code_hash: await sha256Hex(code),
    expire_at: new Date(Date.now() + CODE_DUREE_MIN * 60_000).toISOString(),
  });
  if (error) throw new Error(`code : ${error.message}`);
  return code;
}

/** L'email du code : en test, seulement vers un testeur. Renvoie l'état pour le journal. */
async function envoyerCodeEmail(mode: ModeJoin, c: Candidature, code: string): Promise<"envoye" | "bloque"> {
  if (!emailAutorise(mode, c.email)) return "bloque";
  const objet = `Your Vik Studios code: ${code}`;
  const { html, texte } = rendreEmailRuul({
    objet,
    corps: `Hi ${c.prenom},\n\nYour verification code is ${code}\n\nIt expires in ${CODE_DUREE_MIN} minutes. If you didn't ask for it, ignore this email.`,
    lienStop: JOIN_URL(),
    sansPied: true,
  });
  const r = await envoyerEmailSite(c.email, objet, html, texte, JOIN_URL(), ["join", "join-code", mode.mode]);
  return r.ok ? "envoye" : "bloque";
}

/**
 * Le code WhatsApp : par WhatsApp seulement si un modèle d'authentification est configuré (join_mode.modele_code,
 * accord WhatsApp donné) ; envoyerWhatsApp applique le mode test (numéros autorisés). Sinon : rien ne part.
 */
async function envoyerCodeWhatsapp(db: Db, mode: ModeJoin, c: Candidature, code: string): Promise<"envoye" | "bloque" | "simule"> {
  if (!mode.modele_code || !c.whatsapp_optin_at) return "simule";
  const r = await envoyerWhatsApp(db, {
    e164: c.whatsapp_e164, motif: "join_code", cle: `join_code:${c.id}:${code}`,
    modele: { nom: mode.modele_code, langue: "en", variables: [code] },
  });
  return r.ok ? "envoye" : "bloque";
}

/** Un message au candidat (email, et WhatsApp si accord + modèle). En test : seulement vers les testeurs. */
async function message(
  db: Db, mode: ModeJoin, c: Candidature, type: Parameters<typeof texteMessage>[0],
  v: { lundi?: string; limite?: string; lien?: string }, whatsapp: string | null,
) {
  const lien = v.lien ?? JOIN_URL();
  const m = texteMessage(type, { prenom: c.prenom, lien, lundi: v.lundi, limite: v.limite });
  if (emailAutorise(mode, c.email) || mode.mode === "live") {
    const { html, texte } = rendreEmailRuul({
      objet: m.objet, corps: m.corps, bouton: m.bouton ? { texte: m.bouton, lien } : null, lienStop: JOIN_URL(), sansPied: true,
    });
    const r = await envoyerEmailSite(c.email, m.objet, html, texte, JOIN_URL(), ["join", `join-${type}`, mode.mode]);
    await journaliserRelance(db, c, type, "email", r.ok ? "envoye" : "bloque");
  } else {
    await journaliserRelance(db, c, type, "email", "bloque");
  }
  if (whatsapp && c.whatsapp_optin_at) {
    const r = await envoyerWhatsApp(db, {
      e164: c.whatsapp_e164, motif: `join_${type}`, cle: `join_${type}:${c.id}`,
      modele: { nom: whatsapp, langue: "en", variables: [c.prenom, lien] },
    });
    await journaliserRelance(db, c, type, "whatsapp", r.ok ? "envoye" : "bloque");
  }
}

async function journaliserRelance(db: Db, c: Candidature, etape: string, canal: string, statut: "simule" | "envoye" | "bloque") {
  await db.from("join_relances").insert({ candidature_id: c.id, etape, canal, statut });
}

/** La candidature à laquelle on se reconnecte : la plus récente non expirée de cette adresse. */
async function candidatureParEmail(db: Db, email: string): Promise<Candidature | null> {
  if (!email) return null;
  const { data } = await db.from("join_candidatures").select("*").eq("email", email).is("expire_at", null)
    .order("cree_at", { ascending: false }).limit(1).maybeSingle();
  return (data as Candidature | null) ?? null;
}

async function etapesFaites(db: Db, id: string): Promise<string[]> {
  const { data } = await db.from("join_relances").select("etape").eq("candidature_id", id);
  return [...new Set((data ?? []).map((r) => r.etape as string))];
}

/**
 * Après la signature, tout s'enchaîne seul : compte OS, Slack, Ruul, puis le message d'accès (email + WhatsApp
 * account_ready). Idempotent (journal join_relances) : le cron reprend ce qui manque. EN TEST, compte OS, Slack et
 * Ruul sont SIMULÉS ; le message d'accès ne part qu'aux testeurs.
 */
async function enchainer(db: Db, mode: ModeJoin, c: Candidature, lundi: string) {
  const faites = await etapesFaites(db, c.id);
  for (const e of etapesRestantes(faites)) {
    if (e === "acces") {
      await message(db, mode, c, "acces", { lundi: lundiLisible(lundi) }, "account_ready");
      continue;
    }
    // compte_os, slack, ruul : jamais réels tant que Join n'est pas passé en live sur l'OK de Max.
    await simuler(db, c, e === "compte_os" ? "creation_compte_os" : e === "slack" ? "invitation_slack" : "invitation_ruul");
    await journaliserRelance(db, c, e, "systeme", "simule");
    if (e === "slack") await majEtape(db, c.id, "slack", "simule", { auto_at: new Date().toISOString() });
  }
}

/** Le cron horaire : relance des codes, relances et expiration du contrat, reprise de l'enchaînement. */
async function relances(db: Db, mode: ModeJoin) {
  const maintenant = new Date();
  const depuis = new Date(maintenant.getTime() - 14 * 24 * HEURE).toISOString();
  const { data } = await db.from("join_candidatures").select("*").gte("cree_at", depuis).is("expire_at", null).limit(500);
  const bilan = { codes: 0, signature: 0, expirees: 0, enchainees: 0 };
  for (const c of (data ?? []) as Candidature[]) {
    const faites = await etapesFaites(db, c.id);
    const { data: sig } = await db.from("join_signatures").select("id").eq("candidature_id", c.id).limit(1).maybeSingle();
    if (sig) {
      if (etapesRestantes(faites).length) {
        await enchainer(db, mode, c, cohorteASignature(c.cohorte, maintenant));
        bilan.enchainees++;
      }
      continue;
    }
    if (!c.decision) {
      const verifie = !!c.email_verifie_at && !!c.whatsapp_verifie_at;
      if (!c.manques?.some((m) => m.startsWith("pays fermé"))) {
        if (relanceCodeDue(c.cree_at, verifie, faites.includes("code_rappel"), maintenant)) {
          await message(db, mode, c, "code_rappel", {}, null);
          bilan.codes++;
        }
      }
      continue;
    }
    if (c.decision !== "auto" || !c.decision_at) continue;
    const etape = etapeRelanceSignature(c.decision_at, faites, maintenant);
    if (!etape) continue;
    if (etape === "expirer") {
      await db.from("join_candidatures").update({ expire_at: maintenant.toISOString(), maj_at: maintenant.toISOString() }).eq("id", c.id);
      await evenement(db, "expiree", c.id, c.test);
      await message(db, mode, c, "expiree", {}, null);
      bilan.expirees++;
      continue;
    }
    const lundi = cohorteASignature(c.cohorte, maintenant);
    const limite = new Date(dateLimiteSignature(lundi).getTime() - 60_000);
    await message(db, mode, c, etape, {
      lundi: lundiLisible(lundi),
      limite: limite.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }),
    }, "contract_to_sign");
    bilan.signature++;
  }
  return bilan;
}

async function paysOuverts(db: Db) {
  const [z, p, f] = await Promise.all([
    db.from("zones_paie").select("zone, tarif"),
    db.from("zones_paie_pays").select("pays, zone, retire_at").is("retire_at", null),
    db.from("parrainage_pays").select("pays").eq("recrutement_ouvert", false),
  ]);
  if (z.error || p.error || f.error) throw new Error("lecture des pays impossible");
  return paysEtPaie(z.data ?? [], p.data ?? [], (f.data ?? []).map((x) => x.pays as string));
}

async function etapesDe(db: Db, id: string) {
  const { data } = await db.from("join_etapes").select("etape, statut, valeur, maj_at").eq("candidature_id", id);
  return data ?? [];
}

async function majEtape(db: Db, id: string, etape: string, statut: string, valeur: unknown) {
  const { error } = await db.from("join_etapes").upsert(
    { candidature_id: id, etape, statut, valeur, maj_at: new Date().toISOString() },
    { onConflict: "candidature_id,etape" },
  );
  if (error) throw new Error(`étape : ${error.message}`);
}

function vueCandidature(c: Candidature) {
  return {
    id: c.id, test: c.test, prenom: c.prenom, nom: c.nom, email: c.email, whatsapp: c.whatsapp_e164, pays: c.pays,
    langue: c.langue, email_verifie: !!c.email_verifie_at, whatsapp_verifie: !!c.whatsapp_verifie_at,
    decision: c.decision, cohorte: c.cohorte, handle_tiktok: c.handle_tiktok, whatsapp_optin: !!c.whatsapp_optin_at,
    ferme: !!c.manques?.some((m) => m.startsWith("pays fermé")) && !c.decision,
  };
}

// ---------------------------------------------------------------------------------------------------------------

async function traiter(request: Request, db: Db, b: Corps): Promise<Response> {
  const action = String(b.action ?? "");
  // Sans action : 401 (le contrôle de démarrage du déploiement attend 401/403 sur un appel vide).
  if (!action) return erreur("action", 401);
  const mode = await lireMode(db);
  const enTest = mode.mode === "test";

  switch (action) {
    case "relances": {
      // Le cron horaire (x-cron-secret) : jamais appelable par le site.
      if (!(await estSecretCron(request.headers.get("x-cron-secret")))) return erreur("unauthorized", 401);
      return json({ ok: true, mode: mode.mode, ...(await relances(db, mode)) });
    }

    case "visite": {
      await evenement(db, "visite", null, enTest, {
        langue: String(b.langue ?? "").slice(0, 5), source: String(b.source ?? "").slice(0, 100),
      });
      return json({ ok: true });
    }

    case "pays_et_paie":
      return json({ ok: true, mode: mode.mode, ...(await paysOuverts(db)) });

    case "candidater": {
      const v = validerCandidature(b);
      if (!v.ok) return json({ ok: false, error: "invalid", fields: v.erreurs.filter((e) => e !== "site") }, 400);
      const ip = ipDe(request);
      const ipHash = ip ? await sha256Hex(`join:${ip}`) : null;
      // Limites (les testeurs en sont exemptés) : une candidature par email et par 24 h, 5 par IP et par heure.
      if (!emailAutorise(mode, v.valeurs.email)) {
        const jour = new Date(Date.now() - 24 * HEURE).toISOString();
        const { count: parEmail } = await db.from("join_candidatures").select("id", { count: "exact", head: true })
          .eq("email", v.valeurs.email).gte("cree_at", jour);
        const { count: parIp } = ipHash
          ? await db.from("join_candidatures").select("id", { count: "exact", head: true })
            .eq("ip_hash", ipHash).gte("cree_at", new Date(Date.now() - HEURE).toISOString())
          : { count: 0 };
        if ((parEmail ?? 0) > 0 || (parIp ?? 0) >= 5) return erreur("rate", 429);
      }
      const { pays } = await paysOuverts(db);
      const ouvert = pays.some((p) => p.pays === v.valeurs.pays);
      const maintenant = new Date().toISOString();
      const { entendu, parrain, whatsapp_optin, majeur, ...valeurs } = v.valeurs;
      const { data, error } = await db.from("join_candidatures").insert({
        ...valeurs, majeur, entendu, parrain, test: enTest, consentement_at: maintenant,
        whatsapp_optin_at: whatsapp_optin ? maintenant : null,
        source: nettoyerSource(b.source), ip_hash: ipHash,
        manques: ouvert ? [] : [`pays fermé (${v.valeurs.pays})`],
      }).select("*").single();
      if (error || !data) return erreur("enregistrement impossible", 500);
      const c = data as Candidature;
      await evenement(db, "candidature", c.id, c.test, {
        pays: c.pays, langue: c.langue, ouvert, entendu, consentement: CONSENTEMENT,
        ...(whatsapp_optin ? { consentement_whatsapp: CONSENTEMENT_WHATSAPP } : {}),
      });
      // Pays fermé : la candidature est gardée (on écrit quand le pays ouvre), sans codes ni session.
      if (!ouvert) return json({ ok: true, ferme: true, mode: mode.mode });
      const codeEmail = await creerCode(db, c.id, "email");
      const codeWhatsapp = await creerCode(db, c.id, "whatsapp");
      const email = await envoyerCodeEmail(mode, c, codeEmail);
      await journaliserRelance(db, c, "code", "email", email);
      await journaliserRelance(db, c, "code", "whatsapp", await envoyerCodeWhatsapp(db, mode, c, codeWhatsapp));
      const jeton = await ouvrirSession(db, c.id, SESSION_COURTE_H);
      return json({
        ok: true, candidature_id: c.id, jeton, mode: mode.mode, email_envoye: email === "envoye",
        ...(enTest ? { codes_test: { email: codeEmail, whatsapp: codeWhatsapp } } : {}),
      });
    }

    case "renvoyer_code": {
      const c = await candidatureDeSession(db, request, b);
      if (!c) return erreur("session", 401);
      const canal = b.canal === "whatsapp" ? "whatsapp" : "email";
      const code = await creerCode(db, c.id, canal);
      const etat = canal === "email" ? await envoyerCodeEmail(mode, c, code) : await envoyerCodeWhatsapp(db, mode, c, code);
      await journaliserRelance(db, c, "code", canal, etat);
      return json({ ok: true, ...(enTest ? { codes_test: { [canal]: code } } : {}) });
    }

    case "verifier": {
      const c = await candidatureDeSession(db, request, b);
      if (!c) return erreur("session", 401);
      const canal = b.canal === "whatsapp" ? "whatsapp" : "email";
      const { data: ver } = await db.from("join_verifications").select("*")
        .eq("candidature_id", c.id).eq("canal", canal).order("cree_at", { ascending: false }).limit(1).maybeSingle();
      if (!ver) return erreur("no_code");
      const etat = etatCode(ver, await sha256Hex(String(b.code ?? "").replace(/\D/g, "")));
      if (etat === "faux") {
        await db.from("join_verifications").update({ essais: ver.essais + 1 }).eq("id", ver.id);
        return json({ ok: false, error: "wrong_code", essais_restants: Math.max(0, CODE_ESSAIS_MAX - ver.essais - 1) }, 400);
      }
      if (etat === "expire" || etat === "trop_essais") return json({ ok: false, error: etat }, 400);
      const maintenant = new Date().toISOString();
      if (etat === "ok") {
        await db.from("join_verifications").update({ verifie_at: maintenant, essais: ver.essais + 1 }).eq("id", ver.id);
        const col = canal === "email" ? "email_verifie_at" : "whatsapp_verifie_at";
        await db.from("join_candidatures").update({ [col]: maintenant, maj_at: maintenant }).eq("id", c.id);
        if (canal === "email") c.email_verifie_at = maintenant;
        else c.whatsapp_verifie_at = maintenant;
        if (c.email_verifie_at && c.whatsapp_verifie_at) await evenement(db, "verifiee", c.id, c.test);
      }
      return json({ ok: true, email_verifie: !!c.email_verifie_at, whatsapp_verifie: !!c.whatsapp_verifie_at });
    }

    case "decision": {
      const c = await candidatureDeSession(db, request, b);
      if (!c) return erreur("session", 401);
      if (!c.email_verifie_at || !c.whatsapp_verifie_at) return erreur("not_verified");
      if (!c.decision) {
        const { pays } = await paysOuverts(db);
        const d = decider(c, new Set(pays.map((p) => p.pays)));
        const maintenant = new Date().toISOString();
        const cohorte = d.decision === "auto" ? cohorteDe(aujourdhuiParis()) : null;
        await db.from("join_candidatures").update({
          decision: d.decision, decision_at: maintenant, manques: d.manques, cohorte, maj_at: maintenant,
        }).eq("id", c.id);
        await evenement(db, d.decision === "auto" ? "acceptee" : "a_traiter", c.id, c.test, { manques: d.manques });
        c.decision = d.decision;
        c.cohorte = cohorte;
      }
      const lundi = c.decision === "auto" ? cohorteASignature(c.cohorte) : null;
      return json({
        ok: true, decision: c.decision, cohorte: lundi,
        ...(lundi ? { date_limite: new Date(dateLimiteSignature(lundi).getTime() - 60_000).toISOString() } : {}),
        ...(c.decision === "a_traiter" ? { message: MESSAGE_A_TRAITER } : {}),
      });
    }

    case "contrat": {
      const c = await candidatureDeSession(db, request, b);
      const lundi = c?.decision === "auto" ? cohorteASignature(c.cohorte) : null;
      return json({
        ok: true, version: CONTRAT_VERSION, resume: CONTRAT_RESUME, texte: CONTRAT_TEXTE,
        ...(c ? { email: c.email, nom: `${c.prenom} ${c.nom}`.trim(), cohorte: lundi } : {}),
      });
    }

    case "signer": {
      const c = await candidatureDeSession(db, request, b);
      if (!c) return erreur("session", 401);
      if (c.decision !== "auto") return erreur("not_accepted", 403);
      if (c.expire_at) return erreur("expired", 410);
      const nomLegal = String(b.nom_legal ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
      const ruulEmail = String(b.ruul_email ?? "").trim().toLowerCase().slice(0, 200);
      const champs: string[] = [];
      if (nomLegal.length < 3 || !/\s/.test(nomLegal)) champs.push("nom_legal");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ruulEmail)) champs.push("ruul_email");
      const { data: deja } = await db.from("join_signatures").select("id").eq("candidature_id", c.id).limit(1).maybeSingle();
      if (!deja && champs.length) return json({ ok: false, error: "invalid", fields: champs }, 400);
      let lundi = cohorteASignature(c.cohorte);
      if (!deja) {
        const texte = `${texteContratComplet()}\n\nSigned by: ${nomLegal}\nRuul email: ${ruulEmail}`;
        const { error } = await db.from("join_signatures").insert({
          candidature_id: c.id, version: CONTRAT_VERSION, texte, sha256: await sha256Hex(texte),
          nom_legal: nomLegal, ruul_email: ruulEmail,
          ip: ipDe(request), user_agent: (request.headers.get("user-agent") ?? "").slice(0, 500) || null,
        });
        if (error) return erreur("signature impossible", 500);
        await evenement(db, "signee", c.id, c.test, { version: CONTRAT_VERSION, lundi });
        const handle = handlePropose(c.prenom);
        await majEtape(db, c.id, "tiktok", "a_faire", { propose: handle });
        // Signé après la date limite : le départ glisse au lundi suivant.
        await db.from("join_candidatures").update({ handle_tiktok: handle, cohorte: lundi, maj_at: new Date().toISOString() }).eq("id", c.id);
        c.cohorte = lundi;
        // Tout s'enchaîne seul (simulé en test) : compte OS → Slack → Ruul → message d'accès.
        await enchainer(db, mode, c, lundi);
      } else {
        lundi = c.cohorte ?? lundi;
      }
      const jeton = await ouvrirSession(db, c.id, SESSION_LONGUE_H);
      await evenement(db, "connectee", c.id, c.test, { via: "signature" });
      return json({ ok: true, jeton, cohorte: lundi });
    }

    case "connexion_code": {
      const email = String(b.email ?? "").trim().toLowerCase();
      const data = await candidatureParEmail(db, email);
      // Toujours ok : la réponse ne dit pas si l'adresse existe (sauf l'affichage du code en test).
      if (!data) return json({ ok: true });
      const c = data as Candidature;
      const code = await creerCode(db, c.id, "connexion");
      await journaliserRelance(db, c, "connexion", "email", await envoyerCodeEmail(mode, c, code));
      return json({ ok: true, ...(enTest ? { codes_test: { email: code } } : {}) });
    }

    case "connexion": {
      const email = String(b.email ?? "").trim().toLowerCase();
      const data = await candidatureParEmail(db, email);
      if (!data) return erreur("wrong_code");
      const c = data as Candidature;
      const { data: ver } = await db.from("join_verifications").select("*")
        .eq("candidature_id", c.id).eq("canal", "connexion").order("cree_at", { ascending: false }).limit(1).maybeSingle();
      if (!ver) return erreur("wrong_code");
      const etat = etatCode(ver, await sha256Hex(String(b.code ?? "").replace(/\D/g, "")));
      if (etat !== "ok") {
        if (etat === "faux") await db.from("join_verifications").update({ essais: ver.essais + 1 }).eq("id", ver.id);
        return erreur(etat === "faux" ? "wrong_code" : etat);
      }
      await db.from("join_verifications").update({ verifie_at: new Date().toISOString() }).eq("id", ver.id);
      // Le code reçu par email prouve l'adresse : elle est vérifiée si elle ne l'était pas encore.
      if (!c.email_verifie_at) {
        await db.from("join_candidatures").update({ email_verifie_at: new Date().toISOString(), maj_at: new Date().toISOString() }).eq("id", c.id);
      }
      const jeton = await ouvrirSession(db, c.id, SESSION_LONGUE_H);
      await evenement(db, "connectee", c.id, c.test, { via: "code" });
      return json({ ok: true, jeton });
    }

    case "moi": {
      const c = await candidatureDeSession(db, request, b);
      if (!c) return erreur("session", 401);
      const etapes = await etapesDe(db, c.id);
      const { data: sig } = await db.from("join_signatures").select("signe_at, version").eq("candidature_id", c.id)
        .limit(1).maybeSingle();
      const warmupFini = etapes.some((e) => e.etape === "warmup" && e.statut === "fait");
      const premier = c.cohorte ? premierPost(c.cohorte, warmupFini, aujourdhuiParis()) : null;
      const lundiOffre = c.decision === "auto" && !sig ? cohorteASignature(c.cohorte) : null;
      return json({
        ok: true, mode: mode.mode, candidature: vueCandidature(c), signature: sig ?? null, etapes,
        expiree: !!c.expire_at,
        ...(lundiOffre ? { offre: { cohorte: lundiOffre, date_limite: new Date(dateLimiteSignature(lundiOffre).getTime() - 60_000).toISOString() } } : {}),
        premier_post: premier, premier_post_texte: premier ? `Your first post is on ${lundiLisible(premier)}` : null,
        profil_suggere: {
          nom: c.prenom,
          bio: "Daily slides that make you smarter ✨",
          photo: "A natural photo of you, or a calm aesthetic picture (no logo, no text).",
        },
        ruul_visible: c.ruul_visible,
      });
    }

    case "etape": {
      const c = await candidatureDeSession(db, request, b);
      if (!c) return erreur("session", 401);
      const etape = b.etape;
      if (!estEtapeJoin(etape)) return erreur("etape inconnue");
      const valeur = (b.valeur && typeof b.valeur === "object" ? b.valeur : {}) as Corps;

      if (etape === "tiktok") {
        // « I created it » (handle proposé) ou le vrai handle saisi : vérification en lecture seule.
        const handle = nettoyerHandle(String(valeur.handle ?? c.handle_tiktok ?? ""));
        if (!handle) return erreur("handle invalide");
        const profil = await lireProfilTiktok(handle);
        const statut = profil.existe === true ? "ok" : profil.existe === false ? "introuvable" : "illisible";
        await majEtape(db, c.id, "tiktok", statut, { handle, verifie_at: new Date().toISOString(), erreur: profil.erreur });
        await db.from("join_candidatures").update({ handle_tiktok: handle, maj_at: new Date().toISOString() }).eq("id", c.id);
        if (statut === "ok") await evenement(db, "tiktok_ok", c.id, c.test, { handle });
        return json({ ok: true, statut, handle });
      }
      if (etape === "profil") {
        await majEtape(db, c.id, "profil", "fait", { fait_at: new Date().toISOString() });
        return json({ ok: true, statut: "fait" });
      }
      if (etape === "warmup") {
        const jour = Math.max(0, Math.min(7, Number(valeur.jour ?? 0) || 0));
        const fini = valeur.fini === true;
        await majEtape(db, c.id, "warmup", fini ? "fait" : "en_cours", { jour, ...(fini ? { fini_at: new Date().toISOString() } : {}) });
        if (fini) await evenement(db, "warmup", c.id, c.test);
        return json({ ok: true, statut: fini ? "fait" : "en_cours" });
      }
      if (etape === "slack") {
        // SIMULÉ : aucune invitation Slack réelle.
        await majEtape(db, c.id, "slack", "simule", { demande_at: new Date().toISOString() });
        await simuler(db, c, "invitation_slack");
        await evenement(db, "slack", c.id, c.test, { simule: true });
        return json({ ok: true, statut: "simule" });
      }
      // ruul : seulement derrière le drapeau (après une semaine de posts) ; jamais réel en test.
      if (!c.ruul_visible) return erreur("ruul pas encore ouvert", 403);
      await majEtape(db, c.id, "ruul", "simule", { demande_at: new Date().toISOString() });
      await simuler(db, c, "ruul");
      return json({ ok: true, statut: "simule" });
    }
  }
  return erreur("action inconnue", 404);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return erreur("POST attendu", 405);
  let b: Corps;
  try {
    b = await request.json();
  } catch {
    return erreur("JSON attendu");
  }
  try {
    return await traiter(request, serviceClient(), b ?? {});
  } catch (e) {
    console.error("join", e instanceof Error ? e.message : String(e));
    return erreur("erreur interne", 500);
  }
});
