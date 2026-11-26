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
 * 25/11 (Max) : pas de code WhatsApp (join_mode.modele_code vide) : le code par email suffit. WhatsApp de bienvenue
 * welcome_start (repli account_ready), clé welcome:<posteur> partagée avec les relances de l'OS.
 *
 * 0847 (admin, 23/11) : actions `admin_*` réservées aux admins de l'OS (même Supabase Auth : email + mot de passe ;
 * is_admin() vérifié côté serveur à CHAQUE appel avec le JWT de l'admin, champ `admin_jwt`) : connexion,
 * rafraîchissement, liste, fiche, accepter / refuser, interrupteur « Acceptation automatique » (réglage
 * join_auto_acceptation, OFF par défaut, journalisé). OFF : une candidature qui remplit les conditions attend
 * l'admin. ON : elle est acceptée seule. v4 : l'interrupteur ne décide QUE de l'acceptation ; tout candidat accepté
 * (admin ou automatique) est relié à l'OS juste après sa signature (relierOS), en live seulement : en test, la
 * création reste SIMULÉE. Contrat join-v5 (25/11 : 1re ligne du résumé alignée sur le site). Bienvenue après signature : lien « Set my password ».
 *
 * 0858 (25/11, Max : « ne passe pas encore sur ce système, mais bientôt ») :
 *  - réglage `join_reel` : un drapeau par étape d'après la signature (compte_os, acces, ruul, rappels, whatsapp), tous
 *    à false. Une étape n'est réelle que si son drapeau est true (join_mode et whatsapp_mode restent des garde-fous en
 *    plus) ; sinon elle est simulée et journalisée (join_relances « simule » avec le détail, join_evenements « simule »).
 *    Une candidature de test ne crée jamais de posteur (pas de « posteur TEST » pour un posteur payé par Ruul).
 *  - après la signature : compte OS → Slack (le lien) → bienvenue → invitation Ruul (lien personnel de l'API Ruul,
 *    sinon app.ruul.io/register ; Ruul n'envoie pas d'email : c'est Join qui l'envoie, une fois, notée comme l'email
 *    « invite_a » du parcours Ruul de l'OS).
 *  - la page personnelle est une checklist (contrat, Ruul READY, TikTok, warm-up, Slack, premier post) synchronisée
 *    avec l'OS dans `moi` et dans le cron ; rappels J+1, J+3, vendredi avant le lundi, premier post (email toujours,
 *    WhatsApp avec l'accord, mêmes clés et mêmes plafonds que les relances WhatsApp de l'OS). Join est alors la seule
 *    voix de ces étapes pour les posteurs qu'il a créés (join_voix_posteurs, whatsapp_relances.ts, parcours_ruul.ts).
 *  - décision : règles de l'OS + langue du pays gérée par l'OS (hub-posteurs « zones ») + aucun doublon (join_doublons).
 *    26/11 (0863) : un même nom n'est qu'une alerte (join_candidatures.alertes) : il ne bloque plus l'acceptation.
 *  - `relances` accepte (cron seulement) `maintenant`, `candidature_id`, `etat` : une horloge simulée, toujours en
 *    simulation (rien ne part, rien n'est créé).
 *
 * 26/11 (Max : « les infos sont sur l'OS ») : Join n'invente plus de profil TikTok. Le pseudo, le nom affiché, la bio et
 * la photo sont SEULEMENT ceux du compte créé par l'OS (profilOS) : page perso (`moi`), emails, rappels et WhatsApp ne
 * citent un @ que s'il vient de l'OS ; « Je l'ai créé » vérifie le @ de l'OS (sans lui : « not_ready »).
 * Bienvenue d'une fiche créée par Join avec un lien « Set my password » : 2 WhatsApp, account_ready avec ce lien
 * (clé join_acces_lien:<candidature>), puis welcome_start (clé welcome:<posteur>) s'il y a un @ de l'OS.
 */
import { corsHeaders, estSecretCron, json, serviceClient } from "../_shared/supabase.ts";
import { lienMotDePasse } from "../_shared/lien_mot_de_passe.ts";
import { envoyerWhatsApp, lireModeWhatsApp, modelesApprouves, numeroBloque } from "../_shared/whatsapp_envoi.ts";
import { dateLocale, type FaitsRelance, modeleRelance } from "../_shared/whatsapp_relances.ts";
import { heureLocale, heureOk, numeroAutorise, refusRelance } from "../_shared/whatsapp.ts";
import { type EmailRuul, envoyerEmailSite, PIED_EN, rendreEmailRuul } from "../_shared/ruul.ts";
import { lienFrais, lienRuul, lireReglageConnect } from "../_shared/ruul_connect.ts";
import { boutonRuul, emailParcours } from "../_shared/parcours_ruul.ts";
import { nicheOuNull } from "../_shared/niche_posteur.ts";
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
  codesVerifies,
  codeWhatsappActif,
  cohorteDe,
  dateLimiteSignature,
  deciderAvecReglage,
  deciderJoin,
  type EtatChecklist,
  etatChecklist,
  type EtatOS,
  etapesRuul,
  ETAPES_CHECKLIST,
  EVENEMENT_ETAPE,
  type JoinReel,
  LIEN_INSCRIPTION_RUUL,
  LIEN_SLACK,
  LIEN_TIKTOK,
  lireJoinReel,
  raisonSimulation,
  type RappelDu,
  rappelsDus,
  signatureVendrediDue,
  texteRappel,
  typeWhatsappRappel,
  decisionsAdminPossibles,
  emailAutorise,
  estEtapeJoin,
  etapeAdmin,
  etapeRelanceSignature,
  ETAPES_APRES_SIGNATURE,
  etapesRestantes,
  etatCode,
  genererCode,
  genererJeton,
  jourParis,
  langueEmailJoin,
  LIEN_DASHBOARD_OS,
  lireAutoAcceptation,
  lireModeJoin,
  lundiLisible,
  MESSAGE_A_TRAITER,
  minuitParis,
  type ModeJoin,
  nettoyerHandle,
  nettoyerSource,
  paysEtPaie,
  PROFIL_TIKTOK_VIDE,
  type CompteOS,
  type ProfilTiktokOS,
  profilTiktokOS,
  premierePaie,
  premierPost,
  relanceCodeDue,
  sha256Hex,
  texteContratComplet,
  texteMessage,
  TYPES_MESSAGE_JOIN,
  type TypeMessageJoin,
  validerCandidature,
  type WhatsAppJoin,
  whatsappsBienvenue,
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
/** Le runtime Edge de Supabase : waitUntil garde la fonction en vie pour un travail lancé après la réponse. */
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const SESSION_COURTE_H = 24;
const SESSION_LONGUE_H = 24 * 30;
/** 26/11 : les liens « Set my password » que la page Join peut créer en 24 h (bienvenue comprise), par posteur. */
const LIENS_MDP_JOUR = 6;

const erreur = (message: string, status = 400) => json({ ok: false, error: message }, status);

const JOIN_URL = () => Deno.env.get("JOIN_URL") ?? "https://join.vikstudios.com";
/** Le lien d'arrêt des relances de l'OS (fonction ruul, ?stop=<ruul_jeton>) : la désinscription existante. */
const URL_STOP_OS = "https://mbikecieskoobeizixig.supabase.co/functions/v1/ruul";

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

/** 0858 : les drapeaux `join_reel` (absent ou illisible : tout simulé). */
async function lireReel(db: Db): Promise<JoinReel> {
  const { data } = await db.from("reglages").select("valeur").eq("cle", "join_reel").maybeSingle();
  return lireJoinReel(data?.valeur);
}

/**
 * 0858 : les options d'un passage. `maintenant` : l'horloge (simulée : réservée au cron) ; `simuler` : rien ne part,
 * rien n'est créé (journal « simule » seulement) ; `etat` : l'état de l'OS imposé (simulation d'un parcours).
 */
interface Options {
  maintenant?: Date;
  simuler?: boolean;
  etat?: Partial<EtatChecklist> & { premier_post_at?: string | null };
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

/** L'email du code : en live, à tout candidat ; en test, seulement vers un testeur. Renvoie l'état pour le journal. */
async function envoyerCodeEmail(db: Db, mode: ModeJoin, c: Candidature, code: string): Promise<"envoye" | "bloque"> {
  // 26/11 : en live, le code part à tout le monde (avant : seulement aux testeurs, même en live).
  if (mode.mode !== "live" && !emailAutorise(mode, c.email)) return "bloque";
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
    modele: { nom: mode.modele_code, langue: "en", variables: [code] }, langueCible: c.langue,
  });
  return r.ok ? "envoye" : "bloque";
}

/** Le prénom des WhatsApp : le premier mot (comme les relances de l'OS). */
const prenomWa = (c: Candidature) => (c.prenom ?? "").trim().split(/\s+/)[0] || "there";

/**
 * Un message au candidat (email, et WhatsApp si accord + modèle). En test : email seulement vers les testeurs ;
 * WhatsApp seulement vers les numéros autorisés (whatsapp_mode), jamais vers un numéro qui a dit STOP ou dont le
 * posteur est arrêté / sur la liste « ne plus contacter ». 26/11 : plusieurs WhatsApp possibles (la bienvenue : le lien
 * « Set my password » puis welcome_start), envoyés dans l'ordre, chacun journalisé (modèle et clé).
 */
async function message(
  db: Db, mode: ModeJoin, c: Candidature, type: TypeMessageJoin,
  v: Omit<Parameters<typeof texteMessage>[1], "prenom" | "lien"> & { lien?: string },
  whatsapp: string | WhatsAppJoin | WhatsAppJoin[] | null,
  o: { simuler?: string | null; whatsappSimule?: string | null; detail?: Corps } = {},
) {
  const lien = v.lien ?? JOIN_URL();
  const m = texteMessage(type, { ...v, prenom: c.prenom, lien });
  const was: WhatsAppJoin[] = !whatsapp
    ? []
    : typeof whatsapp === "string" ? [{ nom: whatsapp, variables: [prenomWa(c), lien] }] : Array.isArray(whatsapp) ? whatsapp : [whatsapp];
  const cleDe = (wa: WhatsAppJoin) => wa.cle ?? `join_${type}:${c.id}`;
  // 0858 : simulé (drapeau join_reel à false, horloge simulée) : rien ne part, ce qui serait parti est journalisé.
  if (o.simuler) {
    await journaliserRelance(db, c, type, "email", "simule", {
      ...o.detail, raison: o.simuler, objet: m.objet, vers: emailAutorise(mode, c.email) || mode.mode === "live" ? "candidat" : "aucun (mode test : pas un testeur)",
    });
    if (c.whatsapp_optin_at) {
      for (const wa of was) {
        await journaliserRelance(db, c, type, "whatsapp", "simule", { ...o.detail, raison: o.simuler, modele: wa.nom, cle: cleDe(wa) });
      }
    }
    return;
  }
  if (emailAutorise(mode, c.email) || mode.mode === "live") {
    const { objet, html, texte } = await emailDansSaLangue(db, c, {
      objet: m.objet, corps: m.corps, bouton: m.bouton ? { texte: m.bouton, lien } : null, lienStop: JOIN_URL(), sansPied: true,
      // 26/11 : la bienvenue met son bouton « Set my password » juste sous le bloc de connexion.
      ...(m.boutonApres !== undefined ? { boutonApres: m.boutonApres } : {}),
    }, [v.login, v.handle, v.ruulEmail].filter((x): x is string => !!x));
    const r = await envoyerEmailSite(c.email, objet, html, texte, JOIN_URL(), ["join", `join-${type}`, mode.mode]);
    await journaliserRelance(db, c, type, "email", r.ok ? "envoye" : "bloque");
  } else {
    await journaliserRelance(db, c, type, "email", "bloque");
  }
  if (!was.length || !c.whatsapp_optin_at) return;
  if (o.whatsappSimule) {
    for (const wa of was) {
      await journaliserRelance(db, c, type, "whatsapp", "simule", { raison: o.whatsappSimule, modele: wa.nom, cle: cleDe(wa) });
    }
    return;
  }
  if (await numeroBloque(db, c.whatsapp_e164, c.profile_id ?? null)) {
    for (const wa of was) {
      await journaliserRelance(db, c, type, "whatsapp", "bloque", { raison: "STOP, arrêt ou « ne plus contacter »", modele: wa.nom, cle: cleDe(wa) });
    }
    return;
  }
  for (const wa of was) {
    const r = await envoyerWhatsApp(db, {
      e164: c.whatsapp_e164, posterId: c.profile_id ?? null, motif: wa.motif ?? `join_${type}`, cle: cleDe(wa),
      modele: { nom: wa.nom, langue: "en", variables: wa.variables }, langueCible: c.langue,
    });
    await journaliserRelance(db, c, type, "whatsapp", r.ok ? "envoye" : "bloque", {
      modele: wa.nom, cle: cleDe(wa), ...(r.ok ? {} : { raison: r.erreur ?? r.statut }),
    });
  }
}

async function journaliserRelance(
  db: Db, c: Candidature, etape: string, canal: string, statut: "simule" | "envoye" | "bloque", detail: Corps | null = null,
) {
  const { error } = await db.from("join_relances").insert({ candidature_id: c.id, etape, canal, statut, ...(detail ? { detail } : {}) });
  if (error) console.error("join_relances", etape, error.message);
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
 * Après la signature, tout s'enchaîne seul : compte OS, Slack (le lien), la bienvenue, puis l'invitation Ruul.
 * Idempotent (journal join_relances) : le cron horaire reprend ce qui manque.
 *
 * 0858 (25/11, Max) : chaque étape n'est réelle que si son drapeau `join_reel` est true (compte_os, acces, ruul) ;
 * sinon elle est simulée et journalisée avec sa raison. Une étape simulée ne se rejoue pas quand le drapeau passe à
 * true (seules les signatures suivantes en profitent). La création OS passe toujours par UN seul chemin (relierOS) ;
 * une candidature de test n'en crée jamais (pas de « posteur TEST » pour un posteur Ruul).
 */
async function enchainer(db: Db, mode: ModeJoin, reel: JoinReel, c: Candidature, lundi: string, o: Options = {}) {
  const faites = await etapesFaites(db, c.id);
  for (const e of etapesRestantes(faites)) {
    if (e === "compte_os") {
      const raison = raisonSimulation("compte_os", reel, { test: c.test, simuler: o.simuler });
      if (raison) {
        await simuler(db, c, "creation_compte_os", { raison });
        await journaliserRelance(db, c, e, "systeme", "simule", { raison });
        continue;
      }
      if (!(await relierOS(db, c, lundi))) return; // échec : le cron horaire réessaie (tout est idempotent)
      await journaliserRelance(db, c, e, "systeme", "envoye");
      continue;
    }
    if (e === "slack") {
      // Rien n'est envoyé : le lien d'invitation (LIEN_SLACK) est sur la checklist et dans la bienvenue ; l'OS relie le
      // posteur à Slack par son email (slack_relier_regles) et la checklist se coche quand il est relié.
      await majEtape(db, c.id, "slack", "a_faire", { lien: true, at: new Date().toISOString() });
      await journaliserRelance(db, c, e, "systeme", "envoye", { quoi: "lien Slack affiché (rien n'est envoyé)" });
      continue;
    }
    if (e === "acces") {
      await messageAcces(db, mode, reel, c, lundi, o);
      continue;
    }
    await invitationRuul(db, mode, reel, c, lundi, o);
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
    // 26/11 : le @ est celui du compte de l'OS de cette fiche (ou rien).
    const { handle } = await profilOS(db, existant.id);
    await db.from("join_candidatures").update({
      profile_id: existant.id, email_os: existant.email, handle_tiktok: handle, maj_at: new Date().toISOString(),
    }).eq("id", c.id);
    c.profile_id = existant.id;
    c.email_os = existant.email;
    c.handle_tiktok = handle;
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
    // 26/11 : le handle TikTok est SEULEMENT celui du compte créé par l'OS (Join n'en propose plus).
    const { handle } = await profilOS(db, x.profile_id);
    await db.from("join_candidatures").update({
      profile_id: x.profile_id, email_os: x.email_os ?? null, handle_tiktok: handle, maj_at: new Date().toISOString(),
    }).eq("id", c.id);
    c.profile_id = x.profile_id;
    c.email_os = x.email_os ?? null;
    c.handle_tiktok = handle;
    if (handle) await majEtape(db, c.id, "tiktok", "a_faire", { handle_os: handle });
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
    // 25/11 (Max) : Join n'exige plus de deuxième téléphone ; la fiche reste valide pour les règles de l'OS.
    site_id: c.id, nom: `${c.prenom} ${c.nom}`.trim(), email: c.email, pays: c.pays, pays_brut: c.pays, adulte: true,
    deux_telephones: true, a_telephone: true, reponses: c.reponses ?? {},
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
 * personnel « Set my password » (jamais de mot de passe), étapes, Slack, Ruul. Sans fiche OS (compte simulé) : le
 * texte le dit, et l'email ne part qu'aux testeurs en mode test. Quand Join l'envoie à une fiche qu'il a créée, la
 * bienvenue du parcours Ruul de l'OS est notée comme envoyée (jamais deux bienvenues). Une fiche existante liée (même
 * email) ne reçoit pas de bienvenue : elle a déjà ses accès.
 *
 * 0858 : réelle seulement si join_reel.acces ; sinon simulée (et la bienvenue de l'OS n'est PAS notée : si la fiche
 * existe, c'est le parcours Ruul de l'OS qui l'envoie). Le WhatsApp suit en plus join_reel.whatsapp.
 */
async function messageAcces(db: Db, mode: ModeJoin, reel: JoinReel, c: Candidature, lundi: string, o: Options = {}) {
  const creee = c.profile_id ? await creeParJoin(db, c) : false;
  if (c.profile_id && !creee) {
    await journaliserRelance(db, c, "acces", "email", "bloque", { raison: "fiche existante liée : elle a déjà ses accès" });
    await evenement(db, "compte_os", c.id, c.test, { bienvenue: "non envoyée : fiche existante liée" });
    return;
  }
  const { data: sig } = await db.from("join_signatures").select("ruul_email").eq("candidature_id", c.id).limit(1).maybeSingle();
  const raison = raisonSimulation("acces", reel, { test: c.test, simuler: o.simuler });
  const ruulParEmail = !raisonSimulation("ruul", reel, { test: c.test, simuler: o.simuler, profil: creee });
  // 26/11 : le @ seulement s'il vient du compte de l'OS (sinon : « your TikTok details are on your dashboard »).
  const { handle } = await profilOS(db, c.profile_id);
  const v = {
    compteCree: false, login: c.email_os ?? null, handle, ruulEmail: sig?.ruul_email ?? null,
    lundi: lundiLisible(lundi), limite: limiteLisible(lundi), ruulParEmail,
  };
  if (raison) {
    await message(db, mode, c, "acces", v, await whatsappsBienvenueDe(db, c, lundi, { lien: JOIN_URL(), handle, lienPersonnel: false }), { simuler: raison });
    await simuler(db, c, "bienvenue", { raison });
    return;
  }
  let lien: string | undefined;
  if (creee && c.profile_id) {
    const { data: jeton, error } = await db.rpc("mot_de_passe_lien_creer", { p_poster: c.profile_id, p_par: "join" });
    if (error || typeof jeton !== "string" || !jeton) {
      console.error("join acces : lien Set my password", error?.message ?? "non créé");
      return; // le cron réessaie : jamais de bienvenue sans le lien
    }
    lien = lienMotDePasse(LIEN_DASHBOARD_OS, jeton);
  }
  await message(db, mode, c, "acces", { ...v, lien, compteCree: !!lien },
    await whatsappsBienvenueDe(db, c, lundi, { lien: lien ?? JOIN_URL(), handle, lienPersonnel: !!lien }), {
    whatsappSimule: raisonSimulation("whatsapp", reel, { test: c.test, simuler: o.simuler }),
  });
  if (creee && c.profile_id) {
    const { error } = await db.from("ruul_parcours_envois").upsert(
      { poster_id: c.profile_id, cle: "bienvenue", type: "bienvenue", ok: true, canaux: ["join"], erreur: null, envoye_at: new Date().toISOString() },
      { onConflict: "poster_id,cle" },
    );
    if (error) console.error("join acces : ruul_parcours_envois", error.message);
  }
}

/**
 * 0858 : l'invitation Ruul, une fois. Ruul n'envoie pas d'email à l'appel POST /connect (rien dans l'API ni dans le
 * code de l'OS ; Ruul a confirmé le 13/11 qu'un posteur s'inscrit lui-même sans attendre d'email) : c'est Join qui
 * envoie le lien personnel d'onboarding (lienRuul : gardé 48 h, régénéré par l'API si ruul_api.connect_actif), sinon
 * le guide et app.ruul.io/register. Le texte est celui de l'invitation du parcours Ruul de l'OS (« invite_a »), et
 * l'envoi y est noté (profiles.ruul_email_a_at, ruul_parcours_envois « invite_a ») : l'OS ne renvoie jamais une
 * seconde invitation. Réelle seulement si join_reel.ruul et une fiche créée par Join ; sinon simulée.
 */
async function invitationRuul(db: Db, mode: ModeJoin, reel: JoinReel, c: Candidature, lundi: string, o: Options = {}) {
  const creee = c.profile_id ? await creeParJoin(db, c) : false;
  if (c.profile_id && !creee) {
    // Fiche existante liée : son invitation Ruul est celle de l'OS.
    await journaliserRelance(db, c, "ruul", "systeme", "bloque", { raison: "fiche existante liée : invitation Ruul par l'OS" });
    return;
  }
  const raison = raisonSimulation("ruul", reel, { test: c.test, simuler: o.simuler, profil: creee });
  const { data: sig } = await db.from("join_signatures").select("ruul_email").eq("candidature_id", c.id).limit(1).maybeSingle();
  if (raison) {
    const reglage = await lireReglageConnect(db);
    await journaliserRelance(db, c, "ruul", "email", "simule", {
      raison, objet: "Create your Ruul account to get paid",
      lien: reglage.connect_actif ? "lien personnel de l'API Ruul (POST /connect)" : `guide et ${LIEN_INSCRIPTION_RUUL}`,
      ruul_email: sig?.ruul_email ?? null,
    });
    await majEtape(db, c.id, "ruul", "a_faire", { invitation: "simulee", at: new Date().toISOString() });
    await simuler(db, c, "invitation_ruul", { raison });
    return;
  }
  const pid = c.profile_id!;
  const { data: p } = await db.from("profiles").select("prenom, ruul_email, ruul_onboarding, ruul_jeton, ruul_email_a_at").eq("id", pid).maybeSingle();
  if (p?.ruul_onboarding === "READY") {
    await majEtape(db, c.id, "ruul", "fait", { fait_at: new Date().toISOString(), source: "os" });
    await journaliserRelance(db, c, "ruul", "systeme", "envoye", { quoi: "déjà READY chez Ruul : pas d'invitation" });
    return;
  }
  const lien = await lienRuul(db, pid);
  const ruulEmail = (p?.ruul_email as string | null) ?? sig?.ruul_email ?? null;
  const e = emailParcours("invite_a", {
    prenom: c.prenom, login: c.email_os ?? null, motDePasse: "", dashboard: LIEN_DASHBOARD_OS, handle: (await profilOS(db, pid)).handle, slack: LIEN_SLACK,
    cohorte_lundi: lundi, ruul_email: ruulEmail, ruul_compte: null, ruul_lien: lien, ruul_onboarding: (p?.ruul_onboarding as string | null) ?? null,
    abonnements: null,
  }, LIEN_DASHBOARD_OS);
  const lienStop = p?.ruul_jeton ? `${URL_STOP_OS}?stop=${p.ruul_jeton}` : JOIN_URL();
  let statut: "envoye" | "bloque" = "bloque";
  if (emailAutorise(mode, c.email) || mode.mode === "live") {
    const r = await emailDansSaLangue(db, c, { objet: e.objet, corps: e.corps, bouton: boutonRuul({ ruul_lien: lien }), lienStop }, [ruulEmail].filter((x): x is string => !!x));
    statut = (await envoyerEmailSite(c.email, r.objet, r.html, r.texte, lienStop, ["join", "join-ruul", mode.mode])).ok ? "envoye" : "bloque";
  }
  await journaliserRelance(db, c, "ruul", "email", statut, { objet: e.objet, lien: lien ? "personnel (API Ruul)" : "inscription" });
  if (statut !== "envoye") return;
  const maintenant = new Date().toISOString();
  if (!p?.ruul_email_a_at) await db.from("profiles").update({ ruul_email_a_at: maintenant }).eq("id", pid).is("ruul_email_a_at", null);
  const { error } = await db.from("ruul_parcours_envois").upsert(
    { poster_id: pid, cle: "invite_a", type: "invite_a", ok: true, canaux: ["join"], erreur: null, envoye_at: maintenant },
    { onConflict: "poster_id,cle" },
  );
  if (error) console.error("join ruul : ruul_parcours_envois", error.message);
  await majEtape(db, c.id, "ruul", "a_faire", { invitation: "envoyee", lien_personnel: !!lien, at: maintenant });
  await evenement(db, "ruul_invitation", c.id, c.test, { lien_personnel: !!lien });
}

/** La bienvenue WhatsApp (whatsappsBienvenue, join.ts) avec les modèles APPROVED chez Meta. */
async function whatsappsBienvenueDe(
  db: Db, c: Candidature, lundi: string, o: { lien: string; handle: string | null; lienPersonnel: boolean },
): Promise<WhatsAppJoin[]> {
  return whatsappsBienvenue({
    candidatureId: c.id, profileId: c.profile_id ?? null, prenom: prenomWa(c), lundi, ...o, approuves: await modelesApprouves(db),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// 0858 : la checklist synchronisée avec l'OS, et ses rappels
// ---------------------------------------------------------------------------------------------------------------

type LigneEtape = { etape: string; statut: string; valeur: Record<string, unknown> | null };

/** Ce que l'OS sait de ces posteurs (join_etat_os). En panne : rien (la checklist garde ce que Join sait). */
async function etatsOS(db: Db, ids: string[]): Promise<Map<string, EtatOS>> {
  const uniques = [...new Set(ids.filter(Boolean))];
  if (!uniques.length) return new Map();
  const { data, error } = await db.rpc("join_etat_os", { p_profiles: uniques });
  if (error) {
    console.error("join_etat_os", error.message);
    return new Map();
  }
  return new Map(((data ?? []) as EtatOS[]).map((e) => [e.profile_id, e]));
}

/**
 * Coche dans join_etapes ce qui est fait (contrat signé, ce que l'OS voit fait) et note l'événement du QG une fois.
 * Jamais en simulation (l'état imposé ne s'écrit pas). Rend la checklist.
 */
async function synchroniser(
  db: Db, c: Candidature, etapes: LigneEtape[], signee: boolean, os: EtatOS | null, o: Options = {},
): Promise<EtatChecklist> {
  const faites = { ...etatChecklist({ signee, etapes }, os), ...(o.etat ?? {}) } as EtatChecklist;
  if (o.simuler) return faites;
  for (const e of ETAPES_CHECKLIST) {
    if (!faites[e]) continue;
    const ligne = etapes.find((x) => x.etape === e);
    if (ligne && (ligne.statut === "fait" || ligne.statut === "ok")) continue;
    const valeur = { ...(ligne?.valeur ?? {}), fait_at: new Date().toISOString(), source: e === "contrat" ? "signature" : os ? "os" : "join" };
    // 26/11 : une ligne refusée par la base (ex. « dashboard » avant la migration 0865) ne casse jamais la page :
    // l'étape reste cochée d'après l'OS et la ligne sera écrite au passage suivant.
    try {
      await majEtape(db, c.id, e, "fait", valeur);
    } catch (err) {
      console.error("join synchroniser", e, err instanceof Error ? err.message : String(err));
      continue;
    }
    etapes.push({ etape: e, statut: "fait", valeur });
    const ev = EVENEMENT_ETAPE[e];
    if (ev && !(e === "tiktok" && ligne?.statut === "ok")) await evenement(db, ev, c.id, c.test, { source: os ? "os" : "join" });
  }
  return faites;
}

/** Les WhatsApp déjà partis à ce numéro / ce posteur (aujourd'hui à Paris, 7 derniers jours) : les plafonds de l'OS. */
async function envoisWhatsApp(db: Db, e164: string, posterId: string | null, maintenant: Date): Promise<{ jour: number; semaine: number }> {
  const depuis = new Date(maintenant.getTime() - 7 * 24 * HEURE).toISOString();
  const statuts = ["a_envoyer", "envoye", "livre", "lu"];
  const [parNumero, parPosteur] = await Promise.all([
    db.from("whatsapp_envois").select("id, cree_at").eq("e164", e164).in("statut", statuts).gte("cree_at", depuis).limit(200),
    posterId
      ? db.from("whatsapp_envois").select("id, cree_at").eq("poster_id", posterId).in("statut", statuts).gte("cree_at", depuis).limit(200)
      : Promise.resolve({ data: [] as { id: string; cree_at: string }[] }),
  ]);
  const tous = new Map([...(parNumero.data ?? []), ...(parPosteur.data ?? [])].map((x) => [x.id as string, x.cree_at as string]));
  const minuit = minuitParis(jourParis(maintenant)).getTime();
  return { jour: [...tous.values()].filter((at) => Date.parse(at) >= minuit).length, semaine: tous.size };
}

/** Absence déclarée ou jour de panne aujourd'hui (les garde-fous des relances WhatsApp de l'OS). */
async function absentOuPanne(db: Db, posterId: string | null, maintenant: Date): Promise<{ absent: boolean; panne: boolean }> {
  if (!posterId) return { absent: false, panne: false };
  const jour = jourParis(maintenant);
  const [a, p] = await Promise.all([
    db.from("absences_declarees").select("debut, fin, jours, retour_le").eq("poster_id", posterId).lte("debut", jour).limit(20),
    db.from("jours_credites").select("jour").eq("poster_id", posterId).eq("jour", jour).limit(1),
  ]);
  const absent = (a.data ?? []).some((x) => {
    const debut = String(x.debut);
    const fin = x.fin ? String(x.fin) : new Date(Date.parse(`${debut}T12:00:00Z`) + (Math.max(Number(x.jours ?? 1), 1) - 1) * 24 * HEURE).toISOString().slice(0, 10);
    const retour = x.retour_le ? new Date(Date.parse(`${x.retour_le}T12:00:00Z`) - 24 * HEURE).toISOString().slice(0, 10) : null;
    return jour >= debut && jour <= (retour && retour < fin ? retour : fin);
  });
  return { absent, panne: (p.data ?? []).length > 0 };
}

/**
 * 0858 : les rappels de la checklist d'un candidat signé (rappelsDus) : UN email par jour (toutes les étapes dues
 * dedans), et un WhatsApp (accord donné) pour la première étape qui a un modèle. Réels seulement si join_reel.rappels
 * (et join_reel.whatsapp pour le WhatsApp) ; sinon simulés (journal avec ce qui serait parti). Garde-fous : STOP et
 * désinscription (relances_stop_at, ruul_candidatures.desinscrit_at), arrêt et « ne plus contacter », fiche
 * désactivée, 9 h – 20 h (heure du pays) pour l'email, un email par jour partagé avec le parcours Ruul de l'OS ;
 * WhatsApp : mêmes motifs et clés que les relances de l'OS, 1 par jour, 4 par semaine, 9 h – 21 h, numéro bloqué.
 * Une fiche existante liée (pas créée par Join) n'a pas de rappels de Join : l'OS reste sa voix.
 */
async function rappelsCandidat(
  db: Db, mode: ModeJoin, reel: JoinReel, c: Candidature, ctx: {
    signeAt: string; lundi: string; faites: EtatChecklist; os: EtatOS | null; journal: { etape: string; canal: string; detail: Corps | null }[];
    ruulEmail: string | null;
  }, o: Options, bilan: { rappels: number },
) {
  const maintenant = o.maintenant ?? new Date();
  if (c.profile_id && !(await creeParJoin(db, c))) return;
  const os = ctx.os;
  const dus = rappelsDus({
    signeAt: ctx.signeAt, lundi: ctx.lundi, faites: ctx.faites, deja: ctx.journal.map((r) => r.etape), pays: c.pays,
    premierPostAt: o.etat?.premier_post_at ?? os?.premier_post_at ?? null, postsPrevus: os ? os.posts_prevus !== false : true,
    paieReportee: !!os?.paie_reportee, maintenant,
    // 26/11 : les jours des rappels déjà faits (le vendredi saute après un rappel la veille).
    joursRappels: ctx.journal.filter((r) => r.etape.startsWith("rappel:") && r.canal === "email")
      .map((r) => String((r.detail as { jour?: string } | null)?.jour ?? "")).filter(Boolean),
  }).filter((d) => !(d.etape === "ruul" && os?.ruul_retire_at)); // passé sur Upwork : plus de Ruul
  if (!dus.length) return;
  const auj = dateLocale(c.pays, maintenant);
  // STOP, désinscription, arrêt, fiche désactivée : noté « bloqué », jamais relancé.
  const stop = os && (os.is_active === false || !!os.relances_stop_at || !!os.arrete || !!os.desinscrit)
    ? "STOP, désinscription, arrêt ou fiche désactivée" : null;
  if (stop) {
    for (const d of dus) await journaliserRelance(db, c, d.cle, "email", "bloque", { raison: stop, jour: auj });
    return;
  }
  // L'email part entre 9 h et 20 h (heure du pays) ; hors fenêtre, le passage suivant reprend.
  const h = heureLocale(c.pays, maintenant);
  if (h < 9 || h >= 20) return;
  // Un email par jour : pas si Join a déjà envoyé un rappel aujourd'hui, ni si le parcours Ruul de l'OS a écrit.
  const dejaJoin = ctx.journal.some((r) => r.etape.startsWith("rappel:") && r.canal === "email" && (r.detail as { jour?: string } | null)?.jour === auj);
  if (dejaJoin || (!o.simuler && os?.email_jour)) return;

  // Un candidat réel sans fiche OS (compte OS simulé) ne peut faire aucune étape : ses rappels restent simulés.
  const raison = raisonSimulation("rappels", reel, { test: c.test, simuler: o.simuler }) ??
    (!c.profile_id && !c.test ? "pas de fiche OS (compte OS simulé) : les étapes ne peuvent pas être faites" : null);
  const lundiTxt = lundiLisible(ctx.lundi);
  const m = texteRappel(dus, {
    prenom: c.prenom, lundi: lundiTxt, limite: limiteLisible(ctx.lundi), avantDepart: auj < ctx.lundi,
    // 26/11 : le @ du compte de l'OS seulement (jamais une proposition de Join).
    handle: (os?.handle ?? "").replace(/^@/, "") || null, ruulEmail: os?.ruul_email ?? ctx.ruulEmail,
    // 26/11 : l'identifiant de l'OS dans le rappel « se connecter au dashboard ».
    login: c.email_os ?? null,
  });
  const detail = { jour: auj, objet: m.objet, etapes: dus.map((d) => d.etape), ...(o.maintenant ? { horloge: maintenant.toISOString() } : {}) };
  let statutEmail: "simule" | "envoye" | "bloque";
  if (raison) statutEmail = "simule";
  else if (!(emailAutorise(mode, c.email) || mode.mode === "live")) statutEmail = "bloque";
  else {
    const lienStop = os?.ruul_jeton ? `${URL_STOP_OS}?stop=${os.ruul_jeton}` : JOIN_URL();
    const r = await emailDansSaLangue(db, c, { objet: m.objet, corps: m.corps, bouton: { texte: m.bouton, lien: JOIN_URL() }, lienStop, sansPied: !os?.ruul_jeton },
      [os?.handle, os?.ruul_email ?? ctx.ruulEmail].filter((x): x is string => !!x));
    statutEmail = (await envoyerEmailSite(c.email, r.objet, r.html, r.texte, lienStop, ["join", "join-rappel", mode.mode])).ok ? "envoye" : "bloque";
    // Noté dans le parcours Ruul de l'OS : sa règle « jamais 2 emails le même jour » le voit.
    if (statutEmail === "envoye" && c.profile_id) {
      await db.from("ruul_parcours_envois").upsert(
        { poster_id: c.profile_id, cle: `join:${dus[0].cle}`, type: "join_rappel", ok: true, canaux: ["join"], erreur: null, envoye_at: new Date().toISOString() },
        { onConflict: "poster_id,cle" },
      );
    }
  }
  for (const d of dus) {
    await journaliserRelance(db, c, d.cle, "email", statutEmail, { ...detail, ...(raison ? { raison } : statutEmail === "bloque" ? { raison: "mode test : pas un testeur, ou envoi refusé" } : {}) });
    ctx.journal.push({ etape: d.cle, canal: "email", detail });
  }
  bilan.rappels++;
  await whatsappRappel(db, reel, c, dus, ctx, o, raison);
}

/** Le WhatsApp d'un jour de rappels : la première étape qui a un modèle (accord WhatsApp obligatoire). */
async function whatsappRappel(
  db: Db, reel: JoinReel, c: Candidature, dus: RappelDu[], ctx: { lundi: string; os: EtatOS | null }, o: Options, raisonRappels: string | null,
) {
  const d = dus.find((x) => typeWhatsappRappel(x));
  if (!d || !c.whatsapp_optin_at) return;
  const type = typeWhatsappRappel(d)!;
  const maintenant = o.maintenant ?? new Date();
  const pid = c.profile_id ?? null;
  const niche = pid && type === "warmup_start" ? await nicheOuNull(db, pid) : null;
  const faits = { prenom: c.prenom, cohorte_lundi: ctx.lundi, handle: ctx.os?.handle ?? null, niche } as unknown as FaitsRelance;
  const modele = modeleRelance(type, faits, await modelesApprouves(db));
  const jour = dateLocale(c.pays, maintenant);
  // Les clés et motifs des relances WhatsApp de l'OS : un envoi le même jour par l'un ou l'autre n'est jamais doublé.
  const cle = `relance:${type}:${pid ?? `join-${c.id}`}:${jour}`;
  const [bloque, envois, gardes, modeWa] = await Promise.all([
    numeroBloque(db, c.whatsapp_e164, pid), envoisWhatsApp(db, c.whatsapp_e164, pid, maintenant), absentOuPanne(db, pid, maintenant),
    lireModeWhatsApp(db),
  ]);
  const refus = refusRelance({
    modeAutorise: numeroAutorise(modeWa, c.whatsapp_e164), optin: true, optout: bloque, arrete: bloque || !!ctx.os?.arrete,
    absent: gardes.absent, panne: gardes.panne, envoisJour: envois.jour, envoisSemaine: envois.semaine, heureOk: heureOk(c.pays, maintenant),
  }) ?? (modele ? null : "modèle pas approuvé chez Meta");
  const detail = { jour, type, modele: modele?.nom ?? null, cle, ...(o.maintenant ? { horloge: maintenant.toISOString() } : {}) };
  const raison = raisonRappels ?? raisonSimulation("whatsapp", reel, { test: c.test, simuler: o.simuler });
  if (raison) {
    await journaliserRelance(db, c, d.cle, "whatsapp", "simule", { ...detail, raison, refus_si_reel: refus });
    return;
  }
  if (refus || !modele) {
    await journaliserRelance(db, c, d.cle, "whatsapp", "bloque", { ...detail, raison: refus });
    return;
  }
  // La langue du candidat si le modèle y est APPROVED chez Meta (sinon l'anglais) ; le modèle reste décrit en anglais.
  const r = await envoyerWhatsApp(db, { e164: c.whatsapp_e164, posterId: pid, motif: `relance:${type}`, cle, modele, langueCible: c.langue });
  await journaliserRelance(db, c, d.cle, "whatsapp", r.ok ? "envoye" : "bloque", { ...detail, ...(r.ok ? {} : { raison: r.erreur ?? r.statut }) });
}

/**
 * Le cron horaire : relance des codes, relances et expiration du contrat, reprise de l'enchaînement, puis (0858) la
 * checklist synchronisée avec l'OS et ses rappels. `o` (cron seulement) : horloge simulée, une candidature, état
 * imposé — toujours en simulation.
 */
async function relances(db: Db, mode: ModeJoin, o: Options & { candidatureId?: string } = {}) {
  const maintenant = o.maintenant ?? new Date();
  const reel = await lireReel(db);
  // 0858 : 45 jours (les rappels du premier post et de Ruul courent après le lundi de départ).
  const depuis = new Date(maintenant.getTime() - 45 * 24 * HEURE).toISOString();
  // 25/11 : lecture par pages (PostgREST rend 1000 lignes au plus) : en live, avec les pubs, plus de 500
  // candidatures en 14 jours ne doivent pas en laisser de côté. Les refusées et les « à traiter » sans relance à faire
  // ne sont pas relues.
  const toutes: Candidature[] = [];
  for (let page = 0; page < 50; page++) {
    let q = db.from("join_candidatures").select("*").is("expire_at", null).or("decision.is.null,decision.eq.auto");
    q = o.candidatureId ? q.eq("id", o.candidatureId) : q.gte("cree_at", depuis);
    const { data, error } = await q.order("cree_at", { ascending: true }).order("id", { ascending: true }).range(page * 500, page * 500 + 499);
    if (error) throw new Error(`candidatures : ${error.message}`);
    toutes.push(...((data ?? []) as Candidature[]));
    if ((data ?? []).length < 500) break;
  }
  const bilan = { lues: toutes.length, codes: 0, signature: 0, expirees: 0, enchainees: 0, synchronisees: 0, rappels: 0, simulation: !!o.simuler };
  // Une horloge simulée est notée dans le journal (le jour de la relance est le sien, pas celui de l'écriture).
  const horloge: Corps = o.maintenant ? { horloge: maintenant.toISOString() } : {};
  // Le journal et les signatures lus par paquets (pas deux requêtes par candidature).
  const faitesPar = new Map<string, Set<string>>();
  // Le jour (heure du pays) de chaque relance du contrat déjà faite : jamais deux relances du contrat le même jour.
  const joursContrat = new Map<string, Set<string>>();
  const signees = new Map<string, { signe_at: string; ruul_email: string | null }>();
  // Seules les étapes qui comptent ici (PostgREST rend 1000 lignes au plus : 50 candidatures × ~10 lignes).
  const utiles = ["code_rappel", "signature_j1", "signature_j3", "signature_vendredi", ...ETAPES_APRES_SIGNATURE];
  for (let i = 0; i < toutes.length; i += 50) {
    const ids = toutes.slice(i, i + 50).map((c) => c.id);
    const [rel, sig] = await Promise.all([
      db.from("join_relances").select("candidature_id, etape, at, detail").in("candidature_id", ids).in("etape", utiles).limit(1000),
      db.from("join_signatures").select("candidature_id, signe_at, ruul_email").in("candidature_id", ids).limit(1000),
    ]);
    if (rel.error || sig.error) throw new Error(`journal : ${rel.error?.message ?? sig.error?.message}`);
    const paysDe = new Map(toutes.slice(i, i + 50).map((c) => [c.id, c.pays]));
    for (const r of rel.data ?? []) {
      const k = r.candidature_id as string;
      if (!faitesPar.has(k)) faitesPar.set(k, new Set());
      faitesPar.get(k)!.add(r.etape as string);
      if (String(r.etape).startsWith("signature_")) {
        const quand = (r.detail as { horloge?: string } | null)?.horloge ?? (r.at as string);
        if (!joursContrat.has(k)) joursContrat.set(k, new Set());
        joursContrat.get(k)!.add(dateLocale(paysDe.get(k) ?? null, new Date(quand)));
      }
    }
    for (const r of sig.data ?? []) {
      signees.set(r.candidature_id as string, { signe_at: r.signe_at as string, ruul_email: (r.ruul_email as string | null) ?? null });
    }
  }
  const signeesListe: Candidature[] = [];
  for (const c of toutes) {
    const faites = [...(faitesPar.get(c.id) ?? [])];
    if (signees.has(c.id)) {
      if (etapesRestantes(faites).length) {
        // Le lundi fixé à la signature (c.cohorte), jamais recalculé : un enchaînement repris un lundi ou plus tard
        // (création OS en échec puis réessayée) ne doit pas décaler le départ d'une semaine.
        await enchainer(db, mode, reel, c, c.cohorte ?? cohorteASignature(null, maintenant), o);
        bilan.enchainees++;
      }
      signeesListe.push(c);
      continue;
    }
    if (!c.decision) {
      const verifie = codesVerifies(c, mode);
      if (!c.manques?.some((m) => m.startsWith("pays fermé"))) {
        if (relanceCodeDue(c.cree_at, verifie, faites.includes("code_rappel"), maintenant)) {
          await message(db, mode, c, "code_rappel", {}, null, { simuler: o.simuler ? "simulation (horloge simulée)" : null, detail: horloge });
          bilan.codes++;
        }
      }
      continue;
    }
    if (c.decision !== "auto" || !c.decision_at) continue;
    const etape = etapeRelanceSignature(c.decision_at, faites, maintenant);
    const lundi = cohorteASignature(c.cohorte, maintenant);
    if (etape === "expirer") {
      if (o.simuler) {
        await journaliserRelance(db, c, "expiree", "systeme", "simule", { raison: "simulation (horloge simulée)", horloge: maintenant.toISOString() });
        continue;
      }
      await db.from("join_candidatures").update({ expire_at: maintenant.toISOString(), maj_at: maintenant.toISOString() }).eq("id", c.id);
      await evenement(db, "expiree", c.id, c.test);
      await message(db, mode, c, "expiree", {}, null);
      bilan.expirees++;
      continue;
    }
    if (etape) {
      await message(db, mode, c, etape, { lundi: lundiLisible(lundi), limite: limiteLisible(lundi) }, "contract_to_sign",
        { simuler: o.simuler ? "simulation (horloge simulée)" : null, detail: horloge });
      bilan.signature++;
      continue;
    }
    // 0858 : le rappel du contrat du vendredi avant le lundi offert (derrière join_reel.rappels, sinon simulé).
    const dejaAujourdhui = joursContrat.get(c.id)?.has(dateLocale(c.pays, maintenant)) ?? false;
    if (signatureVendrediDue({ decisionAt: c.decision_at, lundi, faites, pays: c.pays, maintenant, dejaAujourdhui })) {
      const h = heureLocale(c.pays, maintenant);
      if (h >= 9 && h < 20) {
        await message(db, mode, c, "signature_vendredi", { lundi: lundiLisible(lundi), limite: limiteLisible(lundi) }, "contract_to_sign", {
          simuler: raisonSimulation("rappels", reel, { test: c.test, simuler: o.simuler }),
          whatsappSimule: raisonSimulation("whatsapp", reel, { test: c.test, simuler: o.simuler }), detail: horloge,
        });
        bilan.signature++;
      }
    }
  }

  // 0858 : la checklist des signés (synchronisée avec l'OS) et ses rappels.
  for (let i = 0; i < signeesListe.length; i += 20) {
    const lot = signeesListe.slice(i, i + 20);
    const ids = lot.map((c) => c.id);
    const [et, rel, os] = await Promise.all([
      db.from("join_etapes").select("candidature_id, etape, statut, valeur").in("candidature_id", ids).limit(1000),
      db.from("join_relances").select("candidature_id, etape, canal, detail").in("candidature_id", ids).like("etape", "rappel:%").limit(1000),
      etatsOS(db, lot.map((c) => c.profile_id ?? "").filter(Boolean)),
    ]);
    if (et.error || rel.error) throw new Error(`checklist : ${et.error?.message ?? rel.error?.message}`);
    for (const c of lot) {
      // L'enchaînement vient peut-être de relier la fiche : relue pour ce passage.
      if (!c.profile_id) {
        const { data } = await db.from("join_candidatures").select("profile_id, email_os, handle_tiktok").eq("id", c.id).maybeSingle();
        if (data?.profile_id) Object.assign(c, data);
      }
      const etatOs = c.profile_id ? os.get(c.profile_id) ?? (await etatsOS(db, [c.profile_id])).get(c.profile_id) ?? null : null;
      const etapes = (et.data ?? []).filter((x) => x.candidature_id === c.id) as LigneEtape[];
      const sig = signees.get(c.id)!;
      const faites = await synchroniser(db, c, etapes, true, etatOs, o);
      bilan.synchronisees++;
      const lundi = etatOs?.cohorte_lundi ?? c.cohorte ?? cohorteASignature(null, new Date(sig.signe_at));
      const journal = (rel.data ?? []).filter((x) => x.candidature_id === c.id)
        .map((x) => ({ etape: x.etape as string, canal: x.canal as string, detail: (x.detail as Corps | null) ?? null }));
      await rappelsCandidat(db, mode, reel, c, { signeAt: sig.signe_at, lundi, faites, os: etatOs, journal, ruulEmail: sig.ruul_email }, o, bilan);
    }
  }
  return bilan;
}

/**
 * 0858 : la langue du pays est-elle gérée par l'OS ? La règle de hub-posteurs (action « zones », la même que le bouton
 * « Accept all valid » du site) : `langue_os` = langue du pays connue et publiée par des comptes actifs de l'OS.
 * null : l'OS n'a pas répondu (la candidature va à l'admin avec ce manque).
 */
async function langueGereeOS(pays: string): Promise<{ geree: boolean | null; code: string | null }> {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("OS_HUB_SECRET");
  if (!url || !secret) return { geree: null, code: null };
  try {
    const r = await fetch(`${url}/functions/v1/hub-posteurs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-secret": secret },
      body: JSON.stringify({ action: "zones" }),
      signal: AbortSignal.timeout(30_000),
    });
    const x = await r.json().catch(() => null) as { ok?: boolean; ouverts?: { pays_code: string; langue: string; langue_os: boolean }[] } | null;
    if (!r.ok || !x?.ok || !Array.isArray(x.ouverts)) return { geree: null, code: null };
    const o = x.ouverts.find((p) => p.pays_code === pays.toUpperCase());
    return o ? { geree: o.langue_os === true, code: o.langue ?? null } : { geree: false, code: null };
  } catch (e) {
    console.error("join langue", e instanceof Error ? e.message : String(e));
    return { geree: null, code: null };
  }
}

/** 0858 : les doublons de la candidature (join_doublons), lisibles. En panne : un manque qui le dit. */
async function doublonsDe(db: Db, id: string): Promise<string[]> {
  const { data, error } = await db.rpc("join_doublons", { p_candidature: id });
  if (error) {
    console.error("join_doublons", error.message);
    return ["doublons non vérifiés (base injoignable)"];
  }
  return Array.isArray(data) ? (data as string[]) : [];
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

/**
 * 26/11 : le profil TikTok préparé par l'OS pour ce posteur (pseudo, nom affiché, bio, photo : le compte perso actif le
 * plus ancien, comme join_etat_os et le dashboard de l'OS). Sans fiche OS ou sans compte : tout est null (pret: false).
 */
async function profilOS(db: Db, profileId: string | null | undefined): Promise<ProfilTiktokOS> {
  if (!profileId) return { ...PROFIL_TIKTOK_VIDE };
  const { data, error } = await db.from("comptes").select("handle_tiktok, persona_nom, persona_bio, avatar_url, type_compte, created_at")
    .eq("poster_id", profileId).eq("is_active", true).order("created_at", { ascending: true }).limit(20);
  if (error) console.error("join comptes", error.message);
  return profilTiktokOS((data ?? []) as CompteOS[]);
}

function vueCandidature(c: Candidature, mode: ModeJoin) {
  return {
    id: c.id, test: c.test, prenom: c.prenom, nom: c.nom, email: c.email, whatsapp: c.whatsapp_e164, pays: c.pays,
    // 25/11 : sans code WhatsApp (join_mode.modele_code vide), le numéro n'a pas de code à vérifier.
    langue: c.langue, email_verifie: !!c.email_verifie_at, whatsapp_verifie: !!c.whatsapp_verifie_at || !codeWhatsappActif(mode),
    whatsapp_code: codeWhatsappActif(mode),
    // 26/11 : le @ n'existe qu'une fois relié à l'OS (jamais un pseudo inventé par Join).
    decision: c.decision, cohorte: c.cohorte, handle_tiktok: c.profile_id ? c.handle_tiktok : null, whatsapp_optin: !!c.whatsapp_optin_at,
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
function ligneAdmin(c: Candidature & Record<string, unknown>, signee: boolean, mode: ModeJoin) {
  const etape = etapeAdmin(c, signee, codeWhatsappActif(mode));
  const source = (c.source ?? {}) as Record<string, string>;
  return {
    id: c.id, test: c.test, prenom: c.prenom, nom: c.nom, email: c.email, pays: c.pays, cree_at: c.cree_at, maj_at: c.maj_at,
    etape, email_verifie: !!c.email_verifie_at, whatsapp_verifie: !!c.whatsapp_verifie_at, decision: c.decision,
    eligible: c.decision === "a_traiter" ? !(c.manques ?? []).length : null, manques: c.manques ?? [],
    // 26/11 (0863) : les alertes (même nom…) : vues par l'admin, jamais bloquantes.
    alertes: (c.alertes as string[] | null | undefined) ?? [],
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
        ok: true, mode: mode.mode, auto_acceptation: await lireAuto(db), reel: await lireReel(db),
        candidatures: lignes.map((c) => ligneAdmin(c, signees.has(c.id), mode)), lu_at: new Date().toISOString(),
      });
    }

    case "admin_fiche": {
      const id = String(b.id ?? "");
      const { data: c } = await db.from("join_candidatures").select("*").eq("id", id).maybeSingle();
      if (!c) return erreur("introuvable", 404);
      const [ev, rel, sig, et] = await Promise.all([
        db.from("join_evenements").select("type, at, detail").eq("candidature_id", id).order("at", { ascending: true }).limit(300),
        db.from("join_relances").select("etape, canal, statut, at, detail").eq("candidature_id", id).order("at", { ascending: true }).limit(300),
        db.from("join_signatures").select("version, signe_at, nom_legal, ruul_email, ip, sha256").eq("candidature_id", id)
          .limit(1).maybeSingle(),
        db.from("join_etapes").select("etape, statut, valeur, maj_at").eq("candidature_id", id).limit(20),
      ]);
      const cand = c as Candidature & Record<string, unknown>;
      // 26/11 : le @ du compte de l'OS seulement (une ancienne proposition de Join n'est plus montrée).
      const handleOS = (await profilOS(db, cand.profile_id)).handle;
      // Les messages envoyés : le journal des envois, avec l'objet et le texte du message de ce type (anglais).
      const messages = (rel.data ?? []).map((r) => {
        const type = r.etape as TypeMessageJoin;
        const m = (TYPES_MESSAGE_JOIN as readonly string[]).includes(type) && r.canal !== "systeme"
          ? texteMessage(type, { prenom: cand.prenom, lien: JOIN_URL(), handle: handleOS, login: cand.email_os ?? null })
          : null;
        // 0858 : un rappel de la checklist ou une étape simulée : l'objet et la raison notés dans le détail.
        const d = (r.detail ?? {}) as { objet?: string; raison?: string; modele?: string };
        return { ...r, objet: m?.objet ?? d.objet ?? (d.modele ? `WhatsApp ${d.modele}` : null), texte: m?.corps ?? d.raison ?? null };
      });
      return json({
        ok: true, mode: mode.mode,
        candidature: {
          ...ligneAdmin(cand, !!sig.data, mode), whatsapp: cand.whatsapp_e164, langue: cand.langue, majeur: cand.majeur ?? null,
          age: cand.age, deux_telephones: cand.deux_telephones, reponses: cand.reponses, source_brute: cand.source ?? {},
          handle_tiktok: handleOS, expire_at: cand.expire_at, decision_at: cand.decision_at,
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
      const possibles = decisionsAdminPossibles(etapeAdmin(c, signees.has(c.id), codeWhatsappActif(mode)));
      if (choix === "accepter" && !possibles.accepter) return erreur("acceptation impossible à cette étape", 409);
      if (choix === "accepter" && !codesVerifies(c, mode)) return erreur("codes pas encore vérifiés", 409);
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
      // 0858 (cron seulement) : une horloge simulée, une seule candidature, un état de l'OS imposé. Avec l'un d'eux,
      // c'est toujours une simulation : rien ne part, rien n'est créé (journal « simule »).
      const o: Options & { candidatureId?: string } = {};
      if (typeof b.maintenant === "string" && !Number.isNaN(Date.parse(b.maintenant))) o.maintenant = new Date(b.maintenant);
      if (typeof b.candidature_id === "string" && /^[0-9a-f-]{36}$/i.test(b.candidature_id)) o.candidatureId = b.candidature_id;
      if (b.etat && typeof b.etat === "object") {
        const e = b.etat as Record<string, unknown>;
        o.etat = Object.fromEntries(Object.entries(e).filter(([k, v]) =>
          ((ETAPES_CHECKLIST as readonly string[]).includes(k) && typeof v === "boolean") || (k === "premier_post_at" && (v === null || typeof v === "string"))
        )) as Options["etat"];
      }
      o.simuler = b.simuler === true || !!o.maintenant || !!o.etat;
      return json({ ok: true, mode: mode.mode, ...(await relances(db, mode, o)) });
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
      // 25/11 (Max) : le code par email seulement, sauf si un modèle WhatsApp d'authentification est configuré.
      const waActif = codeWhatsappActif(mode);
      const codeEmail = await creerCode(db, c.id, "email");
      const codeWhatsapp = waActif ? await creerCode(db, c.id, "whatsapp") : null;
      const email = await envoyerCodeEmail(db, mode, c, codeEmail);
      await journaliserRelance(db, c, "code", "email", email);
      if (codeWhatsapp) await journaliserRelance(db, c, "code", "whatsapp", await envoyerCodeWhatsapp(db, mode, c, codeWhatsapp));
      const jeton = await ouvrirSession(db, c.id, SESSION_COURTE_H);
      return json({
        ok: true, candidature_id: c.id, jeton, mode: mode.mode, email_envoye: email === "envoye", whatsapp_code: waActif,
        ...(enTest ? { codes_test: { email: codeEmail, ...(codeWhatsapp ? { whatsapp: codeWhatsapp } : {}) } } : {}),
      });
    }

    case "renvoyer_code": {
      const c = await candidatureDeSession(db, request, b);
      if (!c) return erreur("session", 401);
      const canal = b.canal === "whatsapp" ? "whatsapp" : "email";
      if (canal === "whatsapp" && !codeWhatsappActif(mode)) return erreur("whatsapp_code_off");
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
        if (codesVerifies(c, mode)) await evenement(db, "verifiee", c.id, c.test);
      }
      return json({ ok: true, email_verifie: !!c.email_verifie_at, whatsapp_verifie: !!c.whatsapp_verifie_at || !codeWhatsappActif(mode) });
    }

    case "decision": {
      const c = await candidatureDeSession(db, request, b);
      if (!c) return erreur("session", 401);
      if (!codesVerifies(c, mode)) return erreur("not_verified");
      if (!c.decision) {
        const { pays } = await paysOuverts(db);
        // 0858 : les règles de l'OS + la langue du pays gérée par l'OS + aucun doublon (email, téléphone).
        // 26/11 (0863) : un même nom n'est qu'une alerte pour l'admin (`alertes`), il ne bloque pas.
        const [langue, doublons] = await Promise.all([langueGereeOS(c.pays), doublonsDe(db, c.id)]);
        const regles = deciderJoin(c, new Set(pays.map((p) => p.pays)), codeWhatsappActif(mode), { langue, doublons });
        // 0847 : l'interrupteur « Acceptation automatique » (OFF : même une candidature complète attend l'admin).
        const d = deciderAvecReglage(regles, await lireAuto(db));
        const maintenant = new Date().toISOString();
        const cohorte = d.decision === "auto" ? cohorteDe(aujourdhuiParis()) : null;
        await db.from("join_candidatures").update({
          decision: d.decision, decision_at: maintenant, manques: d.manques, alertes: regles.alertes, cohorte, maj_at: maintenant,
        }).eq("id", c.id);
        await evenement(db, d.decision === "auto" ? "acceptee" : "a_traiter", c.id, c.test, {
          manques: d.manques, eligible: d.eligible, ...(regles.alertes.length ? { alertes: regles.alertes } : {}),
        });
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
        await majEtape(db, c.id, "contrat", "fait", { fait_at: new Date().toISOString(), source: "signature", version: CONTRAT_VERSION });
        // 26/11 (Max) : aucun pseudo proposé par Join : le @ (et tout le profil TikTok) vient du compte créé par l'OS.
        // Signé après la date limite : le départ glisse au lundi suivant.
        await db.from("join_candidatures").update({ cohorte: lundi, maj_at: new Date().toISOString() }).eq("id", c.id);
        c.cohorte = lundi;
        // Tout s'enchaîne seul : compte OS → Slack → bienvenue → invitation Ruul (chaque étape derrière son drapeau join_reel).
        // 25/11 : en arrière-plan, la réponse part dès la signature enregistrée (5-6 s d'attente avant). Sans
        // EdgeRuntime.waitUntil, le travail peut être coupé : le cron horaire reprend l'enchaînement (idempotent).
        const travail = lireReel(db).then((reel) => enchainer(db, mode, reel, c, lundi))
          .catch((e) => console.error("join enchainer", e instanceof Error ? e.message : String(e)));
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(travail);
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
      const etapes = (await etapesDe(db, c.id)) as LigneEtape[];
      const { data: sig } = await db.from("join_signatures").select("signe_at, version, ruul_email").eq("candidature_id", c.id)
        .limit(1).maybeSingle();
      // 0858 : la checklist, synchronisée avec l'OS (ce que l'OS voit fait se coche ici).
      const os = c.profile_id ? (await etatsOS(db, [c.profile_id])).get(c.profile_id) ?? null : null;
      const faites = sig ? await synchroniser(db, c, etapes, true, os) : etatChecklist({ signee: false, etapes }, os);
      const warmupFini = faites.warmup || etapes.some((e) => e.etape === "warmup" && e.statut === "fait");
      // Le lundi de départ : celui de l'OS quand la fiche existe (un report de l'OS le décale), sinon celui de Join.
      const premier = os?.cohorte_lundi ?? (c.cohorte ? premierPost(c.cohorte, warmupFini, aujourdhuiParis()) : null);
      const lundiOffre = c.decision === "auto" && !sig ? cohorteASignature(c.cohorte) : null;
      // 26/11 (Max : « les infos sont sur l'OS ») : le profil TikTok à créer est SEULEMENT celui du compte de l'OS (le
      // même que sur son dashboard : pseudo, nom affiché, bio, photo). Pas encore de compte : tout null, pret: false.
      const profil = await profilOS(db, c.profile_id);
      // Ruul : le lien personnel d'onboarding (API Ruul, gardé 48 h) ; sans lui, l'inscription app.ruul.io/register.
      let lienRuulPerso: string | null = null;
      if (sig && c.profile_id && !faites.ruul) {
        const reel = await lireReel(db);
        if (reel.ruul) lienRuulPerso = await lienRuul(db, c.profile_id);
        else {
          const reglage = await lireReglageConnect(db);
          const { data: l } = await db.from("ruul_liens").select("url, cree_at, env").eq("poster_id", c.profile_id).maybeSingle();
          if (lienFrais(l as { url: string; cree_at: string; env: string } | null, reglage.env)) lienRuulPerso = (l as { url: string }).url;
        }
      }
      return json({
        ok: true, mode: mode.mode, candidature: vueCandidature(c, mode), signature: sig ? { signe_at: sig.signe_at, version: sig.version } : null,
        etapes, expiree: !!c.expire_at,
        ...(lundiOffre ? { offre: { cohorte: lundiOffre, date_limite: new Date(dateLimiteSignature(lundiOffre).getTime() - 60_000).toISOString() } } : {}),
        premier_post: premier, premier_post_texte: premier ? `Your first post is on ${lundiLisible(premier)}` : null,
        checklist: ETAPES_CHECKLIST.map((e) => ({ etape: e, fait: faites[e] })),
        liens: {
          dashboard: LIEN_DASHBOARD_OS, slack: LIEN_SLACK, tiktok: LIEN_TIKTOK, ruul: lienRuulPerso ?? LIEN_INSCRIPTION_RUUL,
          ruul_personnel: !!lienRuulPerso,
        },
        handle: profil.handle,
        ruul_email: os?.ruul_email ?? sig?.ruul_email ?? null,
        compte_os: !!c.profile_id,
        profil_suggere: profil,
        ruul_visible: c.ruul_visible,
        // 26/11 (Max) : les infos de connexion au dashboard de l'OS, en clair (jamais de mot de passe : il n'y en a pas).
        // `lien_mot_de_passe` : le bouton « Set my password » peut être demandé (action mot_de_passe) : fiche créée par
        // Join, active, jamais connectée.
        connexion: {
          dashboard: LIEN_DASHBOARD_OS,
          login: c.profile_id ? c.email_os ?? null : null,
          lien_mot_de_passe: !!sig && !faites.dashboard && !!c.profile_id && os?.is_active !== false && await creeParJoin(db, c),
        },
        // 26/11 : les sous-étapes Ruul, les mêmes que le bloc « Get paid » du dashboard de l'OS (ruul_etapes).
        ruul_etapes: c.profile_id && os ? etapesRuul(os) : null,
        premiere_paie: premier ? premierePaie(premier) : null,
      });
    }

    case "mot_de_passe": {
      // 26/11 (Max) : le bouton « Choisir mon mot de passe » de la page Join : le lien personnel « Set my password » de
      // l'OS (le même que la bienvenue : mot_de_passe_lien_creer, par « join »). L'OS ne garde que l'empreinte du jeton
      // (un lien déjà envoyé ne peut pas être relu) ; chaque lien sert une fois, vaut 14 jours, et en créer un n'annule
      // pas les autres. Donc : un lien neuf au clic, seulement pour une fiche créée par Join, active, jamais connectée
      // (après la première connexion, le dashboard a ses propres outils), au plus LIENS_MDP_JOUR par 24 h.
      const c = await candidatureDeSession(db, request, b);
      if (!c) return erreur("session", 401);
      const { data: sig } = await db.from("join_signatures").select("id").eq("candidature_id", c.id).limit(1).maybeSingle();
      if (!sig || !c.profile_id || !(await creeParJoin(db, c))) return erreur("not_ready", 409);
      const os = (await etatsOS(db, [c.profile_id])).get(c.profile_id) ?? null;
      if (!os || os.is_active === false) return erreur("not_ready", 409);
      if (os.premiere_connexion_at) return json({ ok: false, error: "already_connected" }, 409);
      const { count } = await db.from("mot_de_passe_liens").select("id", { count: "exact", head: true })
        .eq("poster_id", c.profile_id).eq("par", "join").gte("cree_at", new Date(Date.now() - 24 * HEURE).toISOString());
      if ((count ?? 0) >= LIENS_MDP_JOUR) return erreur("too_many", 429);
      const { data: jeton, error } = await db.rpc("mot_de_passe_lien_creer", { p_poster: c.profile_id, p_par: "join" });
      if (error || typeof jeton !== "string" || !jeton) {
        console.error("join mot_de_passe", error?.message ?? "non créé");
        return erreur("erreur interne", 500);
      }
      await journaliserRelance(db, c, "mot_de_passe", "systeme", "envoye", { quoi: "lien « Set my password » ouvert depuis la page Join" });
      return json({ ok: true, url: lienMotDePasse(LIEN_DASHBOARD_OS, jeton) });
    }

    case "etape": {
      const c = await candidatureDeSession(db, request, b);
      if (!c) return erreur("session", 401);
      const etape = b.etape;
      if (!estEtapeJoin(etape)) return erreur("etape inconnue");
      const valeur = (b.valeur && typeof b.valeur === "object" ? b.valeur : {}) as Corps;

      if (etape === "tiktok") {
        // « Je l'ai créé » : vérification en lecture seule du @ du compte de l'OS (26/11 : jamais un @ saisi ni proposé
        // par Join). Sans compte de l'OS : pas encore prêt.
        const handle = nettoyerHandle((await profilOS(db, c.profile_id)).handle ?? "");
        if (!handle) return json({ ok: false, error: "not_ready" }, 409);
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
