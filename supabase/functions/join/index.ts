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
 *
 * 0847 (admin, 23/11) : actions `admin_*` réservées aux admins de l'OS (même Supabase Auth : email + mot de passe ;
 * is_admin() vérifié côté serveur à CHAQUE appel avec le JWT de l'admin, champ `admin_jwt`) : connexion,
 * rafraîchissement, liste, fiche, accepter / refuser, interrupteur « Acceptation automatique » (réglage
 * join_auto_acceptation, OFF par défaut, journalisé). OFF : une candidature qui remplit les conditions attend
 * l'admin. ON : elle est acceptée seule. v4 : l'interrupteur ne décide QUE de l'acceptation ; tout candidat accepté
 * (admin ou automatique) est relié à l'OS juste après sa signature (relierOS), en live seulement : en test, la
 * création reste SIMULÉE. Contrat join-v4. Bienvenue après signature : lien « Set my password ».
 */
import { corsHeaders, estSecretCron, json, serviceClient } from "../_shared/supabase.ts";
import { lienMotDePasse } from "../_shared/lien_mot_de_passe.ts";
import { envoyerWhatsApp } from "../_shared/whatsapp_envoi.ts";
import { type EmailRuul, envoyerEmailSite, PIED_EN, rendreEmailRuul } from "../_shared/ruul.ts";
import { langueTraduite, traduireChamps } from "../_shared/traduction_email.ts";
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
  deciderAvecReglage,
  decisionsAdminPossibles,
  emailAutorise,
  estEtapeJoin,
  etapeAdmin,
  etapeRelanceSignature,
  etapesRestantes,
  etatCode,
  genererCode,
  genererJeton,
  handlePropose,
  jourParis,
  langueEmailJoin,
  LIEN_DASHBOARD_OS,
  lireAutoAcceptation,
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
  TYPES_MESSAGE_JOIN,
  type TypeMessageJoin,
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
  decision: "auto" | "a_traiter" | "refusee" | null;
  decision_at: string | null;
  manques: string[];
  cohorte: string | null;
  handle_tiktok: string | null;
  ruul_visible: boolean;
  whatsapp_optin_at: string | null;
  expire_at: string | null;
  cree_at: string;
  /** 0847 : l'identité OS créée (live seulement). */
  profile_id?: string | null;
  email_os?: string | null;
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

/** 0847 : l'interrupteur « Acceptation automatique » (absent ou illisible : OFF). */
async function lireAuto(db: Db): Promise<boolean> {
  const { data } = await db.from("reglages").select("valeur").eq("cle", "join_auto_acceptation").maybeSingle();
  return lireAutoAcceptation(data?.valeur);
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

/**
 * 24/11 (Max) : les emails au candidat partent dans sa langue (celle du site au moment de la candidature, toutes les
 * langues de Join). L'anglais reste la source, traduit à l'envoi puis gardé (traductions_emails, comme les emails
 * Ruul) ; le prénom, le code, les liens, les @ et les emails restent exacts. Traduction impossible : l'anglais.
 */
async function emailDansSaLangue(db: Db, c: Candidature, e: EmailRuul, secrets: string[] = []): Promise<{ objet: string; html: string; texte: string }> {
  const langue = langueEmailJoin(c.langue);
  if (!langueTraduite(langue)) return { objet: e.objet, ...rendreEmailRuul(e) };
  const [{ champs: t }, { champs: pied }] = await Promise.all([
    traduireChamps(db, langue, { objet: e.objet, corps: e.corps, bouton: e.bouton?.texte ?? null }, [c.prenom, ...secrets]),
    traduireChamps(db, langue, { ...PIED_EN }),
  ]);
  const r = rendreEmailRuul({
    ...e, objet: t.objet, corps: t.corps, bouton: e.bouton ? { texte: t.bouton ?? e.bouton.texte, lien: e.bouton.lien } : e.bouton,
    langue, pied,
  });
  return { objet: t.objet, ...r };
}

/** L'email du code : en test, seulement vers un testeur. Renvoie l'état pour le journal. */
async function envoyerCodeEmail(db: Db, mode: ModeJoin, c: Candidature, code: string): Promise<"envoye" | "bloque"> {
  if (!emailAutorise(mode, c.email)) return "bloque";
  const { objet, html, texte } = await emailDansSaLangue(db, c, {
    objet: `Your Vik Studios code: ${code}`,
    corps: `Hi ${c.prenom},\n\nYour verification code is ${code}\n\nIt expires in ${CODE_DUREE_MIN} minutes. If you didn't ask for it, ignore this email.`,
    lienStop: JOIN_URL(),
    sansPied: true,
  }, [code]);
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
  db: Db, mode: ModeJoin, c: Candidature, type: TypeMessageJoin,
  v: Omit<Parameters<typeof texteMessage>[1], "prenom" | "lien"> & { lien?: string }, whatsapp: string | null,
) {
  const lien = v.lien ?? JOIN_URL();
  const m = texteMessage(type, { ...v, prenom: c.prenom, lien });
  if (emailAutorise(mode, c.email) || mode.mode === "live") {
    const { objet, html, texte } = await emailDansSaLangue(db, c, {
      objet: m.objet, corps: m.corps, bouton: m.bouton ? { texte: m.bouton, lien } : null, lienStop: JOIN_URL(), sansPied: true,
    }, [v.login, v.handle, v.ruulEmail].filter((x): x is string => !!x));
    const r = await envoyerEmailSite(c.email, objet, html, texte, JOIN_URL(), ["join", `join-${type}`, mode.mode]);
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

/** « Sunday 29 November » : la veille du lundi de départ (date limite lisible, heure de Paris). */
function limiteLisible(lundi: string): string {
  return new Date(dateLimiteSignature(lundi).getTime() - 60_000)
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
}

/**
 * Après la signature, tout s'enchaîne seul : compte OS, Slack, Ruul, puis le message d'accès (email de bienvenue
 * + WhatsApp account_ready). Idempotent (journal join_relances) : le cron horaire reprend ce qui manque. EN TEST,
 * compte OS, Slack et Ruul sont SIMULÉS ; le message d'accès ne part qu'aux testeurs.
 *
 * v4 (23/11, Max) : en LIVE, tout candidat accepté — à la main dans /admin ou par l'acceptation automatique — est
 * relié à l'OS juste après sa signature, par UN seul chemin (relierOS). L'interrupteur « Acceptation automatique »
 * ne décide que de l'acceptation, jamais de la création OS.
 */
async function enchainer(db: Db, mode: ModeJoin, c: Candidature, lundi: string) {
  const faites = await etapesFaites(db, c.id);
  const reel = mode.mode === "live" && !c.test;
  for (const e of etapesRestantes(faites)) {
    if (e === "acces") {
      await messageAcces(db, mode, c, lundi, reel);
      continue;
    }
    if (!reel) {
      // Test : jamais réel (compte OS, Slack, Ruul simulés).
      await simuler(db, c, e === "compte_os" ? "creation_compte_os" : e === "slack" ? "invitation_slack" : "invitation_ruul");
      await journaliserRelance(db, c, e, "systeme", "simule");
      if (e === "slack") await majEtape(db, c.id, "slack", "simule", { auto_at: new Date().toISOString() });
      continue;
    }
    if (e === "compte_os") {
      if (!(await relierOS(db, c, lundi))) return; // échec : le cron horaire réessaie (tout est idempotent)
      await journaliserRelance(db, c, e, "systeme", "envoye");
      continue;
    }
    // Live, Slack et Ruul : rien à envoyer d'ici. Le lien Slack et le guide Ruul sont dans la bienvenue ; le posteur
    // est relié à Slack par son email (slack_relier_regles) et à Ruul par son profil (canal_paie ruul, ruul_statut
    // « a_ajouter », email Ruul) : l'invitation Ruul et les relances suivent le parcours Ruul de l'OS.
    await evenement(db, "compte_os", c.id, c.test, { etape: e, relie_os: true });
    await journaliserRelance(db, c, e, "systeme", "envoye");
    if (e === "slack") await majEtape(db, c.id, "slack", "lien_envoye", { at: new Date().toISOString() });
  }
}

type ProfilOS = { id: string; email: string | null };

/**
 * Une fiche posteur qui a déjà cet email (email perso, email Ruul, email du site Lovable, candidature Ruul) : la
 * candidature y est LIÉE, sans rien créer ni écrire sur la fiche existante. Lecture seule.
 */
async function posteurExistant(db: Db, emails: string[]): Promise<ProfilOS | null> {
  for (const email of [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]) {
    for (const col of ["email_perso", "ruul_email"] as const) {
      const { data } = await db.from("profiles").select("id, email").eq(col, email).limit(1).maybeSingle();
      if (data) return data as ProfilOS;
    }
    const { data: h } = await db.from("hub_posteurs").select("profile_id").eq("email_perso", email).not("profile_id", "is", null)
      .limit(1).maybeSingle();
    const { data: rc } = h ? { data: null } : await db.from("ruul_candidatures").select("os_profile_id").eq("email", email)
      .not("os_profile_id", "is", null).limit(1).maybeSingle();
    const id = (h?.profile_id ?? rc?.os_profile_id) as string | undefined;
    if (id) {
      const { data } = await db.from("profiles").select("id, email").eq("id", id).maybeSingle();
      if (data) return data as ProfilOS;
    }
  }
  return null;
}

/** La fiche créée par Join pour cette candidature (hub_posteurs.hub_id = id de la candidature). */
async function creeParJoin(db: Db, c: Candidature): Promise<boolean> {
  if (!c.profile_id) return false;
  const { data } = await db.from("hub_posteurs").select("hub_id").eq("hub_id", c.id).eq("profile_id", c.profile_id).limit(1).maybeSingle();
  return !!data;
}

/**
 * v4 (live seulement) : LE chemin qui relie un candidat signé à l'OS. Idempotent par candidature :
 *  1. déjà relié (join_candidatures.profile_id) : rien ;
 *  2. une fiche posteur a déjà son email : liée, rien n'est créé ni écrit sur cette fiche ;
 *  3. sinon : créée par hub-posteurs `creer_posteur` (le chemin de l'ancien site : manage-users `create`, compte
 *     TikTok et persona, cohorte Ruul, canal_paie ruul, ruul_statut « a_ajouter », email Ruul, zone, tarif, lundi de
 *     départ, parrainage) ; hub_id = id de la candidature, un rejeu ne crée jamais un second posteur. Puis, pour
 *     cette NOUVELLE fiche : la candidature copiée dans ruul_candidatures (pages Candidats / Cohortes Ruul, pays de
 *     paie, langue des emails, Slack par email) et le numéro WhatsApp dans posteur_contacts.
 * Renvoie false en cas d'échec (le cron réessaie).
 */
async function relierOS(db: Db, c: Candidature, lundi: string): Promise<boolean> {
  if (c.profile_id) return true;
  const { data: sig } = await db.from("join_signatures").select("ruul_email, signe_at").eq("candidature_id", c.id).limit(1).maybeSingle();
  const existant = await posteurExistant(db, [c.email, sig?.ruul_email ?? ""]);
  if (existant) {
    await db.from("join_candidatures").update({ profile_id: existant.id, email_os: existant.email, maj_at: new Date().toISOString() })
      .eq("id", c.id);
    c.profile_id = existant.id;
    c.email_os = existant.email;
    await evenement(db, "compte_os", c.id, c.test, { ok: true, lie: true, profile_id: existant.id });
    return true;
  }
  const cree = await creerCompteOS(db, c, lundi, sig?.ruul_email ?? "");
  if (!cree) return false;
  await copierDansOS(db, c, lundi, sig?.ruul_email ?? null, sig?.signe_at ?? new Date().toISOString());
  return true;
}

async function creerCompteOS(db: Db, c: Candidature, lundi: string, ruulEmail: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("OS_HUB_SECRET");
  if (!url || !secret) {
    console.error("join compte_os : SUPABASE_URL ou OS_HUB_SECRET manquant");
    return false;
  }
  const p = (await paysOuverts(db)).pays.find((x) => x.pays === c.pays);
  const source = ((c as unknown as { source?: Record<string, string> }).source ?? {});
  try {
    const r = await fetch(`${url}/functions/v1/hub-posteurs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-secret": secret },
      body: JSON.stringify({
        action: "creer_posteur", hub_id: c.id, prenom: c.prenom, nom: c.nom, email_perso: c.email, pays_code: c.pays,
        ruul_email: ruulEmail, ref: source.ref ?? null, plateforme_paie: "ruul", zone: p?.zone ?? null,
        tarif_semaine: p?.tarif ?? null, start_monday: lundi, application_id: `join:${c.id}`,
      }),
      signal: AbortSignal.timeout(100_000),
    });
    const x = await r.json().catch(() => null) as { ok?: boolean; profile_id?: string; email_os?: string; error?: string } | null;
    if (!r.ok || !x?.ok || !x.profile_id) {
      console.error("join compte_os", r.status, x?.error ?? "");
      await evenement(db, "compte_os", c.id, c.test, { ok: false, erreur: String(x?.error ?? `HTTP ${r.status}`).slice(0, 300) });
      return false;
    }
    // Le handle TikTok est celui du compte créé par l'OS (il remplace la proposition de Join).
    const { data: compte } = await db.from("comptes").select("handle_tiktok").eq("poster_id", x.profile_id).eq("is_active", true)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    const handle = (compte?.handle_tiktok as string | null) ?? c.handle_tiktok;
    await db.from("join_candidatures").update({
      profile_id: x.profile_id, email_os: x.email_os ?? null, handle_tiktok: handle, maj_at: new Date().toISOString(),
    }).eq("id", c.id);
    c.profile_id = x.profile_id;
    c.email_os = x.email_os ?? null;
    c.handle_tiktok = handle;
    if (compte?.handle_tiktok) await majEtape(db, c.id, "tiktok", "a_faire", { propose: handle });
    await evenement(db, "compte_os", c.id, c.test, { ok: true, cree: true, profile_id: x.profile_id });
    return true;
  } catch (e) {
    console.error("join compte_os", e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** La nouvelle fiche reliée aux pages et règles de l'OS qui lisent l'ancien site (best effort, journalisé). */
async function copierDansOS(db: Db, c: Candidature, lundi: string, ruulEmail: string | null, signeAt: string) {
  const cand = c as Candidature & { decision_par?: string | null; entendu?: string | null; parrain?: string | null; source?: Record<string, string> };
  const ref = cand.source?.ref ?? null;
  const { error } = await db.from("ruul_candidatures").upsert({
    site_id: c.id, nom: `${c.prenom} ${c.nom}`.trim(), email: c.email, pays: c.pays, pays_brut: c.pays, adulte: true,
    deux_telephones: c.deux_telephones, a_telephone: true, reponses: c.reponses ?? {},
    referral: cand.entendu === "referral" || !!ref, parrain_nom: cand.parrain ?? null, ref, langue: c.langue,
    // « join_signed » : jamais repris par les étapes de l'ancien site (pending / accepted).
    statut_site: "join_signed", cree_at: c.cree_at, accepte_at: c.decision_at, signe_at: signeAt,
    os_cree_at: new Date().toISOString(), os_profile_id: c.profile_id, start_monday: lundi, ruul_email: ruulEmail,
    decision: cand.decision_par ? "acceptee" : "auto", decide_at: c.decision_at, decide_par: cand.decision_par ?? null,
    envoi: null,
  }, { onConflict: "site_id" });
  if (error) console.error("join ruul_candidatures", error.message);
  const { error: errWa } = await db.from("posteur_contacts").upsert({
    poster_id: c.profile_id, whatsapp_e164: c.whatsapp_e164, whatsapp_optin_at: c.whatsapp_optin_at, source: "join",
  }, { onConflict: "poster_id", ignoreDuplicates: true });
  if (errWa) console.error("join posteur_contacts", errWa.message);
  await evenement(db, "compte_os", c.id, c.test, { copie_os: !error, contact_whatsapp: !errWa });
}

/**
 * La bienvenue après la signature (email + WhatsApp account_ready) : accès au dashboard de l'OS par le lien
 * personnel « Set my password » (jamais de mot de passe), étapes, Slack, Ruul. En test (aucun compte créé) : le
 * texte le dit, et l'email ne part qu'aux testeurs. En live, la bienvenue du parcours Ruul de l'OS est notée comme
 * envoyée pour ce nouveau posteur (jamais deux bienvenues). Une fiche existante liée (même email) ne reçoit pas de
 * bienvenue : elle a déjà ses accès.
 */
async function messageAcces(db: Db, mode: ModeJoin, c: Candidature, lundi: string, reel: boolean) {
  if (reel && !(await creeParJoin(db, c))) {
    await journaliserRelance(db, c, "acces", "email", "bloque");
    await evenement(db, "compte_os", c.id, c.test, { bienvenue: "non envoyée : fiche existante liée" });
    return;
  }
  const { data: sig } = await db.from("join_signatures").select("ruul_email").eq("candidature_id", c.id).limit(1).maybeSingle();
  let lien: string | undefined;
  if (reel && c.profile_id) {
    const { data: jeton, error } = await db.rpc("mot_de_passe_lien_creer", { p_poster: c.profile_id, p_par: "join" });
    if (error || typeof jeton !== "string" || !jeton) {
      console.error("join acces : lien Set my password", error?.message ?? "non créé");
      return; // le cron réessaie : jamais de bienvenue sans le lien
    }
    lien = lienMotDePasse(LIEN_DASHBOARD_OS, jeton);
  }
  await message(db, mode, c, "acces", {
    lien, compteCree: !!lien, login: c.email_os ?? null, handle: c.handle_tiktok, ruulEmail: sig?.ruul_email ?? null,
    lundi: lundiLisible(lundi), limite: limiteLisible(lundi),
  }, "account_ready");
  if (reel && c.profile_id) {
    const { error } = await db.from("ruul_parcours_envois").upsert(
      { poster_id: c.profile_id, cle: "bienvenue", type: "bienvenue", ok: true, canaux: ["join"], erreur: null, envoye_at: new Date().toISOString() },
      { onConflict: "poster_id,cle" },
    );
    if (error) console.error("join acces : ruul_parcours_envois", error.message);
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
    await message(db, mode, c, etape, { lundi: lundiLisible(lundi), limite: limiteLisible(lundi) }, "contract_to_sign");
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
// Admin (0847) : réservé aux admins de l'OS. Le JWT Supabase Auth de l'admin arrive dans `admin_jwt` (l'en-tête
// authorization porte la session du candidat) ; is_admin() est vérifié à chaque appel, par PostgREST avec ce JWT
// (signature vérifiée, auth.uid() = l'admin). Un non-admin ne reçoit rien.
// ---------------------------------------------------------------------------------------------------------------

function sujetJwt(jwt: string): string | null {
  try {
    const charge = jwt.split(".")[1];
    const sub = JSON.parse(atob(charge.replace(/-/g, "+").replace(/_/g, "/"))).sub;
    return typeof sub === "string" && sub ? sub : null;
  } catch {
    return null;
  }
}

/** L'admin du JWT (is_admin() vrai), ou null. */
async function adminDuJwt(jwt: unknown): Promise<{ id: string } | null> {
  if (typeof jwt !== "string" || jwt.split(".").length !== 3) return null;
  const sub = sujetJwt(jwt);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!sub || !url || !anon) return null;
  // PostgREST vérifie la signature du JWT ; is_admin() lit auth.uid() = l'admin.
  const r = await fetch(`${url}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: anon, authorization: `Bearer ${jwt}` },
    body: "{}",
  }).catch(() => null);
  if (!r?.ok) return null;
  return (await r.json().catch(() => null)) === true ? { id: sub } : null;
}

/** Connexion (email + mot de passe) ou rafraîchissement auprès de Supabase Auth ; les jetons ne sont rendus qu'à un admin. */
async function jetonsAdmin(corps: Record<string, string>, grant: "password" | "refresh_token"): Promise<Response> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return erreur("configuration", 500);
  const r = await fetch(`${url}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: anon },
    body: JSON.stringify(corps),
  });
  const x = await r.json().catch(() => null) as { access_token?: string; refresh_token?: string; expires_in?: number; user?: { email?: string } } | null;
  if (!r.ok || !x?.access_token) return erreur(grant === "password" ? "identifiants" : "session", 401);
  const admin = await adminDuJwt(x.access_token);
  if (!admin) {
    // Pas admin : la session ouverte est refermée tout de suite, rien n'est rendu.
    await fetch(`${url}/auth/v1/logout`, { method: "POST", headers: { apikey: anon, authorization: `Bearer ${x.access_token}` } })
      .catch(() => null);
    return erreur("forbidden", 403);
  }
  return json({ ok: true, access_token: x.access_token, refresh_token: x.refresh_token, expires_in: x.expires_in ?? 3600, email: x.user?.email ?? null });
}

/** La ligne de la liste de l'admin. */
function ligneAdmin(c: Candidature & Record<string, unknown>, signee: boolean) {
  const etape = etapeAdmin(c, signee);
  const source = (c.source ?? {}) as Record<string, string>;
  return {
    id: c.id, test: c.test, prenom: c.prenom, nom: c.nom, email: c.email, pays: c.pays, cree_at: c.cree_at, maj_at: c.maj_at,
    etape, email_verifie: !!c.email_verifie_at, whatsapp_verifie: !!c.whatsapp_verifie_at, decision: c.decision,
    eligible: c.decision === "a_traiter" ? !(c.manques ?? []).length : null, manques: c.manques ?? [],
    cohorte: c.cohorte, whatsapp_optin: !!c.whatsapp_optin_at, entendu: c.entendu ?? null, parrain: c.parrain ?? null,
    source: source.ref ? `ref:${source.ref}` : source.utm_source ?? (c.entendu as string | null) ?? null,
    ...decisionsAdminPossibles(etape),
  };
}

async function signeesParmi(db: Db, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data } = await db.from("join_signatures").select("candidature_id").in("candidature_id", ids).limit(900);
  return new Set((data ?? []).map((x) => x.candidature_id as string));
}

async function traiterAdmin(db: Db, b: Corps, mode: ModeJoin, action: string): Promise<Response> {
  if (action === "admin_connexion") {
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    if (!email || !password) return erreur("identifiants", 400);
    return await jetonsAdmin({ email, password }, "password");
  }
  if (action === "admin_rafraichir") {
    const refresh = String(b.refresh_token ?? "");
    if (!refresh) return erreur("session", 401);
    return await jetonsAdmin({ refresh_token: refresh }, "refresh_token");
  }
  const admin = await adminDuJwt(b.admin_jwt);
  if (!admin) return erreur("forbidden", 403);

  switch (action) {
    case "admin_liste": {
      const { data, error } = await db.from("join_candidatures").select("*").order("cree_at", { ascending: false }).limit(500);
      if (error) return erreur(error.message, 500);
      const lignes = (data ?? []) as (Candidature & Record<string, unknown>)[];
      const signees = await signeesParmi(db, lignes.map((c) => c.id));
      return json({
        ok: true, mode: mode.mode, auto_acceptation: await lireAuto(db),
        candidatures: lignes.map((c) => ligneAdmin(c, signees.has(c.id))), lu_at: new Date().toISOString(),
      });
    }

    case "admin_fiche": {
      const id = String(b.id ?? "");
      const { data: c } = await db.from("join_candidatures").select("*").eq("id", id).maybeSingle();
      if (!c) return erreur("introuvable", 404);
      const [ev, rel, sig, et] = await Promise.all([
        db.from("join_evenements").select("type, at, detail").eq("candidature_id", id).order("at", { ascending: true }).limit(300),
        db.from("join_relances").select("etape, canal, statut, at").eq("candidature_id", id).order("at", { ascending: true }).limit(300),
        db.from("join_signatures").select("version, signe_at, nom_legal, ruul_email, ip, sha256").eq("candidature_id", id)
          .limit(1).maybeSingle(),
        db.from("join_etapes").select("etape, statut, valeur, maj_at").eq("candidature_id", id).limit(20),
      ]);
      const cand = c as Candidature & Record<string, unknown>;
      // Les messages envoyés : le journal des envois, avec l'objet et le texte du message de ce type (anglais).
      const messages = (rel.data ?? []).map((r) => {
        const type = r.etape as TypeMessageJoin;
        const m = (TYPES_MESSAGE_JOIN as readonly string[]).includes(type) && r.canal !== "systeme"
          ? texteMessage(type, { prenom: cand.prenom, lien: JOIN_URL(), handle: cand.handle_tiktok, login: cand.email_os ?? null })
          : null;
        return { ...r, objet: m?.objet ?? null, texte: m?.corps ?? null };
      });
      return json({
        ok: true, mode: mode.mode,
        candidature: {
          ...ligneAdmin(cand, !!sig.data), whatsapp: cand.whatsapp_e164, langue: cand.langue, majeur: cand.majeur ?? null,
          age: cand.age, deux_telephones: cand.deux_telephones, reponses: cand.reponses, source_brute: cand.source ?? {},
          handle_tiktok: cand.handle_tiktok, expire_at: cand.expire_at, decision_at: cand.decision_at,
          decision_par: cand.decision_par ?? null, decision_note: cand.decision_note ?? null,
          profile_id: cand.profile_id ?? null, email_os: cand.email_os ?? null,
        },
        evenements: ev.data ?? [], messages, signature: sig.data ?? null, etapes: et.data ?? [],
      });
    }

    case "admin_decider": {
      const id = String(b.id ?? "");
      const choix = b.decision === "accepter" ? "accepter" : b.decision === "refuser" ? "refuser" : null;
      if (!choix) return erreur("decision");
      const note = String(b.note ?? "").trim().slice(0, 500) || null;
      const { data } = await db.from("join_candidatures").select("*").eq("id", id).maybeSingle();
      if (!data) return erreur("introuvable", 404);
      const c = data as Candidature;
      const signees = await signeesParmi(db, [c.id]);
      const possibles = decisionsAdminPossibles(etapeAdmin(c, signees.has(c.id)));
      if (choix === "accepter" && !possibles.accepter) return erreur("acceptation impossible à cette étape", 409);
      if (choix === "accepter" && !(c.email_verifie_at && c.whatsapp_verifie_at)) return erreur("codes pas encore vérifiés", 409);
      if (choix === "refuser" && !possibles.refuser) return erreur("refus impossible à cette étape", 409);
      const maintenant = new Date().toISOString();
      if (choix === "accepter") {
        const cohorte = cohorteDe(aujourdhuiParis());
        const { error } = await db.from("join_candidatures").update({
          decision: "auto", decision_at: maintenant, cohorte, decision_par: admin.id, decision_note: note, maj_at: maintenant,
        }).eq("id", c.id);
        if (error) return erreur(`enregistrement impossible (migration 0847 appliquée ?) : ${error.message}`, 500);
        await evenement(db, "acceptee", c.id, c.test, { par: admin.id, note });
        c.decision = "auto";
        c.cohorte = cohorte;
        const lundi = cohorteASignature(cohorte);
        // Le candidat est prévenu (email ; WhatsApp contract_to_sign s'il a donné son accord). En test : testeurs seulement.
        await message(db, mode, c, "acceptee", { lundi: lundiLisible(lundi), limite: limiteLisible(lundi) }, "contract_to_sign");
      } else {
        const { error } = await db.from("join_candidatures").update({
          decision: "refusee", decision_at: maintenant, decision_par: admin.id, decision_note: note, maj_at: maintenant,
        }).eq("id", c.id);
        if (error) return erreur(`enregistrement impossible (migration 0847 appliquée ?) : ${error.message}`, 500);
        await evenement(db, "refusee", c.id, c.test, { par: admin.id, note });
        c.decision = "refusee";
        await message(db, mode, c, "refusee", {}, null);
      }
      return json({ ok: true, decision: c.decision });
    }

    case "admin_reglage": {
      const avant = await lireAuto(db);
      if (typeof b.auto_acceptation !== "boolean") return json({ ok: true, auto_acceptation: avant });
      const apres = b.auto_acceptation;
      // updated_by = l'admin : le déclencheur de reglages l'écrit dans reglages_journal (0411).
      const { error } = await db.from("reglages").upsert(
        { cle: "join_auto_acceptation", valeur: { actif: apres }, updated_by: admin.id, updated_at: new Date().toISOString() },
        { onConflict: "cle" },
      );
      if (error) return erreur(error.message, 500);
      if (avant !== apres) await evenement(db, "reglage", null, mode.mode === "test", { cle: "join_auto_acceptation", avant, apres, par: admin.id });
      return json({ ok: true, auto_acceptation: apres });
    }
  }
  return erreur("action inconnue", 404);
}

// ---------------------------------------------------------------------------------------------------------------

async function traiter(request: Request, db: Db, b: Corps): Promise<Response> {
  const action = String(b.action ?? "");
  // Sans action : 401 (le contrôle de démarrage du déploiement attend 401/403 sur un appel vide).
  if (!action) return erreur("action", 401);
  const mode = await lireMode(db);
  const enTest = mode.mode === "test";
  if (action.startsWith("admin_")) return await traiterAdmin(db, b, mode, action);

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
      const email = await envoyerCodeEmail(db, mode, c, codeEmail);
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
      const etat = canal === "email" ? await envoyerCodeEmail(db, mode, c, code) : await envoyerCodeWhatsapp(db, mode, c, code);
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
        // 0847 : l'interrupteur « Acceptation automatique » (OFF : même une candidature complète attend l'admin).
        const d = deciderAvecReglage(decider(c, new Set(pays.map((p) => p.pays))), await lireAuto(db));
        const maintenant = new Date().toISOString();
        const cohorte = d.decision === "auto" ? cohorteDe(aujourdhuiParis()) : null;
        await db.from("join_candidatures").update({
          decision: d.decision, decision_at: maintenant, manques: d.manques, cohorte, maj_at: maintenant,
        }).eq("id", c.id);
        await evenement(db, d.decision === "auto" ? "acceptee" : "a_traiter", c.id, c.test, { manques: d.manques, eligible: d.eligible });
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
      await journaliserRelance(db, c, "connexion", "email", await envoyerCodeEmail(db, mode, c, code));
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
