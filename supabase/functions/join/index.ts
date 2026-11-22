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
 * connexion, moi, etape.
 */
import { corsHeaders, json, serviceClient } from "../_shared/supabase.ts";
import { envoyerEmailSite, rendreEmailRuul } from "../_shared/ruul.ts";
import { lireProfilTiktok } from "../_shared/profil_tiktok.ts";
import {
  type CandidatureJoin,
  CODE_DUREE_MIN,
  CODE_ESSAIS_MAX,
  CONSENTEMENT,
  CONTRAT_RESUME,
  CONTRAT_TEXTE,
  CONTRAT_VERSION,
  cohorteDe,
  decider,
  emailAutorise,
  estEtapeJoin,
  etatCode,
  genererCode,
  genererJeton,
  handlePropose,
  lireModeJoin,
  lundiLisible,
  MESSAGE_A_TRAITER,
  type ModeJoin,
  nettoyerHandle,
  paysEtPaie,
  premierPost,
  sha256Hex,
  texteContratComplet,
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
  cree_at: string;
};

const HEURE = 3_600_000;
const SESSION_COURTE_H = 24;
const SESSION_LONGUE_H = 24 * 30;

const erreur = (message: string, status = 400) => json({ ok: false, error: message }, status);

function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
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
    lienStop: Deno.env.get("JOIN_URL") ?? "https://join.vik-studios-creators.com",
    sansPied: true,
  });
  const r = await envoyerEmailSite(c.email, objet, html, texte, Deno.env.get("JOIN_URL") ?? "https://join.vik-studios-creators.com",
    ["join", "join-code", "test"]);
  return r.ok ? "envoye" : "bloque";
}

async function journaliserRelance(db: Db, c: Candidature, etape: string, canal: string, statut: "simule" | "envoye" | "bloque") {
  await db.from("join_relances").insert({ candidature_id: c.id, etape, canal, statut });
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
    decision: c.decision, cohorte: c.cohorte, handle_tiktok: c.handle_tiktok,
  };
}

// ---------------------------------------------------------------------------------------------------------------

async function traiter(request: Request, db: Db, b: Corps): Promise<Response> {
  const action = String(b.action ?? "");
  const mode = await lireMode(db);
  const enTest = mode.mode === "test";

  switch (action) {
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
      if (!v.ok) return json({ ok: false, error: "invalid", fields: v.erreurs }, 400);
      const { data, error } = await db.from("join_candidatures").insert({
        ...v.valeurs, test: true, consentement_at: new Date().toISOString(),
      }).select("*").single();
      if (error || !data) return erreur("enregistrement impossible", 500);
      const c = data as Candidature;
      await evenement(db, "candidature", c.id, c.test, { pays: c.pays, langue: c.langue, consentement: CONSENTEMENT });
      const codeEmail = await creerCode(db, c.id, "email");
      const codeWhatsapp = await creerCode(db, c.id, "whatsapp");
      const email = await envoyerCodeEmail(mode, c, codeEmail);
      await journaliserRelance(db, c, "code", "email", email);
      // WhatsApp : le modèle d'authentification n'existe pas encore → aucun envoi, code affiché à l'écran.
      await journaliserRelance(db, c, "code", "whatsapp", "simule");
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
      const etat = canal === "email" ? await envoyerCodeEmail(mode, c, code) : "simule";
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
      return json({
        ok: true, decision: c.decision, cohorte: c.cohorte,
        ...(c.decision === "a_traiter" ? { message: MESSAGE_A_TRAITER } : {}),
      });
    }

    case "contrat":
      return json({ ok: true, version: CONTRAT_VERSION, resume: CONTRAT_RESUME, texte: CONTRAT_TEXTE });

    case "signer": {
      const c = await candidatureDeSession(db, request, b);
      if (!c) return erreur("session", 401);
      if (c.decision !== "auto") return erreur("not_accepted", 403);
      const { data: deja } = await db.from("join_signatures").select("id").eq("candidature_id", c.id).limit(1).maybeSingle();
      if (!deja) {
        const texte = texteContratComplet();
        const { error } = await db.from("join_signatures").insert({
          candidature_id: c.id, version: CONTRAT_VERSION, texte, sha256: await sha256Hex(texte),
          ip: (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
          user_agent: (request.headers.get("user-agent") ?? "").slice(0, 500) || null,
        });
        if (error) return erreur("signature impossible", 500);
        await evenement(db, "signee", c.id, c.test, { version: CONTRAT_VERSION });
        // Compte OS / fiche posteur : SIMULÉ (aucun utilisateur Auth, aucune ligne profiles).
        await simuler(db, c, "creation_compte_os");
        const handle = handlePropose(c.prenom);
        await majEtape(db, c.id, "tiktok", "a_faire", { propose: handle });
        await db.from("join_candidatures").update({ handle_tiktok: handle, maj_at: new Date().toISOString() }).eq("id", c.id);
      }
      const jeton = await ouvrirSession(db, c.id, SESSION_LONGUE_H);
      await evenement(db, "connectee", c.id, c.test, { via: "signature" });
      return json({ ok: true, jeton });
    }

    case "connexion_code": {
      const email = String(b.email ?? "").trim().toLowerCase();
      const { data } = await db.from("join_candidatures").select("*").eq("email", email)
        .not("email_verifie_at", "is", null).order("cree_at", { ascending: false }).limit(1).maybeSingle();
      // Toujours ok : la réponse ne dit pas si l'adresse existe (sauf l'affichage du code en test).
      if (!data) return json({ ok: true });
      const c = data as Candidature;
      const code = await creerCode(db, c.id, "connexion");
      await journaliserRelance(db, c, "connexion", "email", await envoyerCodeEmail(mode, c, code));
      return json({ ok: true, ...(enTest ? { codes_test: { email: code } } : {}) });
    }

    case "connexion": {
      const email = String(b.email ?? "").trim().toLowerCase();
      const { data } = await db.from("join_candidatures").select("*").eq("email", email)
        .not("email_verifie_at", "is", null).order("cree_at", { ascending: false }).limit(1).maybeSingle();
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
      return json({
        ok: true, mode: mode.mode, candidature: vueCandidature(c), signature: sig ?? null, etapes,
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
