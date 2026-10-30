import {
  abregerPourJournal,
  aRenouveler,
  attenteRetryAfter,
  avecRetry,
  corpsJeton,
  erreurGraphql,
  INTROSPECTION,
  lireContrat,
  lireJetons,
  racinesSchema,
  REQUETE_JALONS,
  REQUETE_STATUT_CONTRAT,
  contratFerme,
  lireFinContrat,
  orgDeLOs,
  ORGS_OS,
  REQUETE_FIN_CONTRAT,
  jalonAApprouver,
  MUTATION_APPROUVER,
  MUTATION_CREER_JALON,
  MUTATION_EDITER_JALON,
  MUTATION_FINANCER_JALON,
  MUTATION_MESSAGE,
  REQUETE_SALON,
  requeteContrats,
  TAILLE_PAGE_OFFRES,
  curseurSuivant,
  ETATS_FINANCES,
  UPWORK_GRAPHQL,
  UPWORK_JETON,
  urlAutorisation,
  urlRetour,
} from "../_shared/upwork.ts";
import {
  type Annonce,
  bienvenueARattraper,
  codePays,
  type DetailsContrat,
  hmDeNomUpwork,
  type InfosApi,
  langueDePays,
  REQUETES_LOCALISATION,
  GUIDE_POSTER,
  lireDetailsContrat,
  annoncesDepuisPosteurs,
  lireModeAuto,
  messageAccueil,
  normaliserNom,
  type PosteurAnnonce,
  planAccueil,
  type PosteurExistant,
  REQUETE_DETAILS_CONTRAT,
} from "../_shared/accueil.ts";
import { deduireTarif } from "../_shared/tarifs.ts";
import { noter429, passageDu } from "../_shared/frequences.ts";
import { derniersMessagesSalon } from "../_shared/contexte.ts";
import {
  decrireJalons,
  etape,
  type EtapeArret,
  etatSemaineKill,
  MUTATION_FERMER_CONTRAT,
  MUTATION_SUPPRIMER_JALON,
  planFinContrat,
  planUpwork,
  RAISON_FIN_DEFAUT,
} from "../_shared/arret.ts";
import {
  ACTIONS_PAYEES,
  aReessayer,
  choisirCanari,
  classerErreur,
  ecartsCanari,
  ecartsReconciliation,
  fusionnerParContrat,
  type LigneAuto,
  montantConforme,
  numeroSemaine,
  peutPayer,
  reessaisFinis,
  remplirTexte,
  semaineAPayer,
  SOUMETTRE_DEFAUT,
  type TypeErreur,
} from "../_shared/paie_auto.ts";
import {
  centimes,
  ecartComptes,
  estHorsUpwork,
  type JalonUpwork,
  lireJalonsContrat,
  lireReglagesPaieApi,
  PAYEES,
  type PlanPaiement,
  planPaiement,
  type ReglagesPaieApi,
  refusMode,
  semaineDuNom,
} from "../_shared/paiement.ts";
import { ajouterJours, maintenantParis, semaineIso as semaineIsoDe } from "../_shared/ckd.ts";
import { assertRole, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";
import { automationEnPause, bloquer, noterBloquee, PAUSE } from "../_shared/pause.ts";
import { choisirCompte, COMPTE_SECOURS, type CompteDuJour, lireCompte } from "../_shared/upwork_comptes.ts";
import { estLimiteUpwork } from "../_shared/garde_fous.ts";

type Supabase = ReturnType<typeof serviceClient>;

/** L'OS, où l'admin revient après avoir autorisé Upwork (src/features/recrutements/constantes.ts). */
const OS_URL = "https://sophia-marketing-orga.vercel.app";
/** Max, sur Slack : prévenu si la connexion tombe. */
const SLACK_MAX = "U0BL5FRLBEU";
/**
 * La connexion de Max (propriétaire de Vik Studios) : tout passe par elle. Prompt
 * 25 v4 : une 2e connexion, « secours » (Adrien, membre de Vik Studios), pour
 * les messages seulement, quand Max a écrit à 45 personnes ou a eu la limite.
 */
const COMPTE = "principal";

/**
 * upwork — tous les appels à l'API Upwork passent ici (prompt 14), côté
 * serveur, jamais depuis le navigateur. Chaque appel est noté dans
 * `upwork_appels`. Point 1 : connexion et lectures seulement, aucune écriture
 * sur Upwork.
 *
 *   { action: "lien" }                       admin
 *       L'adresse d'autorisation Upwork (state à usage unique, 15 min).
 *   GET ?code=…&state=…                       retour d'Upwork (via upwork-callback)
 *       Échange le code, range les jetons dans le coffre, lit le schéma et les
 *       organisations, puis renvoie l'admin sur Réglages.
 *   { action: "diagnostic" }                 admin
 *       Relit le schéma, les organisations et ce que la clé permet de lire.
 *   { action: "contrats" }                   admin
 *       Point 2a : relit les contrats actifs de chaque organisation connectée
 *       (organization.clientOffers, 50 par page) dans `upwork_contrats`.
 *       Lecture seule.
 *   { action: "jalons" }                     admin
 *       F1 (28 oct.) : pour chaque contrat actif relié à un posteur, la 1re
 *       milestone financée et non payée, dans `upwork_jalons`. Lecture seule.
 *   { action: "paie_apercu", semaine, ids }  admin, Head of Ops
 *       Prompt 14, point 3 : pour chaque ligne de paie, relit ses milestones
 *       et rend le plan (approuver, financer, lien, ou refus). Lecture seule.
 *   { action: "paie_payer", semaine, ids, confirmer: true }  admin, Head of Ops
 *       Exécute le plan, ligne par ligne : verrou en base, plafonds, un seul
 *       essai par écriture. Toute erreur : « à vérifier », rien d'autre ne part.
 *   { action: "droits" }                     admin
 *       Teste, en lecture seulement, ce que la clé permet : contrats, jalons
 *       d'un contrat, conversation d'un contrat. Aucune écriture.
 *   { action: "accueil" }                    cron `accueil-auto`, minute 25 ; admin
 *       Système du 2 nov., partie A : les contrats démarrés depuis
 *       `accueil_contrats_depuis` → posteur créé et message de bienvenue
 *       (annonce connue), « Contrats à relier », ou doublon signalé.
 *       Interrupteur `accueil_auto` (off / test / on).
 *   { action: "message_posteur", poster_id, texte, type? }  admin, Head of Ops
 *       « Send on Upwork » : le texte dans la conversation du contrat du
 *       posteur, noté dans `nudges` (canal upwork, à la main).
 *   { action: "arrets" }                     cron `arrets`, minute 40 ; admin
 *       0463 : l'arrêt en deux temps, sans aucun message. Samedi, à Validate,
 *       tout se fait dans la base (trigger arrets_immediat : désactivé, ligne
 *       « To remove from Slack ») ; ici, une ligne restée « à faire » est
 *       rattrapée. Lundi, après la paie (semaine payée ou à 0 $) : milestones
 *       non financées supprimées et contrat fermé par l'API, seulement si
 *       `arret_auto` = on et si le dernier test de fermeture a fermé le
 *       contrat ; en test, simulé une fois. Jamais de nouvel essai.
 *   { action: "contexte_upwork", posteurs?, max? }  cron `contexte-upwork`, toutes les 2 h ; admin (masterlist)
 *       Prompt 27 : les conversations Upwork relues pour la colonne Context (lecture seule).
 *   { action: "reponses_lire", posteurs? }   cron `reponses-upwork`, toutes les heures à :05 ; recrues-check avant un Kill ; admin
 *       Système du 2 nov., partie E : les messages des posteurs ciblés
 *       (`reponses_cibles_upwork`) dans la conversation de leur contrat, plus
 *       récents que le dernier lu → `posteur_reponses` (canal upwork). Lecture
 *       seule ; le classement et la réponse viennent de recrues-check.
 *   { action: "accueil_localiser", contrats? }  admin
 *       0470 : la HM du contrat (hiringManager / supervisor) et le pays du
 *       freelance (userDetails, talentProfile ou l'offre), lus et montrés. Rien
 *       n'est créé ni envoyé.
 *   { action: "accueil_creer", contrat_id, pays, hm_id, langue?, tarif?, confirmer }  admin
 *       0470 : carte « Contract to link » : posteur créé, relié, bienvenue envoyée.
 *       Profil déjà créé par la HM (même contrat) : HM et tarif posés, bienvenue envoyée.
 *   { action: "annonces_amorcer" }           admin
 *       Système du 2 nov., partie A : remplit `annonces_pays` depuis les
 *       posteurs déjà embauchés (l'annonce de leur contrat, lue en lecture
 *       seule ; leur pays, langue, HM, tarif). Une annonce déjà dite à la main
 *       n'est jamais changée.
 *   { action: "verifier" }                   cron `upwork-verifier`, chaque jour
 *       Renouvelle le jeton si besoin et fait un appel léger (la connexion
 *       reste valable 2 semaines après le dernier usage). En cas d'échec :
 *       statut « erreur » et message Slack à Max (une fois par jour).
 *
 * Secrets : UPWORK_CLIENT_ID, UPWORK_CLIENT_SECRET (mis par Max), SUPABASE_URL,
 * SLACK_HM_BOT_TOKEN, CRON_SECRET.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const supabase = serviceClient();
  // Prompt 25 v4 : { action: "lien" | "diagnostic", compte: "secours" } : la connexion de secours (Adrien).
  try {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
      return await retourUpwork(supabase, url);
    }

    // La paie (prompt 14, point 3) et la carte « Contract to link » (0470) : admin et Head of Ops ; le reste : admin.
    const acces = await assertRole(request, ["admin", "head_of_ops"]);
    if (acces instanceof Response) return acces;
    // deno-lint-ignore no-explicit-any
    const body: any = await request.json().catch(() => ({}));
    const par = acces.userId === "cron" ? null : acces.userId;
    if (acces.role !== "admin" && !["paie_apercu", "paie_payer", "paie_auto_lancer", "message_posteur", "paie_simulation", "accueil_localiser", "accueil_creer"].includes(body.action)) {
      return json({ error: "forbidden" }, 403);
    }

    switch (body.action) {
      case "lien":
        return json(await lien(supabase, par, lireCompte(body.compte)));
      case "diagnostic":
        return json(await diagnostic(supabase, par, null, lireCompte(body.compte)));
      case "verifier":
        return json(await verifier(supabase));
      case "contrats":
        return json(await lireContrats(supabase, par));
      case "jalons":
        return json(await lireJalons(supabase, par));
      case "offres":
        // Prompt 27 (Needs you « No channel ») : toutes les offres, tous états, lecture seule.
        return json(await lireOffres(supabase, par));
      case "accueil":
        // Prompt 21 : le cron passe toutes les 15 min ; « Welcome check » dit si c'est son tour.
        if (acces.userId === "cron" && !(await passageDu(supabase, "accueil"))) return json({ ok: true, ignore: "pas encore son tour (Overview → Switches)" });
        return json(await accueillir(supabase, par));
      case "paie_apercu":
        return json(await paieApercu(supabase, par, String(body.semaine ?? ""), body.ids));
      case "paie_payer":
        if (body.confirmer !== true) return json({ ok: false, error: "confirmation manquante" }, 400);
        return json(await paiePayer(supabase, par, String(body.semaine ?? ""), body.ids));
      case "paie_auto":
        return json(await paieAuto(supabase, par));
      case "paie_auto_lancer":
        if (body.confirmer !== true) return json({ ok: false, error: "confirmation manquante" }, 400);
        return json(await paieAuto(supabase, par, { lancer: true }));
      case "paie_reconcilier":
        return json(await paieReconcilier(supabase, par));
      case "paie_question":
        return json(await paieQuestion(supabase, par, String(body.poster_id ?? ""), body.simuler === true));
      case "paie_simulation":
        // Prompt 26 : la paie d'une semaine, simulée (rien n'est payé ni financé).
        return json(await paieSimulation(supabase, par, typeof body.semaine === "string" ? body.semaine : null));
      case "paie_test_financer":
        // 0467 : « Fund this milestone (test) » : seulement le financement, puis la relecture.
        if (body.confirmer !== true) return json({ ok: false, error: "confirmation manquante" }, 400);
        return json(await paieTestFinancer(supabase, par, String(body.contrat_id ?? "")));
      case "paie_test_payer":
        // Prompt 26 : « Pay this week » sur un contrat de test (Overview → Test contracts).
        if (body.confirmer !== true) return json({ ok: false, error: "confirmation manquante" }, 400);
        return json(await paieTestPayer(supabase, par, String(body.contrat_id ?? "")));
      case "test_fermeture":
        // Prompt 13 : Test Kill & pay / Test Kill & don't pay sur un contrat de test (jamais par le cron).
        if (body.confirmer !== true || acces.userId === "cron") return json({ ok: false, error: "confirmation manquante" }, 400);
        return json(await testFermeture(supabase, par, String(body.contrat_id ?? ""), body.mode === "payer" ? "payer" : "sans_payer"));
      case "droits":
        return json(await testerDroits(supabase, par));
      case "message": {
        // Prompt 25 : relances et nudges (priorite: false) s'arrêtent avant la réserve gardée pour la bienvenue, le Kill et l'arrêt.
        const contratId = String(body.contrat_id ?? "");
        // Prompt 25 v4 : « compte: secours » force le compte d'Adrien, seulement sur un contrat de test (Run now).
        if (body.compte === COMPTE_SECOURS) {
          const { data: t } = await supabase.from("contrats_test").select("contrat_id").eq("contrat_id", contratId).is("retire_at", null).maybeSingle();
          if (!t) return json({ ok: false, error: "le compte de secours ne se force que sur un contrat de test" }, 400);
        }
        return json(
          await envoyerMessage(supabase, par, contratId, String(body.texte ?? ""), {
            prioritaire: body.priorite !== false,
            ...(body.compte === COMPTE_SECOURS ? { forcer: COMPTE_SECOURS } : {}),
          }),
        );
      }
      case "message_posteur":
        return json(await messagePosteur(supabase, par, String(body.poster_id ?? ""), String(body.texte ?? ""), body.type));
      case "arrets":
        return json(await traiterArrets(supabase, par));
      case "arrets_verifier": {
        // 0464 : lundi 20 h et mardi 12 h (Paris) ; le passage se lit dans le jour.
        const jour = maintenantParis().isoJour;
        const passage = typeof body.passage === "string" ? body.passage : jour === 1 ? "lundi_soir" : jour === 2 ? "mardi_midi" : "manuel";
        return json(await verifierArrets(supabase, par, passage));
      }
      case "a_financer_relire":
        return json(await relireAFinancer(supabase, par));
      case "contrats_sans_posteur_lire":
        return json(await lireContratsSansPosteur(supabase, par));
      case "contrat_sans_posteur_fermer":
        return json(await fermerContratSansPosteur(supabase, par, String(body.contrat_id ?? "")));
      case "contexte_upwork": {
        // Prompt 27 : les conversations Upwork des posteurs actifs, relues (lecture seule) pour la masterlist.
        const posteurs = Array.isArray(body.posteurs) ? body.posteurs.map(String) : null;
        return json(await lireContexteUpwork(supabase, par, posteurs, Number(body.max) || 120));
      }
      case "reponses_lire": {
        const posteurs = Array.isArray(body.posteurs) ? body.posteurs.map(String) : null;
        // Prompt 25 MAJ, point 8 : à chaque passage, les messages confiés aux HM sont vérifiés sur Upwork (lecture seule).
        const verifs = posteurs ? null : await verifierEnvoisMain(supabase, par).catch((e) => ({ ok: false, error: messageErreur(e) }));
        // « Upwork replies » règle le passage du cron ; avant un Kill (posteurs donnés), toujours.
        if (acces.userId === "cron" && !posteurs && !(await passageDu(supabase, "reponses"))) {
          return json({ ok: true, ignore: "pas encore son tour (Overview → Switches)" });
        }
        return json({ ...(await lireReponsesUpwork(supabase, par, posteurs)), ...(verifs ? { envois_main: verifs } : {}) });
      }
      case "annonces_amorcer":
        return json(await amorcerAnnonces(supabase, par));
      case "accueil_localiser":
        // 0470 : pays du freelance et HM du contrat, lus et montrés ; rien n'est créé ni envoyé.
        return json(await localiserAccueils(supabase, par, Array.isArray(body.contrats) ? body.contrats.map(String) : null));
      case "accueil_creer":
        // 0470 : carte « Contract to link » : un clic, le posteur créé et la bienvenue envoyée.
        // Jamais par un cron planifié (aucun n'a cette action) ; un appel explicite, avec confirmer.
        if (body.confirmer !== true) return json({ ok: false, error: "confirmation manquante" }, 400);
        return json(await creerAccueilMaintenant(supabase, par, {
          contrat: String(body.contrat_id ?? ""), pays: String(body.pays ?? ""),
          langue: typeof body.langue === "string" && body.langue ? body.langue : null,
          hm_id: typeof body.hm_id === "string" && body.hm_id ? body.hm_id : null,
          tarif: Number(body.tarif) > 0 ? Number(body.tarif) : null,
        }));
      default:
        return json({ ok: false, error: "action inconnue" }, 400);
    }
  } catch (erreur) {
    console.error("[upwork]", messageErreur(erreur));
    return json({ ok: false, error: messageErreur(erreur) }, 500);
  }
});

function identifiants(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = Deno.env.get("UPWORK_CLIENT_ID");
  const clientSecret = Deno.env.get("UPWORK_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!clientId || !clientSecret) throw new Error("UPWORK_CLIENT_ID ou UPWORK_CLIENT_SECRET absent des secrets Supabase");
  if (!supabaseUrl) throw new Error("SUPABASE_URL absent");
  return { clientId, clientSecret, redirectUri: urlRetour(supabaseUrl) };
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

async function noter(
  supabase: Supabase,
  ligne: {
    par: string | null;
    action: string;
    requete?: unknown;
    reponse?: unknown;
    erreur?: string | null;
    statut?: number | null;
    duree?: number;
    contrat?: string | null;
    montant?: number | null;
    compte?: string;
  },
): Promise<void> {
  const compte = ligne.compte ?? COMPTE;
  await supabase.from("upwork_appels").insert({
    par: ligne.par,
    compte,
    action: ligne.action,
    contrat: ligne.contrat ?? null,
    montant: ligne.montant ?? null,
    requete: ligne.requete ?? null,
    reponse: abregerPourJournal(ligne.reponse),
    erreur: ligne.erreur ?? null,
    statut_http: ligne.statut ?? null,
    duree_ms: ligne.duree ?? null,
  });
  await supabase.from("upwork_connexion").update({ dernier_appel_at: new Date().toISOString() }).eq("compte", compte);
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

async function lien(supabase: Supabase, par: string | null, compte: string = COMPTE) {
  const { clientId, redirectUri } = identifiants();
  const state = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const { error } = await supabase.from("upwork_etats").insert({ state, compte, cree_par: par });
  if (error) throw error;
  return { ok: true, url: urlAutorisation(clientId, redirectUri, state), redirect_uri: redirectUri };
}

function versReglages(statut: "ok" | "erreur", raison?: string, compte: string = COMPTE): Response {
  // La connexion de secours se fait depuis Overview (Health).
  const u = new URL(`${OS_URL}${compte === COMPTE ? "/admin/reglages" : "/admin/auto"}`);
  u.searchParams.set("upwork", statut);
  if (compte !== COMPTE) u.searchParams.set("compte", compte);
  if (raison) u.searchParams.set("raison", raison.slice(0, 200));
  u.hash = "upwork";
  return new Response(null, { status: 302, headers: { location: u.toString() } });
}

async function retourUpwork(supabase: Supabase, url: URL): Promise<Response> {
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) {
    return versReglages("erreur", url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "");
  }
  // Le state : créé par un admin il y a moins de 15 min, jamais utilisé.
  const { data: etat, error } = await supabase
    .from("upwork_etats")
    .select("state, compte, cree_par, cree_at, utilise_at")
    .eq("state", state)
    .maybeSingle();
  if (error) throw error;
  if (!etat || etat.utilise_at || Date.now() - new Date(etat.cree_at).getTime() > 15 * 60_000 || !code) {
    return versReglages("erreur", "lien de connexion expiré ou déjà utilisé : recommence depuis Réglages");
  }
  const compte = lireCompte(etat.compte);
  await supabase.from("upwork_etats").update({ utilise_at: new Date().toISOString() }).eq("state", state);

  const { clientId, clientSecret, redirectUri } = identifiants();
  const debut = Date.now();
  const reponse = await fetch(UPWORK_JETON, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: corpsJeton({ type: "code", code, redirectUri, clientId, clientSecret }),
  });
  // deno-lint-ignore no-explicit-any
  const brut: any = await reponse.json().catch(() => null);
  try {
    const jetons = lireJetons(brut);
    await noter(supabase, {
      par: etat.cree_par,
      action: "connexion",
      requete: { grant_type: "authorization_code" },
      reponse: { token_type: brut?.token_type, expires_in: brut?.expires_in, scope: brut?.scope ?? null },
      statut: reponse.status,
      duree: Date.now() - debut,
      compte,
    });
    const { error: errJetons } = await supabase.rpc("upwork_jetons_ecrire", {
      p_compte: compte,
      p_access: jetons.access,
      p_refresh: jetons.refresh,
      p_access_expire: jetons.expireAt,
      p_par: etat.cree_par,
    });
    if (errJetons) throw errJetons;
    await diagnostic(supabase, etat.cree_par, jetons.scope, compte);
    return versReglages("ok", undefined, compte);
  } catch (e) {
    const message = messageErreur(e);
    await noter(supabase, {
      par: etat.cree_par,
      action: "connexion",
      requete: { grant_type: "authorization_code" },
      reponse: { error: brut?.error ?? null, error_description: brut?.error_description ?? null },
      erreur: message,
      statut: reponse.status,
      duree: Date.now() - debut,
      compte,
    });
    return versReglages("erreur", message, compte);
  }
}

/** Un jeton d'accès valide : renouvelé s'il expire dans moins de 2 h. */
async function jetonValide(supabase: Supabase, par: string | null, compte: string = COMPTE): Promise<string> {
  const { data, error } = await supabase.rpc("upwork_jetons_lire", { p_compte: compte });
  if (error) throw error;
  const j = (data ?? [])[0] as { access_token: string | null; refresh_token: string | null; access_expire_at: string | null } | undefined;
  if (!j?.access_token) {
    throw new Error(compte === COMPTE ? "Upwork n'est pas connecté : Réglages → Upwork → Connecter" : `le compte Upwork « ${compte} » n'est pas connecté`);
  }
  if (!aRenouveler(j.access_expire_at)) return j.access_token;
  if (!j.refresh_token) throw new Error("jeton expiré et pas de jeton de renouvellement : reconnecter Upwork");

  const { clientId, clientSecret } = identifiants();
  const debut = Date.now();
  const reponse = await fetch(UPWORK_JETON, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: corpsJeton({ type: "refresh", refreshToken: j.refresh_token, clientId, clientSecret }),
  });
  // deno-lint-ignore no-explicit-any
  const brut: any = await reponse.json().catch(() => null);
  let jetons;
  try {
    jetons = lireJetons(brut);
  } catch (e) {
    await noter(supabase, {
      par,
      action: "renouvellement",
      reponse: { error: brut?.error ?? null, error_description: brut?.error_description ?? null },
      erreur: messageErreur(e),
      statut: reponse.status,
      duree: Date.now() - debut,
      compte,
    });
    throw e;
  }
  await noter(supabase, {
    par,
    action: "renouvellement",
    reponse: { expires_in: brut?.expires_in, scope: brut?.scope ?? null },
    statut: reponse.status,
    duree: Date.now() - debut,
    compte,
  });
  const { error: errJetons } = await supabase.rpc("upwork_jetons_ecrire", {
    p_compte: compte,
    p_access: jetons.access,
    p_refresh: jetons.refresh,
    p_access_expire: jetons.expireAt,
    p_par: null,
  });
  if (errJetons) throw errJetons;
  return jetons.access;
}

/**
 * Une LECTURE GraphQL (retry 1 s, 2 s, 4 s sur réseau, 429 et 5xx). Les
 * écritures (points 3 à 5) auront leur propre fonction, sans aucun retry.
 */
async function lire(
  supabase: Supabase,
  o: { par: string | null; action: string; query: string; variables?: Record<string, unknown>; tenant?: string | null; compte?: string },
  // deno-lint-ignore no-explicit-any
): Promise<{ data: any; erreur: string | null; statut: number | null }> {
  const jeton = await jetonValide(supabase, o.par, o.compte);
  const debut = Date.now();
  let vu429 = false;
  // deno-lint-ignore no-explicit-any
  const r = await avecRetry<any>(async () => {
    try {
      const reponse = await fetch(UPWORK_GRAPHQL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${jeton}`,
          "content-type": "application/json",
          ...(o.tenant ? { "X-Upwork-API-TenantId": o.tenant } : {}),
        },
        body: JSON.stringify({ query: o.query, variables: o.variables ?? {} }),
      });
      if (reponse.status === 429) vu429 = true;
      return { statut: reponse.status, valeur: await reponse.json().catch(() => null), retryAfter: reponse.headers.get("retry-after") };
    } catch (e) {
      return { statut: null, valeur: { errors: [{ message: messageErreur(e) }] } };
    }
  });
  // Prompt 21 : un 429 double l'intervalle des passages pour la journée (Needs you le signale).
  if (vu429) await noter429(supabase, null);
  const erreur = r.statut !== null && r.statut >= 400
    ? `HTTP ${r.statut}${erreurGraphql(r.valeur) ? ` : ${erreurGraphql(r.valeur)}` : ""}`
    : erreurGraphql(r.valeur);
  await noter(supabase, {
    par: o.par,
    action: o.action,
    requete: { query: o.query.slice(0, 2000), variables: o.variables ?? {}, tenant: o.tenant ?? null, essais: r.essais },
    reponse: o.action === "schema" ? { lu: Boolean(r.valeur?.data) } : r.valeur,
    erreur,
    statut: r.statut,
    duree: Date.now() - debut,
    compte: o.compte,
  });
  return { data: r.valeur?.data ?? null, erreur, statut: r.statut };
}

// ---------------------------------------------------------------------------
// Diagnostic : schéma, organisations, ce que la clé permet de lire
// ---------------------------------------------------------------------------

async function diagnostic(supabase: Supabase, par: string | null, scope: string | null = null, compte: string = COMPTE) {
  // 1. Le schéma : les noms exacts de l'API, rangés pour être vérifiés avant usage.
  const schema = await lire(supabase, { par, action: "schema", query: INTROSPECTION, compte });
  let racines: { requetes: string[]; mutations: string[] } | null = null;
  if (schema.data?.__schema) {
    await supabase.from("upwork_schema").insert({ schema: schema.data });
    racines = racinesSchema(schema.data);
  }

  // 2. Les organisations visibles par la connexion (companySelector, cité par la doc Upwork).
  const orgs = racines?.requetes.includes("companySelector") || !racines
    ? await lire(supabase, {
      par,
      action: "organisations",
      query: "query Organisations { companySelector { items { title organizationId } } }",
      compte,
    })
    : { data: null, erreur: "companySelector absent du schéma", statut: null };
  // Prompt 25 v4 : qui a autorisé (l'id sert à ajouter Adrien à une conversation).
  const moi = await lire(supabase, { par, action: "utilisateur", query: "query Moi { user { id nid name } }", compte });

  const droits = {
    lu_at: new Date().toISOString(),
    scope_jeton: scope,
    schema_lu: Boolean(racines),
    schema_erreur: schema.erreur,
    requetes: racines?.requetes ?? [],
    mutations: racines?.mutations ?? [],
    organisations_erreur: orgs.erreur,
  };
  await supabase.from("upwork_connexion").update({
    organisations: orgs.data?.companySelector?.items ?? null,
    droits,
    ...(moi.data?.user?.id ? { utilisateur: moi.data.user } : {}),
    statut: schema.erreur && orgs.erreur ? "erreur" : "connecte",
    derniere_erreur: schema.erreur && orgs.erreur ? `${schema.erreur} · ${orgs.erreur}` : null,
  }).eq("compte", compte);
  return { ok: true, compte, utilisateur: moi.data?.user ?? null, organisations: orgs.data?.companySelector?.items ?? null, droits };
}

// ---------------------------------------------------------------------------
// Point 2a : les contrats actifs (lecture seule)
// ---------------------------------------------------------------------------

interface Organisation {
  title: string;
  organizationId: string;
}

/** Les organisations lues par l'OS : VIk Studios (et Micabo en attendant). Calyra et Louis Kender : jamais. */
async function organisations(supabase: Supabase): Promise<Organisation[]> {
  const { data } = await supabase.from("upwork_connexion").select("organisations").eq("compte", COMPTE).maybeSingle();
  return ((data?.organisations ?? []) as Organisation[]).filter((o) => o?.organizationId && orgDeLOs(o.organizationId));
}

async function lireContrats(supabase: Supabase, par: string | null) {
  const orgs = await organisations(supabase);
  if (orgs.length === 0) throw new Error("aucune organisation connue : relire les droits dans Réglages → Upwork");
  const debut = new Date().toISOString();
  const fermes: { contrat: string; tenant: string }[] = [];
  const bilan: Record<string, { total: number | null; lus: number; erreur: string | null }> = {};
  for (const org of orgs) {
    let apres: string | null = null;
    let total: number | null = null;
    let lus = 0;
    let erreur: string | null = null;
    // 50 par page (le plus qu'Upwork rend), 40 pages au plus (2 000 contrats) :
    // pas de lecture sans fin. Le pays ne vient plus du freelance mais de l'annonce.
    for (let page = 0; page < 40; page++) {
      const r = await lire(supabase, {
        par,
        action: "contrats",
        query: requeteContrats(),
        variables: { pagination: { first: TAILLE_PAGE_OFFRES, ...(apres ? { after: apres } : {}) } },
        tenant: org.organizationId,
      });
      const offres = r.data?.organization?.clientOffers;
      if (!offres) {
        erreur = r.erreur ?? "réponse sans clientOffers";
        break;
      }
      total = offres.totalCount ?? total;
      // deno-lint-ignore no-explicit-any
      const lignes = (offres.edges ?? []).map((e: any) => ({
        // 0470 : le pays du freelance vient de lireLocalisation ; la relecture ne l'efface pas.
        ...sansPaysVide(lireContrat(e?.node)),
        organisation_id: org.organizationId,
        organisation_nom: org.title?.trim() ?? null,
        actif: true,
        lu_at: new Date().toISOString(),
        brut: e?.node ?? null,
      })).filter((l: { offre_id: string }) => l.offre_id);
      // Deux envois aux colonnes identiques : un lot mêlé remettrait à null le pays des lignes qui ne l'ont pas.
      for (const lot of [lignes.filter((l: object) => "freelancer_pays" in l), lignes.filter((l: object) => !("freelancer_pays" in l))]) {
        if (lot.length === 0) continue;
        const { error } = await supabase.from("upwork_contrats").upsert(lot, { onConflict: "offre_id" });
        if (error) throw error;
      }
      lus += lignes.length;
      apres = curseurSuivant(offres);
      if (!apres) break;
    }
    // Un contrat de cette organisation qui n'est plus rendu actif n'est plus actif,
    // seulement si toute la liste a été lue (sinon on désactiverait des contrats actifs).
    if (!erreur && (total === null || lus >= total)) {
      const { data: partis } = await supabase.from("upwork_contrats").update({ actif: false })
        .eq("organisation_id", org.organizationId).eq("actif", true).lt("lu_at", debut)
        .select("contrat_id");
      for (const c of partis ?? []) if (c.contrat_id) fermes.push({ contrat: String(c.contrat_id), tenant: org.organizationId });
    }
    bilan[org.title?.trim() ?? org.organizationId] = { total, lus, erreur };
  }
  const desactives = await contratsFermes(supabase, par, fermes);
  return { ok: true, organisations: bilan, ...(desactives ? { desactives } : {}) };
}

/**
 * Toutes les offres envoyées (tous états : en attente, acceptée, refusée,
 * retirée…), lecture seule, dans `upwork_offres` : la carte Needs you « No
 * channel to reach them » y cherche l'offre faite à un posteur sans contrat.
 */
const REQUETE_OFFRES = `query Offres($pagination: Pagination!) {
  organization {
    clientOffers(offerByClientFilter: {}, pagination: $pagination) {
      totalCount
      edges { cursor node { id title state startDateTime freelancer { id name } contractDetails { id status } } }
      pageInfo { endCursor hasNextPage }
    }
  }
}`;

async function lireOffres(supabase: Supabase, par: string | null) {
  const orgs = await organisations(supabase);
  const bilan: Record<string, { lus: number; erreur: string | null }> = {};
  for (const org of orgs) {
    let apres: string | null = null;
    let lus = 0;
    let erreur: string | null = null;
    for (let page = 0; page < 40; page++) {
      const r = await lire(supabase, {
        par, action: "offres", query: REQUETE_OFFRES,
        variables: { pagination: { first: TAILLE_PAGE_OFFRES, ...(apres ? { after: apres } : {}) } }, tenant: org.organizationId,
      });
      const offres = r.data?.organization?.clientOffers;
      if (!offres) {
        erreur = r.erreur ?? "réponse sans clientOffers";
        break;
      }
      // deno-lint-ignore no-explicit-any
      const lignes = (offres.edges ?? []).map((e: any) => e?.node).filter((n: any) => n?.id).map((n: any) => ({
        offre_id: String(n.id), organisation_id: org.organizationId, titre: n.title ?? null, etat: n.state ?? null,
        debut_at: n.startDateTime ?? null, freelancer_nom: n.freelancer?.name ?? null,
        contrat_id: n.contractDetails?.id ? String(n.contractDetails.id) : null, contrat_statut: n.contractDetails?.status ?? null,
        lu_at: new Date().toISOString(),
      }));
      if (lignes.length) {
        const { error } = await supabase.from("upwork_offres").upsert(lignes, { onConflict: "offre_id" });
        if (error) throw error;
      }
      lus += lignes.length;
      apres = curseurSuivant(offres);
      if (!apres) break;
    }
    bilan[org.title?.trim() ?? org.organizationId] = { lus, erreur };
  }
  const termines = await terminesDepuisOffres(supabase, par).catch((e) => [`erreur : ${messageErreur(e)}`]);
  return { ok: Object.values(bilan).every((b) => !b.erreur), organisations: bilan, termines };
}

/** Au-delà, une lecture qui fait tomber trop de contrats d'un coup est suspecte : rien n'est désactivé, Max est prévenu. */
const MAX_FERMES_PAR_LECTURE = 10;

/**
 * Décisions finales : un contrat qui vient de quitter la liste des contrats
 * actifs (lecture complète) et que l'OS n'a pas fermé (son posteur est encore
 * actif) a été fermé par le freelance : le posteur et ses comptes sont
 * seulement désactivés (`contrats_termines_desactiver`, 0443). Ni message, ni
 * Slack, ni Upwork.
 */
async function contratsFermes(supabase: Supabase, par: string | null, fermes: { contrat: string; tenant: string }[]): Promise<string[] | null> {
  if (fermes.length === 0) return null;
  if (fermes.length > MAX_FERMES_PAR_LECTURE) {
    await dmMax(`:warning: ${fermes.length} contrats ne sont plus actifs d'un coup chez Upwork : personne n'a été désactivé, à vérifier (Contracts).`);
    return null;
  }
  // Seulement les contrats que l'OS relie à un posteur encore actif, et vraiment fermés
  // chez Upwork (relus un par un : en pause, illisible ou encore actif → rien).
  const { data: relies } = await supabase.from("profiles").select("upwork_contract_id").eq("is_active", true)
    .in("upwork_contract_id", fermes.map((f) => f.contrat));
  const actifs = new Set((relies ?? []).map((p) => String(p.upwork_contract_id)));
  const faits: string[] = [];
  for (const f of fermes.filter((x) => actifs.has(x.contrat))) {
    const r = await arreterContratTermine(supabase, par, f.contrat, f.tenant);
    if (r) faits.push(r);
  }
  return faits.length ? faits : null;
}

/**
 * 31/10 : un contrat VIk Studios terminé (Ended) chez Upwork, par le freelance
 * ou par nous hors de l'OS : relu (statut, date, qui), puis
 * `contrat_termine_arreter` (0472) : posteur et comptes désactivés, sortis de la
 * masterlist, de Needs you, de la paie, de « To fund by hand » et des relances,
 * ligne « To remove from Slack », trace « Contract ended by freelancer on … ».
 * Aucun message.
 */
async function arreterContratTermine(supabase: Supabase, par: string | null, contrat: string, tenant: string | null): Promise<string | null> {
  const lu = await lire(supabase, { par, action: "contrat_fin", query: REQUETE_FIN_CONTRAT, variables: { id: contrat }, tenant });
  const c = lu.data?.contractDetails;
  if (lu.erreur || !contratFerme(String(c?.status ?? "").toUpperCase())) return null;
  const fin = lireFinContrat(c);
  const { data, error } = await supabase.rpc("contrat_termine_arreter", { p_contrat: contrat, p_fin: fin.fin, p_par: fin.par });
  if (error) {
    console.error("[upwork] contrat terminé", contrat, error.message);
    return null;
  }
  const d = ((data ?? []) as { nom: string | null }[])[0];
  return d ? `${d.nom ?? "?"} (${contrat}, ${fin.par === "freelance" ? "par le freelance" : "par nous"}${fin.fin ? `, ${fin.fin}` : ""})` : null;
}

/**
 * 31/10 : les offres terminées (Ended) de VIk Studios dont le contrat est
 * encore relié à un posteur actif (un contrat qui n'a jamais été dans la liste
 * des contrats actifs n'en sort pas) : même traitement.
 */
async function terminesDepuisOffres(supabase: Supabase, par: string | null): Promise<string[]> {
  const { data: offres } = await supabase.from("upwork_offres").select("contrat_id, organisation_id")
    .in("organisation_id", [...ORGS_OS]).not("contrat_id", "is", null)
    .or("etat.eq.Ended,contrat_statut.eq.CLOSED,contrat_statut.eq.ENDED");
  const tenantDe = new Map((offres ?? []).map((o) => [String(o.contrat_id), String(o.organisation_id)]));
  if (tenantDe.size === 0) return [];
  const { data: relies } = await supabase.from("profiles").select("upwork_contract_id").eq("is_active", true)
    .in("upwork_contract_id", [...tenantDe.keys()]);
  const faits: string[] = [];
  for (const p of (relies ?? []).slice(0, MAX_FERMES_PAR_LECTURE)) {
    const contrat = String(p.upwork_contract_id);
    // Encore dans la liste des contrats actifs : pas terminé (une autre offre du même contrat).
    const { data: actif } = await supabase.from("upwork_contrats").select("contrat_id").eq("contrat_id", contrat).eq("actif", true).limit(1);
    if (actif?.length) continue;
    const r = await arreterContratTermine(supabase, par, contrat, tenantDe.get(contrat) ?? null);
    if (r) faits.push(r);
  }
  return faits;
}

// ---------------------------------------------------------------------------
// F1 (28 oct.) : la milestone à approuver de chaque contrat relié
// ---------------------------------------------------------------------------

async function lireJalons(supabase: Supabase, par: string | null) {
  // Les contrats actifs lus (action « contrats ») et reliés à un posteur actif.
  const [{ data: contrats, error: e1 }, { data: posteurs, error: e2 }] = await Promise.all([
    supabase.from("upwork_contrats").select("contrat_id, organisation_id").eq("actif", true).not("contrat_id", "is", null),
    supabase.from("profiles").select("id, upwork_contract_id").eq("is_active", true).not("upwork_contract_id", "is", null),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const relies = new Set((posteurs ?? []).map((p) => String(p.upwork_contract_id)));
  // Les comptes perso actifs de chaque contrat : une milestone sans nombre dans son nom les couvre tous.
  const contratDe = new Map((posteurs ?? []).map((p) => [String(p.id), String(p.upwork_contract_id)]));
  const comptesActifs = new Map<string, number>();
  const ids = [...contratDe.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const { data: comptes, error: e3 } = await supabase.from("comptes").select("poster_id")
      .eq("is_active", true).eq("type_compte", "perso").in("poster_id", ids.slice(i, i + 200));
    if (e3) throw e3;
    for (const c of comptes ?? []) {
      const k = contratDe.get(String(c.poster_id));
      if (k) comptesActifs.set(k, (comptesActifs.get(k) ?? 0) + 1);
    }
  }
  const aLire = (contrats ?? []).filter((c) => relies.has(String(c.contrat_id)));
  if (aLire.length === 0) return { ok: false, error: "aucun contrat actif relié : lancer d'abord l'action contrats" };

  // Le jeton renouvelé une seule fois avant les appels en parallèle.
  await jetonValide(supabase, par);
  let lus = 0;
  let erreurs = 0;
  const bilanTarifs = { hebdo: 0, legacy: 0, a_verifier: 0 };
  // 5 à la fois : ~270 contrats en moins d'une minute.
  for (let i = 0; i < aLire.length; i += 5) {
    const lot = aLire.slice(i, i + 5);
    const lignes = await Promise.all(lot.map(async (c) => {
      const r = await lire(supabase, {
        par, action: "jalons", query: REQUETE_JALONS, variables: { id: c.contrat_id }, tenant: c.organisation_id,
      });
      const jalon = jalonAApprouver(r.data?.contractDetails);
      const tous = r.data?.contractDetails ? lireJalonsContrat(r.data.contractDetails) : null;
      return {
        contrat_id: String(c.contrat_id),
        organisation_id: c.organisation_id,
        ...jalon,
        // Prompt 21, S (0415) : toutes les milestones, pour en déduire le tarif du contrat.
        jalons: tous,
        erreur: r.data?.contractDetails ? null : (r.erreur ?? "réponse sans contractDetails"),
        lu_at: new Date().toISOString(),
      };
    }));
    const { error } = await supabase.from("upwork_jalons").upsert(lignes, { onConflict: "contrat_id" });
    if (error) throw error;
    // Le tarif et le rythme de chaque contrat lu (jamais sur une lecture ratée).
    const tarifs = lignes.filter((l) => !l.erreur && l.jalons).map((l) => {
      const t = deduireTarif(l.jalons!, comptesActifs.get(l.contrat_id) ?? 1);
      return {
        contrat_id: l.contrat_id, rythme: t.rythme, montant: t.montant, comptes: t.comptes, tarif_compte: t.tarif_compte,
        periode_jours: t.periode_jours, courant: t.courant, raison: t.raison, lu_at: new Date().toISOString(),
      };
    });
    if (tarifs.length) {
      const { error: errT } = await supabase.from("contrats_tarifs").upsert(tarifs, { onConflict: "contrat_id" });
      if (errT) throw errT;
      bilanTarifs.hebdo += tarifs.filter((t) => t.rythme === "hebdo").length;
      bilanTarifs.legacy += tarifs.filter((t) => t.rythme === "legacy").length;
      bilanTarifs.a_verifier += tarifs.filter((t) => t.rythme === "a_verifier").length;
    }
    lus += lignes.filter((l) => !l.erreur).length;
    erreurs += lignes.filter((l) => l.erreur).length;
  }
  // Prompt 21, S2 : le contrat gagne. tarif_hebdo corrigé, noté dans le Pipeline (Logs).
  const corriges = await corrigerTarifsHebdo(supabase).catch((e) => ({ erreur: messageErreur(e), corriges: 0 }));
  return { ok: true, contrats: aLire.length, lus, erreurs, tarifs: bilanTarifs, ...("erreur" in corriges ? { erreur_tarifs: corriges.erreur } : { corriges: corriges.corriges }) };
}

/**
 * Prompt 21, S2 (0415) : chaque posteur payé au tarif de SON contrat. Pour un
 * contrat hebdo, tarif_hebdo prend le tarif par compte du contrat (fixé à la
 * main s'il l'a été) ; chaque correction est notée (recrue_evenements,
 * « tarif_corrige »). Legacy et à vérifier : rien n'est touché.
 */
async function corrigerTarifsHebdo(supabase: Supabase): Promise<{ corriges: number }> {
  const { data: tarifs, error } = await supabase.from("contrats_tarifs").select("contrat_id, rythme, tarif_compte, force_tarif");
  if (error) throw error;
  const voulu = new Map<string, number>();
  for (const t of tarifs ?? []) {
    const v = t.force_tarif !== null ? Number(t.force_tarif) : t.rythme === "hebdo" && t.tarif_compte !== null ? Number(t.tarif_compte) : null;
    if (v !== null && Number.isFinite(v)) voulu.set(String(t.contrat_id), v);
  }
  if (voulu.size === 0) return { corriges: 0 };
  const { data: profils, error: errP } = await supabase.from("profiles").select("id, upwork_contract_id, tarif_hebdo")
    .eq("is_active", true).in("upwork_contract_id", [...voulu.keys()]);
  if (errP) throw errP;
  let corriges = 0;
  for (const p of profils ?? []) {
    const v = voulu.get(String(p.upwork_contract_id));
    if (v === undefined || (p.tarif_hebdo !== null && Math.abs(Number(p.tarif_hebdo) - v) < 0.005)) continue;
    const { error: errU } = await supabase.from("profiles").update({ tarif_hebdo: v }).eq("id", p.id);
    if (errU) continue;
    corriges++;
    await supabase.from("recrue_evenements").upsert({
      poster_id: p.id, type: "tarif_corrige", at: new Date().toISOString(),
      detail: `tarif_hebdo ${p.tarif_hebdo ?? "vide"} → ${v} $ (contrat ${p.upwork_contract_id})`,
      cle: `tarif_corrige:${p.tarif_hebdo ?? "vide"}:${v}`,
    }, { onConflict: "poster_id,type,cle", ignoreDuplicates: true });
  }
  return { corriges };
}

// ---------------------------------------------------------------------------
// Prompt 14, point 3 : payer depuis la liste de paie
// ---------------------------------------------------------------------------

interface LignePlan {
  ligne: LigneAuto;
  tenant: string | null;
  jalons: JalonUpwork[];
  plan: PlanPaiement;
  /** Le mode (off / test / on) bloque l'envoi : l'aperçu montre quand même le plan. */
  bloque: string | null;
}

/** Aujourd'hui à Paris (AAAA-MM-JJ). */
function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

async function reglagesPaieApi(supabase: Supabase) {
  const { data, error } = await supabase
    .from("reglages")
    .select("cle, valeur")
    .in("cle", ["paie_api", "paie_plafond_ligne", "paie_plafond_jour"]);
  if (error) throw error;
  const r = lireReglagesPaieApi(Object.fromEntries((data ?? []).map((x) => [x.cle as string, x.valeur])));
  // Prompt 26 : les contrats de la liste « Test contracts » (0440) sont des contrats de test pour la paie aussi.
  const { data: tests } = await supabase.from("contrats_test").select("contrat_id").is("retire_at", null);
  return { ...r, contrats_test: [...new Set([...r.contrats_test, ...(tests ?? []).map((t) => String(t.contrat_id))])] };
}

/** Des réglages simples (nombre ou texte), lus en une fois. */
async function reglagesValeurs(supabase: Supabase, cles: string[]): Promise<Record<string, unknown>> {
  const { data } = await supabase.from("reglages").select("cle, valeur").in("cle", cles);
  return Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
}

const texteReglage = (v: unknown, defaut: string) => (typeof v === "string" && v.trim() ? v.trim() : defaut);

/**
 * Toute la liste de la semaine, fusionnée par contrat (prompt 21, B8), avec
 * l'organisation Upwork de chaque contrat.
 */
async function chargerLignes(
  supabase: Supabase,
  semaine: string,
  o: { simulation?: boolean } = {},
): Promise<{ lignes: LigneAuto[]; tenantDe: Map<string, string | null>; raisonDe: Map<string, string | null>; comptesDe: Map<string, number> }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semaine)) throw new Error("semaine invalide");
  const { data: liste, error } = await supabase.rpc("paie_liste_v2", { p_lundi: semaine, p_simulation: o.simulation === true });
  if (error) throw error;
  // Prompt 26 : en simulation, les lignes ne sont pas encore écrites ; le posteur sert d'identifiant.
  // deno-lint-ignore no-explicit-any
  const brutes = ((liste ?? []) as any[]).map((l) => (o.simulation ? { ...l, id: l.id ?? l.poster_id } : l)).filter((l) => l.id);
  const raisonDe = new Map(brutes.map((b) => [String(b.id), (b.raison as string | null) ?? null]));
  // Les comptes actifs de chaque ligne (Double en warm-up compris) : l'écart avec la milestone financée.
  const comptesDe = new Map(brutes.map((b) => [String(b.id), Array.isArray(b.detail_comptes) ? b.detail_comptes.length : Number(b.nb_comptes ?? 1)]));
  const posteurs = brutes.map((l) => l.poster_id);
  const [{ data: profils }, { data: paysComptes }] = posteurs.length
    ? await Promise.all([
      supabase.from("profiles").select("id, upwork_contract_id").in("id", posteurs),
      supabase.from("comptes").select("poster_id, pays").in("poster_id", posteurs),
    ])
    : [{ data: [] }, { data: [] }];
  const contratDe = new Map((profils ?? []).map((p) => [p.id as string, (p.upwork_contract_id as string | null) ?? null]));
  const paysDe = new Map<string, (string | null)[]>();
  for (const c of paysComptes ?? []) paysDe.set(String(c.poster_id), [...(paysDe.get(String(c.poster_id)) ?? []), (c.pays as string | null) ?? null]);
  const contrats = [...new Set([...contratDe.values()].filter(Boolean))] as string[];
  const { data: orgs } = contrats.length
    ? await supabase.from("upwork_contrats").select("contrat_id, organisation_id").in("contrat_id", contrats)
    : { data: [] };
  const tenantDe = new Map((orgs ?? []).map((o) => [String(o.contrat_id), (o.organisation_id as string | null) ?? null]));
  const lignes = fusionnerParContrat(brutes.map((brute) => ({
    id: brute.id, poster_id: brute.poster_id, poster_nom: brute.poster_nom, action: brute.action,
    faits: Number(brute.faits ?? 0), tarif: brute.tarif === null ? null : Number(brute.tarif),
    montant: Number(brute.montant ?? 0), montant_calcule: Number(brute.montant_calcule ?? 0),
    retenue: Number(brute.retenue ?? 0), raison_correction: brute.raison_correction ?? null,
    exclu: Boolean(brute.exclu), paye_at: brute.paye_at ?? null, semaine_suivante_faite_at: brute.semaine_suivante_faite_at ?? null,
    suivante_action: brute.suivante_action ?? null,
    suivante_comptes: brute.suivante_comptes === null ? null : Number(brute.suivante_comptes),
    suivante_montant: brute.suivante_montant === null ? null : Number(brute.suivante_montant),
    contrat_id: contratDe.get(brute.poster_id) ?? null,
    hors_upwork: estHorsUpwork(contratDe.get(brute.poster_id) ?? null, paysDe.get(brute.poster_id) ?? []),
    nb_comptes: Number(brute.nb_comptes ?? 1),
    // deno-lint-ignore no-explicit-any
    moins6: (Array.isArray(brute.detail_comptes) ? brute.detail_comptes : []).filter((d: any) => d?.moins6 === true).length,
    // deno-lint-ignore no-explicit-any
    douteux: (Array.isArray(brute.detail_comptes) ? brute.detail_comptes : []).reduce((n: number, d: any) => n + Number(d?.douteux ?? 0), 0),
  })));
  return { lignes, tenantDe, raisonDe, comptesDe };
}

/** Le plan d'une ligne : ses milestones lues chez Upwork (seulement si elle paie). */
async function planLigne(
  supabase: Supabase,
  par: string | null,
  semaine: string,
  ligne: LigneAuto,
  tenant: string | null,
  r: ReglagesPaieApi,
): Promise<LignePlan> {
  if (ligne.refus) return { ligne, tenant, jalons: [], plan: { ...planPaiement(ligne, [], semaine, r), statut: "refuse", raison: ligne.refus }, bloque: null };
  const aLire = (ACTIONS_PAYEES.includes(ligne.action) || aRenommer(ligne)) && ligne.contrat_id && !ligne.paye_at && !ligne.exclu;
  if (!aLire) return { ligne, tenant, jalons: [], plan: planPaiement(ligne, [], semaine, r), bloque: null };
  if (!tenant) {
    return {
      ligne, tenant, jalons: [],
      plan: { ...planPaiement(ligne, [], semaine, r), statut: "refuse", raison: "contrat absent des contrats actifs lus (Réglages → Upwork → Lire les contrats)" },
      bloque: null,
    };
  }
  const lu = await lire(supabase, { par, action: "paie_jalons", query: REQUETE_JALONS, variables: { id: ligne.contrat_id }, tenant });
  if (!lu.data?.contractDetails) {
    return {
      ligne, tenant, jalons: [],
      plan: { ...planPaiement(ligne, [], semaine, r), statut: "refuse", raison: `milestones illisibles : ${lu.erreur ?? "réponse vide"}` },
      bloque: null,
    };
  }
  const jalons = lireJalonsContrat(lu.data.contractDetails);
  const plan = planPaiement(ligne, jalons, semaine, r);
  // Le mode (off / test / on) ne bloque que ce qui partirait vraiment.
  const bloque = ["pret", "deja_payee", "renommer"].includes(plan.statut) ? refusMode(r, ligne.contrat_id!, aujourdhuiParis()) : null;
  return { ligne, tenant, jalons, plan, bloque };
}

/** Les lignes demandées (avec celles du même contrat, B8), leurs milestones et le plan de chacune. */
async function planifier(supabase: Supabase, par: string | null, semaine: string, ids: unknown): Promise<LignePlan[]> {
  const voulues = new Set(Array.isArray(ids) ? ids.map(String) : []);
  if (voulues.size === 0) throw new Error("aucune ligne choisie");
  if (voulues.size > 400) throw new Error("trop de lignes d'un coup");
  // Prompt 26 : un clic (aperçu, « Pay this week » en mode Test) n'attend pas la date d'ouverture du test.
  const r0 = await reglagesPaieApi(supabase);
  const r = r0.mode === "test" ? { ...r0, test_des: "2000-01-01" } : r0;
  const { lignes, tenantDe } = await chargerLignes(supabase, semaine);
  const choisies = lignes.filter((l) => l.ids.some((id) => voulues.has(id)));
  await jetonValide(supabase, par);
  const resultat: LignePlan[] = [];
  // Lectures 5 à la fois ; seules les lignes à approuver lisent Upwork.
  for (let i = 0; i < choisies.length; i += 5) {
    const lot = choisies.slice(i, i + 5);
    resultat.push(...await Promise.all(lot.map((l) => planLigne(supabase, par, semaine, l, l.contrat_id ? (tenantDe.get(l.contrat_id) ?? null) : null, r))));
  }
  return resultat;
}

function resume(p: LignePlan) {
  return {
    id: p.ligne.id,
    ids: p.ligne.ids,
    poster_id: p.ligne.poster_id,
    poster_nom: p.ligne.poster_nom,
    action: p.ligne.action,
    contrat_id: p.ligne.contrat_id,
    ...p.plan,
    bloque: p.bloque,
  };
}

async function paieApercu(supabase: Supabase, par: string | null, semaine: string, ids: unknown) {
  const plans = await planifier(supabase, par, semaine, ids);
  const r = await reglagesPaieApi(supabase);
  return {
    ok: true,
    mode: r.mode,
    plafond_ligne: r.plafond_ligne,
    plafond_jour: r.plafond_jour,
    lignes: plans.map(resume),
    total: Math.round(plans.filter((p) => p.plan.statut === "pret" && !p.bloque).reduce((s, p) => s + p.plan.total, 0) * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Prompt 26 : la simulation d'une paie (rien n'est payé), « Pay this week »
// sur un contrat de test, et le renommage d'une milestone (0 post, gardé).
// ---------------------------------------------------------------------------

/** Le lundi de la semaine qui sera payée au prochain lundi de paie (Paris). */
function prochaineSemaineAPayer(d = new Date()): string {
  const p = maintenantParis(d);
  return p.isoJour === 1 ? ajouterJours(p.jour, -7) : ajouterJours(p.jour, -(p.isoJour - 1));
}

type CategorieSimulation =
  | "payer" | "double" | "rien" | "pause" | "legacy" | "a_la_main" | "kill" | "kill_sans_paie" | "annuler" | "warmup" | "renommer" | "hors_upwork";

function categorieSimulation(l: LigneAuto, plan: PlanPaiement, raison: string | null): CategorieSimulation {
  // Pas de contrat Upwork, comptes en France : montré à part, jamais dans Needs you.
  if (l.hors_upwork) return "hors_upwork";
  if (l.refus || l.action === "a_verifier" || plan.statut === "refuse") return "a_la_main";
  if (l.action === "legacy") return "legacy";
  if (l.action === "kill") return "kill";
  if (l.action === "kill_sans_paie") return "kill_sans_paie";
  if (l.action === "annuler") return "annuler";
  if (l.action === "rien") return plan.statut === "renommer" ? "renommer" : l.faits === 0 && /warm-up/i.test(raison ?? "") ? "warmup" : "rien";
  if (/pause/i.test(raison ?? "")) return "pause";
  if (l.nb_comptes >= 2 || l.suivante_action === "financer_double") return "double";
  return "payer";
}

/**
 * La paie d'une semaine, simulée : chaque ligne passe par le même plan que la
 * paie du lundi, avec les milestones lues par l'OS (Sunday 20 h, Monday 4 h 30).
 * Rien n'est payé, financé ni écrit chez Upwork. Le résultat est gardé.
 */
async function paieSimulation(supabase: Supabase, par: string | null, semaineDemandee: string | null) {
  const semaine = semaineDemandee && /^\d{4}-\d{2}-\d{2}$/.test(semaineDemandee) ? semaineDemandee : prochaineSemaineAPayer();
  const r = await reglagesPaieApi(supabase);
  const { lignes, raisonDe, comptesDe } = await chargerLignes(supabase, semaine, { simulation: true });
  const contrats = [...new Set(lignes.map((l) => l.contrat_id).filter(Boolean))] as string[];
  const jalonsDe = new Map<string, { jalons: JalonUpwork[]; lu_at: string | null }>();
  for (let i = 0; i < contrats.length; i += 200) {
    const { data } = await supabase.from("upwork_jalons").select("contrat_id, jalons, lu_at").in("contrat_id", contrats.slice(i, i + 200));
    for (const j of data ?? []) {
      jalonsDe.set(String(j.contrat_id), { jalons: Array.isArray(j.jalons) ? (j.jalons as JalonUpwork[]) : [], lu_at: (j.lu_at as string | null) ?? null });
    }
  }
  const compte: Record<CategorieSimulation, number> = {
    payer: 0, double: 0, rien: 0, pause: 0, legacy: 0, a_la_main: 0, kill: 0, kill_sans_paie: 0, annuler: 0, warmup: 0, renommer: 0,
    hors_upwork: 0,
  };
  const ecarts: Record<string, unknown>[] = [];
  let approuve = 0;
  let finance = 0;
  const needsYou: Record<string, unknown>[] = [];
  const detail: Record<string, unknown>[] = [];
  for (const l of lignes) {
    const lu = l.contrat_id ? jalonsDe.get(l.contrat_id) : undefined;
    const aLire = (ACTIONS_PAYEES.includes(l.action) || aRenommer(l)) && !l.paye_at && !l.exclu;
    let plan: PlanPaiement = l.refus ? { ...planPaiement(l, [], semaine, r), statut: "refuse", raison: l.refus } : planPaiement(l, lu?.jalons ?? [], semaine, r);
    if (!l.refus && aLire && l.contrat_id && !lu) plan = { ...plan, statut: "refuse", raison: "milestones jamais lues par l'OS (Réglages → Upwork → Lire les milestones)" };
    const cat = categorieSimulation(l, plan, raisonDe.get(l.ids[0]) ?? null);
    compte[cat]++;
    if (plan.statut === "pret") {
      approuve += (plan.approuver?.montant ?? 0) + (plan.complement?.montant ?? 0);
      finance += plan.financer?.montant ?? 0;
    }
    const ligne = {
      poster: l.poster_nom ?? l.poster_id, contrat: l.contrat_id, action: l.action, categorie: cat, faits: l.faits, montant: l.montant,
      suivante: l.suivante_action, suivante_montant: l.suivante_montant, plan: plan.statut, raison: plan.raison,
      approuver: plan.approuver ? `${plan.approuver.nom} · ${plan.approuver.montant} $` : null,
      financer: plan.financer ? `${plan.financer.nom} · ${plan.financer.montant} $ (${plan.financer.mode === "creer" ? "à créer" : "existante"})` : null,
      renommer: plan.renommer ? `${plan.renommer.de} → ${plan.renommer.vers}` : null,
      ecart_comptes: null as string | null,
    };
    // Plus de comptes actifs que la milestone financée de la semaine n'en couvre : affiché, rien n'est changé.
    const ecart = lu ? ecartComptes(l.tarif, l.ids.reduce((n, id) => n + (comptesDe.get(id) ?? 0), 0), lu.jalons, semaine) : null;
    if (ecart) {
      ligne.ecart_comptes = `${ecart.comptes_actifs} comptes actifs, ${ecart.milestone} financée pour ${ecart.comptes_finances} compte(s) (${ecart.depot} $)`;
      ecarts.push({ poster: ligne.poster, contrat: l.contrat_id, ...ecart, paye: plan.approuver?.montant ?? null, finance: plan.financer?.montant ?? null });
    }
    detail.push(ligne);
    if (cat === "a_la_main" || cat === "legacy") {
      needsYou.push({
        poster: ligne.poster, contrat: l.contrat_id,
        lien: l.contrat_id ? `https://www.upwork.com/nx/wm/workroom/${l.contrat_id}/overview` : null,
        montant: l.montant, raison: cat === "legacy" ? "contrat Legacy : payé à la fin de sa période" : (plan.raison ?? l.refus ?? "tarif du contrat à vérifier"),
      });
    }
  }
  const arrondi = (x: number) => Math.round(x * 100) / 100;
  const resultat = {
    semaine, lignes: lignes.length, par_categorie: compte,
    total: { approuve: arrondi(approuve), finance: arrondi(finance), total: arrondi(approuve + finance) },
    plafonds: { ligne: r.plafond_ligne, jour: r.plafond_jour },
    depasse_plafond_jour: approuve + finance > r.plafond_jour,
    milestones_lues_le: [...jalonsDe.values()].map((x) => x.lu_at).filter(Boolean).sort().at(-1) ?? null,
    needs_you: needsYou,
    ecarts_comptes: ecarts,
    hors_upwork: await profilsHorsUpwork(supabase),
  };
  const { data: sim } = await supabase.from("paie_simulations").insert({
    semaine, statut: "fini", lance_par: par, fini_at: new Date().toISOString(), resultat, lignes: detail,
  }).select("id").single();
  return { ok: true, id: sim?.id ?? null, ...resultat };
}

/** Les profils actifs hors Upwork (pas de contrat, comptes en France), qu'ils aient une ligne de paie ou non. */
async function profilsHorsUpwork(supabase: Supabase): Promise<string[]> {
  const { data: profils } = await supabase.from("profiles").select("id, prenom, nom").eq("is_active", true).is("upwork_contract_id", null);
  const ids = (profils ?? []).map((p) => p.id as string);
  if (!ids.length) return [];
  const { data: comptes } = await supabase.from("comptes").select("poster_id, pays").in("poster_id", ids);
  const paysDe = new Map<string, (string | null)[]>();
  for (const c of comptes ?? []) paysDe.set(String(c.poster_id), [...(paysDe.get(String(c.poster_id)) ?? []), (c.pays as string | null) ?? null]);
  return (profils ?? []).filter((p) => estHorsUpwork(null, paysDe.get(p.id as string) ?? []))
    .map((p) => [p.prenom, p.nom].filter(Boolean).join(" ").trim() || String(p.id)).sort((a, b) => a.localeCompare(b));
}

/** Le lundi de la semaine ISO `n`, la plus proche d'aujourd'hui (Paris). */
/**
 * L'échéance d'une milestone créée « Week n » : le dimanche de cette semaine.
 * Le nom du champ est lu une fois dans le schéma d'Upwork (CreateMilestoneInput),
 * jamais deviné : sans champ d'échéance, la milestone est créée sans.
 */
let champEcheance: { nom: string; dateTime: boolean } | null | undefined;
async function echeanceJalon(supabase: Supabase, par: string | null, tenant: string | null, nom: string): Promise<Record<string, string>> {
  const n = semaineDuNom(nom);
  if (n === null) return {};
  if (champEcheance === undefined) {
    const r = await lire(supabase, {
      par, action: "schema_jalon", tenant,
      query: `query { __type(name: "CreateMilestoneInput") { inputFields { name type { name kind ofType { name } } } } }`,
    });
    // deno-lint-ignore no-explicit-any
    const champs = (r.data?.__type?.inputFields ?? []) as any[];
    const f = champs.find((x) => /due/i.test(String(x?.name ?? "")));
    champEcheance = f ? { nom: String(f.name), dateTime: /time/i.test(`${f.name} ${f.type?.name ?? ""} ${f.type?.ofType?.name ?? ""}`) } : null;
  }
  if (!champEcheance) return {};
  const dimanche = ajouterJours(lundiDeSemaine(n), 6);
  return { [champEcheance.nom]: champEcheance.dateTime ? `${dimanche}T23:59:59Z` : dimanche };
}

function lundiDeSemaine(n: number, d = new Date()): string {
  const jour = maintenantParis(d).jour;
  const actuelle = semaineIsoDe(jour);
  let delta = n - actuelle;
  if (delta > 26) delta -= 52;
  if (delta < -26) delta += 52;
  const p = maintenantParis(d);
  return ajouterJours(ajouterJours(jour, -(p.isoJour - 1)), delta * 7);
}

/**
 * Prompt 26 : « Pay this week » sur un contrat de test : la milestone financée
 * est approuvée et la semaine suivante financée, au même montant, dans les
 * plafonds, par le même moteur que la paie du lundi. Seulement sur un contrat
 * de la liste « Test contracts », relié à son posteur de test.
 */
async function paieTestPayer(supabase: Supabase, par: string | null, contratId: string) {
  if (await bloquer(supabase, { fonction: "upwork", action: "paie_test_payer", cible: contratId })) return { ok: false, error: PAUSE };
  if (!contratId) return { ok: false, error: "contrat_id requis" };
  const { data: t } = await supabase.from("contrats_test").select("poster_id").eq("contrat_id", contratId).is("retire_at", null).maybeSingle();
  if (!t) return { ok: false, error: "ce contrat n'est pas dans la liste « Test contracts »" };
  if (!t.poster_id) return { ok: false, error: "créer d'abord le posteur de test de ce contrat" };
  const posterId = String(t.poster_id);
  const { data: uc } = await supabase.from("upwork_contrats").select("organisation_id").eq("contrat_id", contratId).maybeSingle();
  const tenant = (uc?.organisation_id as string | null) ?? null;
  if (!tenant) return { ok: false, error: "contrat absent des contrats lus (Réglages → Upwork → Lire les contrats)" };
  await jetonValide(supabase, par);
  const relu = await relireJalons(supabase, par, contratId, tenant, "paie_test_jalons");
  if (!relu.jalons) return { ok: false, error: `milestones illisibles : ${relu.erreur}` };
  const finances = relu.jalons.filter((j) => ETATS_FINANCES.includes(j.etat));
  if (finances.length === 0) return { ok: false, error: "aucune milestone financée sur ce contrat" };
  const a = finances[0];
  if (a.depot === null || !(a.depot > 0)) return { ok: false, error: `${a.nom || "milestone"} : montant illisible` };
  const numero = semaineDuNom(a.nom);
  const semaine = numero !== null ? lundiDeSemaine(numero) : prochaineSemaineAPayer();
  const { data: prof } = await supabase.from("profiles").select("prenom, nom").eq("id", posterId).maybeSingle();
  const nom = [prof?.prenom, prof?.nom].filter(Boolean).join(" ") || "TEST";
  const { data: ligneLue, error: errL } = await supabase.from("paie_semaines").upsert({
    poster_id: posterId, semaine, nb_comptes: 1, comptes_payes: 1, prevus: 1, faits: 1, manques: 0, tarif: a.depot, retenue: 0,
    montant: a.depot, statut: "ok", raison: "Test : Pay this week", action: "payer", calcule_at: new Date().toISOString(),
  }, { onConflict: "poster_id,semaine" }).select("id, paye_at").single();
  if (errL || !ligneLue) return { ok: false, error: errL?.message ?? "ligne de paie impossible" };
  if (ligneLue.paye_at) return { ok: false, error: `semaine du ${semaine} déjà payée` };
  const ligne: LigneAuto = {
    id: String(ligneLue.id), poster_id: posterId, poster_nom: nom, action: "payer", faits: 1, tarif: a.depot,
    montant: a.depot, montant_calcule: a.depot, retenue: 0, raison_correction: null, exclu: false, paye_at: null,
    semaine_suivante_faite_at: null, suivante_action: "financer", suivante_comptes: 1, suivante_montant: a.depot,
    contrat_id: contratId, ids: [String(ligneLue.id)], posteurs: [posterId], nb_comptes: 1, moins6: 0, douteux: 0, refus: null,
  };
  const r = await reglagesPaieApi(supabase);
  const plan = planPaiement(ligne, relu.jalons, semaine, r);
  if (plan.statut !== "pret") return { ok: false, error: plan.raison ?? plan.statut, plan };
  const issue = await executer(supabase, par, semaine, { ligne, tenant, jalons: relu.jalons, plan, bloque: null }, null);
  // Le détail de chaque étape (approuver, créer, financer…), avec la réponse d'Upwork, pour le tableau du test.
  const { data: pa } = await supabase.from("paie_paiements_api").select("etapes, erreur").eq("paie_semaine_id", ligneLue.id)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const etapes = (pa?.etapes ?? []) as { etape: string; erreur?: string | null }[];
  const scope = [pa?.erreur, ...etapes.map((e) => e.erreur)].find((x) => x && /scope|permission|not authori[sz]ed|forbidden|access denied/i.test(String(x))) ?? null;
  const apres = await relireJalons(supabase, par, contratId, tenant, "paie_test_relire");
  return {
    ok: issue.resultat === "paye", a_financer: issue.a_financer === true, semaine, resultat: issue.resultat, raison: issue.raison ?? null, plan, etapes,
    droit_manquant: scope, jalons: apres.jalons?.map((j) => ({ nom: j.nom, etat: j.etat, depot: j.depot, echeance: j.echeance ?? null })) ?? null,
  };
}

/**
 * 0467 : « Fund this milestone (test) » sur un contrat de test : la 1re milestone
 * NotFunded est financée (activateMilestone), rien d'autre. Upwork est relu tout
 * de suite puis 10 s plus tard (le financement peut être asynchrone) : OK
 * seulement si l'état relu est financé. La requête et la réponse complètes sont
 * renvoyées et gardées dans les Logs.
 */
async function paieTestFinancer(supabase: Supabase, par: string | null, contratId: string) {
  if (await bloquer(supabase, { fonction: "upwork", action: "paie_test_financer", cible: contratId })) return { ok: false, error: PAUSE };
  if (!contratId) return { ok: false, error: "contrat_id requis" };
  const { data: t } = await supabase.from("contrats_test").select("contrat_id").eq("contrat_id", contratId).is("retire_at", null).maybeSingle();
  if (!t) return { ok: false, error: "ce contrat n'est pas dans la liste « Test contracts »" };
  const { data: uc } = await supabase.from("upwork_contrats").select("organisation_id").eq("contrat_id", contratId).maybeSingle();
  const tenant = (uc?.organisation_id as string | null) ?? null;
  if (!tenant) return { ok: false, error: "contrat absent des contrats lus (Réglages → Upwork → Lire les contrats)" };
  await jetonValide(supabase, par);
  const avant = await relireJalons(supabase, par, contratId, tenant, "test_financer_jalons_avant");
  if (!avant.jalons) return { ok: false, error: `milestones illisibles : ${avant.erreur}` };
  const j = [...avant.jalons].sort((a, b) => a.sequence - b.sequence).find((x) => x.etat === "NotFunded");
  if (!j) return { ok: false, error: "aucune milestone NotFunded sur ce contrat" };
  const r = await reglagesPaieApi(supabase);
  if (j.depot === null || !(j.depot > 0)) return { ok: false, error: `${j.nom || "milestone"} : montant illisible` };
  if (j.depot > r.plafond_ligne) return { ok: false, error: `${j.depot} $ au-dessus du plafond par ligne (${r.plafond_ligne} $)` };
  const requete = { query: MUTATION_FINANCER_JALON, variables: { input: { id: j.id } } };
  const active = await ecrire(supabase, { par, action: "test_financer_jalon", ...requete, tenant, contrat: contratId, montant: j.depot });
  const lire1 = await relireJalons(supabase, par, contratId, tenant, "test_financer_relire");
  let etat = lire1.jalons?.find((x) => x.id === j.id)?.etat ?? null;
  if (!etat || !ETATS_FINANCES.includes(etat)) {
    await new Promise((ok) => setTimeout(ok, 10_000));
    const lire2 = await relireJalons(supabase, par, contratId, tenant, "test_financer_relire_10s");
    etat = lire2.jalons?.find((x) => x.id === j.id)?.etat ?? etat;
  }
  const finance = Boolean(etat && ETATS_FINANCES.includes(etat));
  return {
    ok: finance,
    jalon: { id: j.id, nom: j.nom, depot: j.depot },
    requete,
    reponse: active.data ?? null,
    erreur: active.erreur ?? (finance ? null : pasFinancee(etat)),
    etat_relu: etat,
  };
}

/** Les champs de fin de contrat qu'Upwork exige (introspection, lecture seule). */
const REQUETE_CHAMPS_FIN = `query ChampsFin {
  __type(name: "EndContractInput") { inputFields { name type { kind name ofType { kind name } } } }
}`;

/**
 * Prompt 13 : tester la fermeture d'un contrat (Overview → Test contracts), un seul essai.
 * « payer » (Test Kill & pay) : la milestone financée est approuvée, puis le contrat fermé
 * (endContractByClient) ; « sans_payer » (Test Kill & don't pay) : le contrat est fermé sans
 * rien approuver, la milestone toujours financée. Chaque réponse d'Upwork est gardée en entier
 * dans les Logs (upwork_appels) ; le contrat et ses milestones sont ensuite relus pour le bilan.
 */
async function testFermeture(supabase: Supabase, par: string | null, contratId: string, mode: "payer" | "sans_payer") {
  if (await bloquer(supabase, { fonction: "upwork", action: "test_fermeture", cible: contratId })) return { ok: false, error: PAUSE };
  if (!contratId) return { ok: false, error: "contrat_id requis" };
  const { data: t } = await supabase.from("contrats_test").select("poster_id").eq("contrat_id", contratId).is("retire_at", null).maybeSingle();
  if (!t) return { ok: false, error: "ce contrat n'est pas dans la liste « Test contracts »" };
  if (!t.poster_id) return { ok: false, error: "créer d'abord le posteur de test de ce contrat" };
  const { data: uc } = await supabase.from("upwork_contrats").select("organisation_id").eq("contrat_id", contratId).maybeSingle();
  const tenant = (uc?.organisation_id as string | null) ?? null;
  if (!tenant) return { ok: false, error: "contrat absent des contrats lus (Réglages → Upwork → Lire les contrats)" };
  await jetonValide(supabase, par);
  const avant = await relireJalons(supabase, par, contratId, tenant, "test_fermeture_jalons_avant");
  if (!avant.jalons) return { ok: false, error: `milestones illisibles : ${avant.erreur}` };
  const finances = avant.jalons.filter((j) => ETATS_FINANCES.includes(j.etat));
  const etapes: Record<string, unknown>[] = [];
  let erreur: string | null = null;
  if (mode === "payer") {
    const a = finances[0];
    if (!a) return { ok: false, error: "aucune milestone financée sur ce contrat" };
    if (a.depot === null || !(a.depot > 0)) return { ok: false, error: `${a.nom || "milestone"} : montant illisible` };
    const ap = await ecrire(supabase, {
      par, action: "test_fermeture_approuver", query: MUTATION_APPROUVER, tenant, contrat: contratId, montant: a.depot,
      variables: { input: { id: a.id, paidAmount: centimes(a.depot), paymentComment: a.nom || "Weekly posting" } },
    });
    etapes.push({ etape: "approuver", jalon: a.id, montant: a.depot, erreur: ap.erreur, reponse: ap.data });
    // Pas approuvée : le contrat n'est pas fermé (rien ne part sans le paiement demandé).
    if (ap.erreur || !ap.data?.approveMilestone) erreur = `approbation : ${ap.erreur ?? "réponse vide"}`;
  }
  if (!erreur) {
    const fe = await ecrire(supabase, {
      par, action: "test_fermeture_fermer", query: MUTATION_FERMER_CONTRAT, tenant, contrat: contratId,
      variables: { contractId: contratId, input: { reasonRef: await raisonFin(supabase) } },
    });
    etapes.push({ etape: "fermer", erreur: fe.erreur, reponse: fe.data });
    if (fe.erreur || fe.data?.endContractByClient?.success !== true) erreur = `fermeture : ${fe.erreur ?? "non confirmée par Upwork"}`;
  }
  // Le bilan, relu chez Upwork (lecture seule).
  const statut = await lire(supabase, { par, action: "test_fermeture_statut", query: REQUETE_STATUT_CONTRAT, variables: { id: contratId }, tenant });
  const apres = await relireJalons(supabase, par, contratId, tenant, "test_fermeture_jalons_apres");
  const champs = await lire(supabase, { par, action: "test_fermeture_champs", query: REQUETE_CHAMPS_FIN, tenant });
  const paye = (js: JalonUpwork[] | null) => (js ?? []).reduce((n, j) => n + (j.paye ?? 0), 0);
  // deno-lint-ignore no-explicit-any
  const requis = ((champs.data?.__type?.inputFields ?? []) as any[]).filter((f) => f?.type?.kind === "NON_NULL").map((f) => String(f.name));
  // Une milestone financée avant qui n'est plus financée ni payée : rendue (remboursée) par Upwork.
  const rendues = finances.filter((f) => {
    const j = (apres.jalons ?? []).find((x) => x.id === f.id);
    return !j || (!ETATS_FINANCES.includes(j.etat) && !(j.paye && j.paye > 0));
  }).map((f) => f.nom || f.id);
  const bilan = {
    mode,
    contrat_statut: statut.data?.contractDetails?.status ?? `illisible (${statut.erreur ?? "réponse vide"})`,
    contrat_ferme: contratFerme(statut.data?.contractDetails?.status),
    paye_avant: paye(avant.jalons),
    paye_apres: paye(apres.jalons),
    paye_par_ce_test: Math.round((paye(apres.jalons) - paye(avant.jalons)) * 100) / 100,
    jalons_avant: avant.jalons.map((j) => ({ nom: j.nom, etat: j.etat, depot: j.depot, paye: j.paye })),
    jalons_apres: apres.jalons ? apres.jalons.map((j) => ({ nom: j.nom, etat: j.etat, depot: j.depot, paye: j.paye })) : null,
    financees_rendues: rendues,
    remboursement: rendues.length > 0 ? "milestone financée plus financée ni payée après la fermeture (rendue au client)" : finances.length && mode === "sans_payer" ? "milestone encore financée : pas de remboursement visible" : "rien à rembourser",
    champs_obligatoires_fermeture: requis,
    feedback_obligatoire: requis.some((n) => /feedback|rating|score/i.test(n)),
    raison_obligatoire: requis.some((n) => /reason/i.test(n)),
  };
  await noter(supabase, { par, action: "test_fermeture_bilan", contrat: contratId, reponse: { etapes, bilan }, erreur });
  return { ok: erreur === null, error: erreur ?? undefined, etapes, bilan };
}

/**
 * Prompt 26 : 0 post, gardé le samedi. La milestone financée « Week w »
 * devient « Week n » : rien n'est payé ni financé. Un seul passage (verrou à 0 $).
 */
async function executerRenommage(supabase: Supabase, par: string | null, semaine: string, p: LignePlan): Promise<Issue> {
  const { ligne, tenant, plan } = p;
  const rn = plan.renommer!;
  if (!ligne.ids[0] || !ligne.contrat_id) return { resultat: "refuse", raison: "ligne incomplète" };
  const { data: id, error } = await supabase.rpc("paie_api_reserver", {
    p_paie_semaine_id: ligne.ids[0], p_poster: ligne.poster_id, p_semaine: semaine, p_contrat: ligne.contrat_id, p_montant: 0, p_par: par,
  });
  if (error || !id) return { resultat: "refuse", raison: error?.message ?? "verrou impossible" };
  const edite = await ecrire(supabase, {
    par, action: "paie_renommer_jalon", query: MUTATION_EDITER_JALON, tenant, contrat: ligne.contrat_id, montant: 0,
    variables: { input: { id: rn.jalon_id, description: rn.vers } },
  });
  const etapes = [{ etape: "renommer", jalon: rn.jalon_id, de: rn.de, vers: rn.vers, erreur: edite.erreur }];
  if (edite.erreur || !edite.data?.editMilestone) {
    const raison = `0 post, gardé : ${rn.de} à renommer en « ${rn.vers} » à la main (${edite.erreur ?? "réponse vide"})`;
    await supabase.from("paie_paiements_api").update({ statut: "a_verifier", erreur: raison, etapes, plan, lignes: ligne.ids, updated_at: new Date().toISOString() }).eq("id", id);
    await aFaire(supabase, {
      cle: `paie:${semaine}:${ligne.ids[0]}`, titre: `Paie ${ligne.poster_nom ?? ligne.poster_id} : milestone à renommer`, detail: resumePaie(ligne, raison),
      poster_id: ligne.poster_id, contrat_id: ligne.contrat_id, semaine,
    });
    return { resultat: "a_verifier", raison };
  }
  await supabase.from("paie_paiements_api").update({
    statut: "paye", financement: "renomme", erreur: null, etapes, plan, lignes: ligne.ids, updated_at: new Date().toISOString(),
  }).eq("id", id);
  await marquerLignes(supabase, ligne.ids, par, "suivante");
  return { resultat: "paye", plan };
}

/** Payer depuis la liste (bouton) : le même moteur que la paie automatique, ligne par ligne. */
async function paiePayer(supabase: Supabase, par: string | null, semaine: string, ids: unknown) {
  // Prompt 22 : en pause, rien ne part et les lignes restent « à faire ».
  if (await bloquer(supabase, { fonction: "upwork", action: "paie_payer", cible: semaine })) {
    return { ok: false, error: PAUSE, lignes: [] };
  }
  // Le plan est relu au moment de payer : rien ne part sur un aperçu périmé.
  const plans = await planifier(supabase, par, semaine, ids);
  const resultats: Record<string, unknown>[] = [];
  for (const p of plans) {
    const issue = await executer(supabase, par, semaine, p, null);
    resultats.push({ ...resume(p), resultat: issue.resultat, ...(issue.raison ? { raison: issue.raison } : {}) });
  }
  return { ok: true, lignes: resultats };
}

// ---------------------------------------------------------------------------
// Prompt 21, parties B et P : un paiement, de bout en bout, sans jamais payer
// deux fois. Chaque étape relit d'abord Upwork : un passage interrompu
// reprend là où il s'est arrêté (une milestone déjà payée n'est jamais
// repayée, une milestone déjà créée n'est jamais recréée).
// ---------------------------------------------------------------------------

interface PaiementApi {
  id: string;
  paie_semaine_id: string;
  statut: string;
  plan: PlanPaiement | null;
  jalon_approuve: string | null;
  jalon_complement: string | null;
  jalon_finance: string | null;
  tentatives: number | null;
  reessai: boolean | null;
  prochain_essai: string | null;
  soumission_message_at: string | null;
  etapes: Record<string, unknown>[] | null;
  montant_approuve: number | null;
  updated_at: string;
}

interface Issue {
  resultat: "paye" | "a_verifier" | "reessai" | "deja_payee" | "refuse" | "rien" | "lien" | "pret";
  raison?: string | null;
  type?: TypeErreur;
  jalon_finance?: string | null;
  plan?: PlanPaiement;
  /** 0467 : la semaine est payée, la suivante reste à financer à la main sur Upwork. */
  a_financer?: boolean;
}

/**
 * 0467 : le compte client n'est pas « enterprise » : activateMilestone ouvre un
 * paiement à confirmer sur Upwork (unified checkout) et la milestone reste
 * « NotFunded / Needs funds ». Elle va dans « To fund by hand » (Payroll et
 * Needs you), une fois ; jamais de nouvel essai.
 */
async function aFinancerALaMain(
  supabase: Supabase,
  o: { ligne: LigneAuto; contrat: string; semaine: string; jalon: { id: string; nom: string | null; etat: string }; montant: number; raison: string },
) {
  await supabase.from("paie_a_financer").upsert({
    paie_semaine_id: o.ligne.ids[0] ?? null, poster_id: o.ligne.poster_id, contrat_id: o.contrat, jalon_id: o.jalon.id,
    nom: o.jalon.nom, montant: o.montant, semaine: o.semaine, raison: o.raison, etat_lu: o.jalon.etat,
  }, { onConflict: "contrat_id,jalon_id", ignoreDuplicates: true });
}

/**
 * 0467 : les milestones « To fund by hand », relues sur Upwork (lecture seule).
 * Financée (ou déjà payée) : sortie de la liste et de Needs you. Cron
 * `a-financer-relire`, toutes les heures ; bouton « Re-read » de Payroll.
 */
async function relireAFinancer(supabase: Supabase, par: string | null) {
  const { data, error } = await supabase.from("paie_a_financer").select("id, contrat_id, jalon_id").is("finance_at", null).limit(300);
  if (error) throw error;
  const liste = (data ?? []) as { id: string; contrat_id: string; jalon_id: string }[];
  const bilan = { ouvertes: liste.length, financees: 0, erreurs: [] as string[] };
  if (!liste.length) return { ok: true, ...bilan };
  const contrats = [...new Set(liste.map((x) => x.contrat_id))];
  const { data: orgs } = await supabase.from("upwork_contrats").select("contrat_id, organisation_id").in("contrat_id", contrats);
  const tenantDe = new Map((orgs ?? []).map((o) => [String(o.contrat_id), (o.organisation_id as string | null) ?? null]));
  await jetonValide(supabase, par);
  for (const contrat of contrats) {
    const relu = await relireJalons(supabase, par, contrat, tenantDe.get(contrat) ?? null, "a_financer_relire");
    if (!relu.jalons) {
      bilan.erreurs.push(`${contrat} : ${relu.erreur}`);
      continue;
    }
    for (const x of liste.filter((y) => y.contrat_id === contrat)) {
      const j = relu.jalons.find((k) => k.id === x.jalon_id);
      const fini = Boolean(j && (ETATS_FINANCES.includes(j.etat) || PAYEES.includes(j.etat)));
      await supabase.from("paie_a_financer").update({
        etat_lu: j?.etat ?? "introuvable", relu_at: new Date().toISOString(), ...(fini ? { finance_at: new Date().toISOString() } : {}),
      }).eq("id", x.id);
      if (fini) bilan.financees++;
    }
  }
  return { ok: bilan.erreurs.length === 0, ...bilan, erreurs: bilan.erreurs.slice(0, 20) };
}

/** Le message d'une milestone que l'API n'a pas pu financer. */
const pasFinancee = (etat: string | null | undefined) =>
  `Upwork : ${etat || "NotFunded"} (Needs funds) — compte non enterprise, le financement attend une confirmation sur Upwork : à financer à la main`;

const COLONNES_PAIEMENT =
  "id, paie_semaine_id, statut, plan, jalon_approuve, jalon_complement, jalon_finance, tentatives, reessai, prochain_essai, soumission_message_at, etapes, montant_approuve, updated_at";

async function relireJalons(supabase: Supabase, par: string | null, contrat: string, tenant: string | null, action: string) {
  const lu = await lire(supabase, { par, action, query: REQUETE_JALONS, variables: { id: contrat }, tenant });
  return lu.data?.contractDetails ? { jalons: lireJalonsContrat(lu.data.contractDetails), erreur: null } : { jalons: null, erreur: lu.erreur ?? "réponse vide" };
}

/** Une ligne de « Logs & to do » (onglet To do, ou Issues si `issue`), une seule fois par clé. */
async function aFaire(
  supabase: Supabase,
  o: { cle: string; titre: string; detail?: string | null; issue?: boolean; poster_id?: string | null; contrat_id?: string | null; semaine?: string | null; type?: string; lien?: string | null },
) {
  // Prompt 26 : une fiche dans Needs you, avec le lien du contrat sur Upwork.
  const lien = o.lien ?? (o.contrat_id ? `https://www.upwork.com/nx/wm/workroom/${o.contrat_id}/overview` : null);
  await supabase.from("a_faire").upsert({
    cle: o.cle, type: o.type ?? "paie", gravite: o.issue ? "issue" : "todo", titre: o.titre, detail: o.detail ?? null,
    poster_id: o.poster_id ?? null, contrat_id: o.contrat_id ?? null, semaine: o.semaine ?? null, lien, maj_at: new Date().toISOString(),
  }, { onConflict: "cle" });
}

/** Prompt 26 : le résumé d'une fiche de paie (montant attendu, semaine suivante). */
function resumePaie(l: LigneAuto, raison: string | null): string {
  const suite = l.suivante_montant !== null && FINANCER_PAIE.includes(l.suivante_action ?? "") ? ` · semaine suivante ${l.suivante_montant} $` : "";
  return `${raison ?? "à vérifier"} · ${l.faits} post(s) avec lien · ${l.montant} $ attendus${suite}`;
}

const FINANCER_PAIE = ["financer", "financer_normal", "financer_double"];

/** Prompt 26 : 0 post et gardé le samedi, la milestone financée est renommée pour la semaine suivante. */
const aRenommer = (l: LigneAuto) => l.action === "rien" && l.suivante_action === "renommer";

/** Un DM Slack à Max (canari arrêté, carte refusée, contrat en pause). */
async function dmMax(texte: string): Promise<void> {
  const jeton = Deno.env.get("SLACK_HM_BOT_TOKEN");
  if (!jeton) return;
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { authorization: `Bearer ${jeton}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ channel: SLACK_MAX, text: texte.slice(0, 3500) }),
  }).catch(() => undefined);
}

/** Les lignes de paie fusionnées : payées, et semaine suivante faite. */
async function marquerLignes(supabase: Supabase, ids: string[], par: string | null, quoi: "paye" | "suivante") {
  const maintenant = new Date().toISOString();
  if (quoi === "paye") await supabase.from("paie_semaines").update({ paye_at: maintenant, paye_par: par }).in("id", ids).is("paye_at", null);
  else {
    await supabase.from("paie_semaines").update({ semaine_suivante_faite_at: maintenant, semaine_suivante_faite_par: par })
      .in("id", ids).is("semaine_suivante_faite_at", null);
  }
}

/** Le prénom du posteur (messages Upwork). */
async function prenomPosteur(supabase: Supabase, posterId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("prenom").eq("id", posterId).maybeSingle();
  return (data?.prenom as string | null)?.trim() || "there";
}

/**
 * Exécute (ou reprend) le paiement d'une ligne. `reprise` : la ligne verrouillée
 * d'un passage précédent (réessai, ligne restée « en cours ») ; sinon le plan
 * vient d'être calculé et la ligne est verrouillée ici.
 */
async function executer(supabase: Supabase, par: string | null, semaine: string, p: LignePlan, repriseLue: PaiementApi | null): Promise<Issue> {
  const { ligne, tenant } = p;
  let reprise = repriseLue;
  if (reprise && !reprise.plan) {
    // Refusée au plan (rien de payé) : on la reprend comme neuve, avec le verrou et le plafond.
    await supabase.from("paie_paiements_api").update({ statut: "libere", libere_raison: "nouvel essai", updated_at: new Date().toISOString() }).eq("id", reprise.id);
    reprise = null;
  }
  const plan = reprise?.plan ?? p.plan;
  if (!reprise && plan.statut === "renommer" && plan.renommer) {
    if (p.bloque) return { resultat: "refuse", raison: p.bloque };
    return await executerRenommage(supabase, par, semaine, p);
  }
  if (!reprise) {
    if (p.bloque) return { resultat: "refuse", raison: p.bloque };
    if (plan.statut === "deja_payee") return { resultat: await noterDejaPayee(supabase, par, semaine, p) as Issue["resultat"], raison: plan.raison };
    if (plan.statut !== "pret" || !plan.approuver || !ligne.id || !ligne.contrat_id) {
      return { resultat: plan.statut === "refuse" || plan.statut === "renommer" ? "refuse" : plan.statut, raison: plan.raison };
    }
  }
  if (!ligne.contrat_id || !plan.approuver) return { resultat: "refuse", raison: "plan incomplet" };
  const contrat = ligne.contrat_id;

  // 1. Le verrou (une seule fois par ligne) et le plafond du jour, avant tout appel.
  let paiementId = reprise?.id ?? null;
  if (!paiementId) {
    const { data, error } = await supabase.rpc("paie_api_reserver", {
      p_paie_semaine_id: ligne.ids[0], p_poster: ligne.poster_id, p_semaine: semaine,
      p_contrat: contrat, p_montant: plan.total, p_par: par,
    });
    if (error || !data) return { resultat: "refuse", raison: error?.message ?? "verrou impossible" };
    paiementId = data as string;
    await supabase.from("paie_paiements_api").update({ plan, lignes: ligne.ids }).eq("id", paiementId);
  }
  const etapes: Record<string, unknown>[] = [...(reprise?.etapes ?? [])];
  let tentatives = Number(reprise?.tentatives ?? 0);
  let jalonApprouve = reprise?.jalon_approuve ?? null;
  let jalonComplement = reprise?.jalon_complement ?? null;
  let jalonFinance = reprise?.jalon_finance ?? null;
  const maj = (champs: Record<string, unknown>) =>
    supabase.from("paie_paiements_api").update({ ...champs, etapes, updated_at: new Date().toISOString() }).eq("id", paiementId!);

  /** Un échec : réessai dans 1 h (problème technique, lundi et mardi) ou To do. */
  const echec = async (raison: string, brute: string | null, typeForce?: TypeErreur): Promise<Issue> => {
    const type = typeForce ?? classerErreur(brute ?? raison);
    const reessai = aReessayer(type) && !reessaisFinis(new Date(), semaine);
    tentatives++;
    await maj({
      statut: "a_verifier", erreur: raison, type_erreur: type, reessai, tentatives,
      prochain_essai: reessai ? new Date(Date.now() + 3_600_000).toISOString() : null,
      jalon_approuve: jalonApprouve, jalon_complement: jalonComplement, jalon_finance: jalonFinance,
    });
    const nom = ligne.poster_nom ?? ligne.poster_id;
    if (type === "carte" || type === "pause_contrat") {
      // P1 : DM Slack immédiat et une ligne dans Issues (une fois par ligne).
      if (tentatives === 1 || !reprise?.reessai) {
        await dmMax(`:rotating_light: Paie ${semaine} — ${nom} (contrat ${contrat}) : ${type === "carte" ? "carte refusée" : "contrat en pause chez Upwork"}. ${raison}`);
      }
      await aFaire(supabase, {
        cle: `paie:${semaine}:${ligne.ids[0]}:${type}`, issue: true, titre: `${nom} : ${type === "carte" ? "carte refusée" : "contrat en pause"}`,
        detail: raison, poster_id: ligne.poster_id, contrat_id: contrat, semaine,
      });
    }
    if (!reessai) {
      await aFaire(supabase, { cle: `paie:${semaine}:${ligne.ids[0]}`, titre: `Paie ${nom} : à vérifier`, detail: raison, poster_id: ligne.poster_id, contrat_id: contrat, semaine });
    }
    return { resultat: reessai ? "reessai" : "a_verifier", raison, type, plan };
  };

  // 0. Les milestones, fraîches.
  let jalons: JalonUpwork[] = p.jalons;
  if (reprise || jalons.length === 0) {
    const relu = await relireJalons(supabase, par, contrat, tenant, "paie_relire_jalons");
    if (!relu.jalons) return await echec(`milestones illisibles : ${relu.erreur}`, relu.erreur);
    jalons = relu.jalons;
  }

  // 2. Approuver la milestone de la semaine payée.
  const a = plan.approuver;
  const cible = jalons.find((j) => j.id === a.jalon_id);
  if (!jalonApprouve) {
    if (cible && PAYEES.includes(cible.etat)) {
      // Déjà payée (par un passage interrompu, ou libérée par Upwork après 14 jours) : jamais repayée.
      etapes.push({ etape: "approuver", jalon: a.jalon_id, deja: cible.etat });
    } else if (!cible || !ETATS_FINANCES.includes(cible.etat)) {
      return await echec(`${a.nom || "milestone"} : état ${cible?.etat ?? "introuvable"}, inattendu`, "état inattendu");
    } else {
      const approuve = await ecrire(supabase, {
        par, action: "paie_approuver", query: MUTATION_APPROUVER, tenant, contrat, montant: a.montant,
        variables: {
          input: { id: a.jalon_id, paidAmount: centimes(a.montant), paymentComment: a.nom || "Weekly posting", ...(a.sous_paiement ? { underpaymentReason: a.sous_paiement } : {}) },
        },
      });
      etapes.push({ etape: "approuver", jalon: a.jalon_id, montant: a.montant, erreur: approuve.erreur, etat: approuve.data?.approveMilestone?.state ?? null });
      if (approuve.erreur || !approuve.data?.approveMilestone) {
        const erreur = approuve.erreur ?? "réponse vide";
        // B10 : pas soumise → le posteur est prévenu une fois, l'OS réessaie toutes les heures.
        if (classerErreur(erreur) === "soumission" && !reprise?.soumission_message_at) {
          const v = await reglagesValeurs(supabase, ["paie_soumettre_texte"]);
          const texte = remplirTexte(texteReglage(v.paie_soumettre_texte, SOUMETTRE_DEFAUT), {
            prenom: await prenomPosteur(supabase, ligne.poster_id), NN: numeroSemaine(semaine),
          });
          const m = await envoyerMessage(supabase, par, contrat, texte);
          etapes.push({ etape: "message_soumettre", ok: m.ok, erreur: m.ok ? null : m.error ?? null });
          if (m.ok) await maj({ soumission_message_at: new Date().toISOString() });
        }
        return await echec(`approbation : ${erreur}`, erreur);
      }
    }
    jalonApprouve = a.jalon_id;
    await marquerLignes(supabase, ligne.ids, par, "paye");
    await maj({ jalon_approuve: jalonApprouve, montant_approuve: a.montant, erreur: null });
  }

  // 3. B9 : le complément du 2e compte (créé, relu, financé, approuvé).
  const c = plan.complement;
  if (c) {
    let jc = jalons.find((j) => (jalonComplement ? j.id === jalonComplement : j.nom === c.nom));
    if (!jc || !PAYEES.includes(jc.etat)) {
      if (!jc) {
        const cree = await ecrire(supabase, {
          par, action: "paie_creer_complement", query: MUTATION_CREER_JALON, tenant, contrat, montant: c.montant,
          variables: { input: { contractId: contrat, description: c.nom, depositAmount: centimes(c.montant), ...(await echeanceJalon(supabase, par, tenant, c.nom)) } },
        });
        jalonComplement = cree.data?.createMilestoneV2?.id ? String(cree.data.createMilestoneV2.id) : null;
        etapes.push({ etape: "creer_complement", jalon: jalonComplement, montant: c.montant, erreur: cree.erreur });
        if (cree.erreur || !jalonComplement) return await echec(`payée ; complément ${c.nom} : ${cree.erreur ?? "réponse vide"}`, cree.erreur);
        await maj({ jalon_complement: jalonComplement });
        const relu = await relireJalons(supabase, par, contrat, tenant, "paie_relire_complement");
        if (!relu.jalons) return await echec(`payée ; complément illisible : ${relu.erreur}`, relu.erreur);
        jalons = relu.jalons;
        jc = jalons.find((j) => j.id === jalonComplement);
      }
      jalonComplement = jc?.id ?? jalonComplement;
      if (!jc) return await echec(`payée ; ${c.nom} introuvable à la relecture`, "état inattendu");
      if (jc.etat === "NotFunded") {
        // B5 : le montant relu, au cent près, avant de financer.
        if (!montantConforme(jc, c.montant)) return await echec(`payée ; ${c.nom} vaut ${jc.depot ?? "?"} $, attendu ${c.montant} $ : pas financée`, null, "autre");
        const active = await ecrire(supabase, { par, action: "paie_financer_complement", query: MUTATION_FINANCER_JALON, tenant, contrat, montant: c.montant, variables: { input: { id: jc.id } } });
        if (active.erreur || !active.data?.activateMilestone) {
          etapes.push({ etape: "financer_complement", jalon: jc.id, erreur: active.erreur ?? "réponse vide", reponse: active.data ?? null });
          return await echec(`payée ; financement de ${c.nom} : ${active.erreur ?? "réponse vide"}`, active.erreur);
        }
        const relu = await relireJalons(supabase, par, contrat, tenant, "paie_relire_complement");
        jc = relu.jalons?.find((j) => j.id === jalonComplement) ?? jc;
        if (relu.jalons) jalons = relu.jalons;
        // 0467 : « OK » seulement si la relecture le confirme financé.
        const fini = ETATS_FINANCES.includes(jc.etat);
        etapes.push({ etape: "financer_complement", jalon: jc.id, erreur: fini ? null : pasFinancee(jc.etat), etat: jc.etat, reponse: active.data ?? null });
        if (!fini) {
          await aFinancerALaMain(supabase, { ligne, contrat, semaine, jalon: jc, montant: c.montant, raison: "2nd account: fund, then approve" });
          return await echec(`payée ; ${c.nom} : ${pasFinancee(jc.etat)}`, null, "autre");
        }
      }
      if (ETATS_FINANCES.includes(jc.etat)) {
        if (!montantConforme(jc, c.montant)) return await echec(`payée ; ${c.nom} financée à ${jc.depot ?? "?"} $, attendu ${c.montant} $`, null, "autre");
        const ok = await ecrire(supabase, {
          par, action: "paie_approuver_complement", query: MUTATION_APPROUVER, tenant, contrat, montant: c.montant,
          variables: { input: { id: jc.id, paidAmount: centimes(c.montant), paymentComment: c.nom } },
        });
        etapes.push({ etape: "approuver_complement", jalon: jc.id, montant: c.montant, erreur: ok.erreur });
        if (ok.erreur || !ok.data?.approveMilestone) return await echec(`payée ; approbation de ${c.nom} : ${ok.erreur ?? "réponse vide"}`, ok.erreur);
      } else if (!PAYEES.includes(jc.etat)) {
        return await echec(`payée ; ${c.nom} : état ${jc.etat}, inattendu`, "état inattendu");
      }
    }
  }

  // 4. Kill (partie F) : payée, rien de financé, puis le contrat fermé (états connus, B7).
  if (plan.lien === "fermer") {
    const fin = await fermerApresPaiement(supabase, par, semaine, ligne.poster_id, contrat, tenant);
    etapes.push({ etape: "fermer", ...fin });
    if (!fin.ferme) return await echec(`payée ; ${fin.raison}`, null, "autre");
    await maj({ statut: "paye", financement: "non", erreur: null, reessai: false, prochain_essai: null });
    return { resultat: "paye", plan };
  }

  // 5. Financer la semaine suivante : existante, retrouvée (passage interrompu) ou créée.
  const f = plan.financer;
  if (!f) {
    await maj({ statut: "paye", financement: "non", erreur: null, reessai: false, prochain_essai: null });
    return { resultat: "paye", plan };
  }
  const seqPayee = cible?.sequence ?? 0;
  if (!jalonFinance) jalonFinance = f.mode === "existant" ? f.jalon_id : null;
  if (!jalonFinance) {
    const deja = jalons.find((j) => j.nom === f.nom && j.sequence > seqPayee && !PAYEES.includes(j.etat));
    if (deja) jalonFinance = deja.id;
  }
  if (!jalonFinance) {
    const cree = await ecrire(supabase, {
      par, action: "paie_creer_jalon", query: MUTATION_CREER_JALON, tenant, contrat, montant: f.montant,
      variables: { input: { contractId: contrat, description: f.nom, depositAmount: centimes(f.montant), ...(await echeanceJalon(supabase, par, tenant, f.nom)) } },
    });
    jalonFinance = cree.data?.createMilestoneV2?.id ? String(cree.data.createMilestoneV2.id) : null;
    etapes.push({ etape: "creer", jalon: jalonFinance, nom: f.nom, montant: f.montant, erreur: cree.erreur, reponse: cree.data ?? null });
    if (cree.erreur || !jalonFinance) return await echec(`payée ; création de ${f.nom} : ${cree.erreur ?? "réponse vide"}`, cree.erreur);
  }
  await maj({ jalon_finance: jalonFinance, montant_finance: f.montant });
  // B5 : on relit toujours avant de financer (montant au cent près, état).
  let relu = await relireJalons(supabase, par, contrat, tenant, "paie_relire_jalons");
  if (!relu.jalons) return await echec(`payée ; ${f.nom} illisible : ${relu.erreur}`, relu.erreur);
  let jf = relu.jalons.find((j) => j.id === jalonFinance);
  if (!jf) return await echec(`payée ; ${f.nom} introuvable à la relecture`, "état inattendu");
  if (jf.etat === "NotFunded" && (!montantConforme(jf, f.montant) || jf.nom !== f.nom)) {
    const edite = await ecrire(supabase, {
      par, action: "paie_editer_jalon", query: MUTATION_EDITER_JALON, tenant, contrat, montant: f.montant,
      variables: { input: { id: jalonFinance, description: f.nom, depositAmount: centimes(f.montant) } },
    });
    etapes.push({ etape: "editer", jalon: jalonFinance, montant: f.montant, erreur: edite.erreur });
    if (edite.erreur || !edite.data?.editMilestone) return await echec(`payée ; modification de ${f.nom} : ${edite.erreur ?? "réponse vide"}`, edite.erreur);
    relu = await relireJalons(supabase, par, contrat, tenant, "paie_relire_jalons");
    if (!relu.jalons) return await echec(`payée ; ${f.nom} illisible : ${relu.erreur}`, relu.erreur);
    jf = relu.jalons.find((j) => j.id === jalonFinance);
    if (!jf) return await echec(`payée ; ${f.nom} introuvable à la relecture`, "état inattendu");
  }
  if (jf.etat === "NotFunded") {
    if (!montantConforme(jf, f.montant)) {
      etapes.push({ etape: "garde_fou_montant", jalon: jalonFinance, relu: jf.depot, attendu: f.montant });
      return await echec(`payée ; ${f.nom} relue à ${jf.depot ?? "?"} $, attendu ${f.montant} $ : pas financée`, null, "autre");
    }
    const active = await ecrire(supabase, {
      par, action: "paie_financer_jalon", query: MUTATION_FINANCER_JALON, tenant, contrat, montant: f.montant,
      variables: { input: { id: jalonFinance } },
    });
    if (active.erreur || !active.data?.activateMilestone) {
      etapes.push({ etape: "financer", jalon: jalonFinance, nom: f.nom, montant: f.montant, erreur: active.erreur ?? "réponse vide", reponse: active.data ?? null });
      await maj({ financement: "erreur" });
      return await echec(`payée ; financement de ${f.nom} : ${active.erreur ?? "réponse vide"}`, active.erreur);
    }
    // L'activation peut passer par un paiement Upwork (checkout) : on relit. 0467 : « OK » seulement si la relecture le confirme.
    relu = await relireJalons(supabase, par, contrat, tenant, "paie_relire_jalons");
    jf = relu.jalons?.find((j) => j.id === jalonFinance) ?? jf;
    const fini = ETATS_FINANCES.includes(jf.etat);
    etapes.push({
      etape: "financer", jalon: jalonFinance, nom: f.nom, montant: f.montant, etat: jf.etat,
      erreur: fini ? null : pasFinancee(jf.etat), reponse: active.data ?? null,
    });
  }
  if (!ETATS_FINANCES.includes(jf.etat)) {
    // 0467 : la semaine est payée ; la suivante va dans « To fund by hand », sans nouvel essai.
    await aFinancerALaMain(supabase, { ligne, contrat, semaine, jalon: jf, montant: f.montant, raison: "fund next week" });
    await maj({ statut: "paye", financement: "a_la_main", erreur: null, reessai: false, prochain_essai: null });
    return { resultat: "paye", jalon_finance: jalonFinance, plan, a_financer: true };
  }
  if (!montantConforme(jf, f.montant)) return await echec(`payée ; ${f.nom} financée à ${jf.depot ?? "?"} $, attendu ${f.montant} $`, null, "autre");
  await marquerLignes(supabase, ligne.ids, par, "suivante");
  await maj({ statut: "paye", financement: "finance", erreur: null, reessai: false, prochain_essai: null });
  return { resultat: "paye", jalon_finance: jalonFinance, plan };
}

// ---------------------------------------------------------------------------
// Prompt 21, B3 à B6 : la paie automatique du lundi (cron `paie-auto`, toutes
// les 10 minutes le lundi et le mardi ; « Pay now »). Canari d'abord, puis des
// lots de 10, enchaînés ; les réessais toutes les heures jusqu'au mardi 20 h.
// ---------------------------------------------------------------------------

/** Lignes que la paie automatique ne touche pas (et pourquoi), sans lire Upwork. */
function horsPaieAuto(l: LigneAuto): string | null {
  if (l.exclu) return "retirée de la liste";
  if (l.paye_at) return "déjà cochée « Payé »";
  if (l.refus) return l.refus;
  // Prompt 26 : plus de Kill sous les 6 posts ; seul le Kill du samedi arrête.
  return null;
}

const BUDGET_MS = 110_000;

async function paieAuto(supabase: Supabase, par: string | null, o: { lancer?: boolean; enchaine?: boolean } = {}) {
  const debut = Date.now();
  // Prompt 22 : le grand interrupteur bloque tout.
  if (await bloquer(supabase, { fonction: "upwork", action: "paie_auto" })) return { ok: false, error: PAUSE };
  const r = await reglagesPaieApi(supabase);
  if (r.mode !== "on") return { ok: true, ignore: `paie_api = ${r.mode} : rien ne part` };
  if (aujourdhuiParis() < r.tous_des) return { ok: true, ignore: `pas avant le ${r.tous_des}` };
  const semaine = semaineAPayer();
  const { data: pris, error: errPris } = await supabase.rpc("paie_auto_prendre", { p_semaine: semaine, p_lancer: o.lancer === true, p_par: par });
  if (errPris) throw errPris;
  const etat = (pris ?? [])[0] as { statut: string; lance_at: string | null; canari_ok: boolean | null; arret_raison: string | null } | undefined;
  if (!etat) return { ok: true, ignore: "un autre passage est en cours" };
  let encore = false;
  try {
    const v = await reglagesValeurs(supabase, ["paie_auto_heure"]);
    const heure = Number.isFinite(Number(v.paie_auto_heure)) ? Number(v.paie_auto_heure) : 9;
    const quand = peutPayer(new Date(), heure, etat.lance_at);
    if (!quand.ok) return { ok: true, ignore: quand.raison };
    if (etat.statut === "arrete") return { ok: true, ignore: `arrêtée après le canari : ${etat.arret_raison ?? "voir Payroll"}` };
    const { lignes, tenantDe } = await chargerLignes(supabase, semaine);
    const tenant = (l: LigneAuto) => (l.contrat_id ? (tenantDe.get(l.contrat_id) ?? null) : null);
    await jetonValide(supabase, par);

    // Décisions finales : plus de Kill automatique sous les 6 posts (le samedi, Max décide).

    const { data: verrous } = await supabase.from("paie_paiements_api").select(COLONNES_PAIEMENT).eq("semaine", semaine).neq("statut", "libere");
    const verrouDe = new Map(((verrous ?? []) as PaiementApi[]).map((x) => [x.paie_semaine_id, x]));

    // 1. Le canari (B4) : un seul contrat, relu en entier avant d'aller plus loin.
    if (!etat.canari_ok) {
      const libres = lignes.filter((l) => !verrouDe.has(l.ids[0]) && !horsPaieAuto(l) && l.contrat_id);
      // Le canari : une ligne simple ; à défaut, la 1re ligne « Payer » d'un seul profil.
      const c = choisirCanari(libres) ?? libres.find((l) => l.action === "payer" && l.ids.length === 1) ?? null;
      if (!c) {
        await supabase.from("paie_auto").update({ canari_ok: true, canari_detail: { aucun: "aucune ligne simple à payer" }, maj_at: new Date().toISOString() }).eq("semaine", semaine);
      } else {
        const p = await planLigne(supabase, par, semaine, c, tenant(c), r);
        const issue = await executer(supabase, par, semaine, p, null);
        let ecarts: string[] = [];
        if (issue.resultat !== "paye") ecarts = [`${issue.resultat} : ${issue.raison ?? "?"}`];
        else {
          const relu = await relireJalons(supabase, par, c.contrat_id!, tenant(c), "paie_canari_relire");
          ecarts = relu.jalons ? ecartsCanari(issue.plan ?? p.plan, issue.jalon_finance ?? null, relu.jalons) : [`relecture impossible : ${relu.erreur}`];
        }
        const detail = { ligne: c.ids[0], poster: c.poster_nom, contrat: c.contrat_id, resultat: issue.resultat, ecarts };
        if (ecarts.length) {
          await supabase.from("paie_auto").update({
            statut: "arrete", canari_ok: false, canari_ligne: c.ids[0], canari_detail: detail,
            arret_raison: ecarts.join(" · "), maj_at: new Date().toISOString(),
          }).eq("semaine", semaine);
          await dmMax(`:octagonal_sign: Paie automatique ${semaine} arrêtée au canari (${c.poster_nom ?? c.poster_id}, contrat ${c.contrat_id}). Rien d'autre n'est parti.\n• ${ecarts.join("\n• ")}\n${OS_URL}/admin/paie`);
          await aFaire(supabase, { cle: `paie:${semaine}:canari`, issue: true, titre: "Paie automatique arrêtée au canari", detail: ecarts.join(" · "), semaine });
          return { ok: false, semaine, canari: detail };
        }
        await supabase.from("paie_auto").update({ statut: "en_cours", canari_ok: true, canari_ligne: c.ids[0], canari_detail: detail, maj_at: new Date().toISOString() }).eq("semaine", semaine);
      }
    }

    // 2. Les réessais dus (P1, B10), puis les lignes pas encore traitées, par lots de 10.
    const maintenant = new Date();
    const finis = reessaisFinis(maintenant, semaine);
    const reprises: { l: LigneAuto; v: PaiementApi }[] = [];
    const nouvelles: LigneAuto[] = [];
    for (const l of lignes) {
      const x = l.ids[0] ? verrouDe.get(l.ids[0]) : undefined;
      if (x) {
        const enCoursMort = x.statut === "en_cours" && Date.now() - new Date(x.updated_at).getTime() > 5 * 60_000;
        const reessaiDu = x.statut === "a_verifier" && x.reessai && (!x.prochain_essai || new Date(x.prochain_essai) <= maintenant);
        if (enCoursMort || reessaiDu) reprises.push({ l, v: x });
        continue;
      }
      if ((l.action === "legacy" || l.action === "a_verifier") && l.ids[0] && !l.exclu && !l.paye_at) {
        // Prompt 21, S : hors paie automatique, visibles dans To do.
        await aFaire(supabase, {
          cle: `paie:${semaine}:${l.ids[0]}`, poster_id: l.poster_id, contrat_id: l.contrat_id, semaine,
          titre: `Paie ${l.poster_nom ?? l.poster_id} : ${l.action === "legacy" ? "contrat Legacy, à payer en fin de période" : "tarif du contrat à vérifier"}`,
          detail: l.action === "legacy" ? "Payroll → Contract rate (Legacy)" : "Payroll → Contract rate : fixer le tarif",
        });
        continue;
      }
      if ((!ACTIONS_PAYEES.includes(l.action) && !aRenommer(l)) || !l.contrat_id || !l.ids[0]) continue;
      const hors = horsPaieAuto(l);
      if (hors) {
        if (!l.exclu && !l.paye_at) {
          await aFaire(supabase, { cle: `paie:${semaine}:${l.ids[0]}`, titre: `Paie ${l.poster_nom ?? l.poster_id} : à faire à la main`, detail: resumePaie(l, hors), poster_id: l.poster_id, contrat_id: l.contrat_id, semaine });
        }
        continue;
      }
      nouvelles.push(l);
    }
    const bilan = { semaine, reprises: 0, payees: 0, reessais: 0, a_verifier: 0, refusees: 0, rien: 0 };
    const compter = (i: Issue) => {
      if (i.resultat === "paye" || i.resultat === "deja_payee") bilan.payees++;
      else if (i.resultat === "reessai") bilan.reessais++;
      else if (i.resultat === "a_verifier") bilan.a_verifier++;
      else if (i.resultat === "refuse") bilan.refusees++;
      else bilan.rien++;
    };
    for (const { l, v } of reprises) {
      if (Date.now() - debut > BUDGET_MS) { encore = true; break; }
      if (finis && v.statut === "a_verifier") {
        // Mardi 20 h passé : plus de réessai, la ligne va dans To do.
        await supabase.from("paie_paiements_api").update({ reessai: false, prochain_essai: null, updated_at: new Date().toISOString() }).eq("id", v.id);
        await aFaire(supabase, { cle: `paie:${semaine}:${l.ids[0]}`, titre: `Paie ${l.poster_nom ?? l.poster_id} : à vérifier`, detail: "réessais finis (mardi 20 h)", poster_id: l.poster_id, contrat_id: l.contrat_id, semaine });
        continue;
      }
      if (v.statut === "en_cours") await supabase.from("paie_paiements_api").update({ statut: "a_verifier", updated_at: new Date().toISOString() }).eq("id", v.id);
      const p: LignePlan = v.plan
        ? { ligne: l, tenant: tenant(l), jalons: [], plan: v.plan, bloque: null }
        : await planLigne(supabase, par, semaine, l, tenant(l), r);
      const issue = await executer(supabase, par, semaine, p, v);
      compter(issue);
      if (issue.resultat === "refuse") await noterRefus(supabase, par, semaine, l, issue.raison ?? null);
      bilan.reprises++;
    }
    for (let i = 0; i < nouvelles.length && !encore; i += 10) {
      for (const l of nouvelles.slice(i, i + 10)) {
        if (Date.now() - debut > BUDGET_MS) { encore = true; break; }
        const p = await planLigne(supabase, par, semaine, l, tenant(l), r);
        const issue = await executer(supabase, par, semaine, p, null);
        compter(issue);
        if (issue.resultat === "refuse") await noterRefus(supabase, par, semaine, l, issue.raison ?? null);
      }
    }
    await supabase.from("paie_auto").update({ statut: encore ? "en_cours" : "fini", maj_at: new Date().toISOString(), dernier_bilan: bilan }).eq("semaine", semaine);
    return { ok: true, ...bilan, encore };
  } finally {
    await supabase.rpc("paie_auto_rendre", { p_semaine: semaine });
    // B6 : lots enchaînés, sans attendre le cron suivant.
    if (encore) enchainer("paie_auto");
  }
}

/**
 * Un refus du plan (milestone absente, montant inattendu…) : verrou à 0 $,
 * pour ne pas relire Upwork à chaque passage. Problème technique : nouvel
 * essai dans 1 h ; sinon To do (la réconciliation le reprend).
 */
async function noterRefus(supabase: Supabase, par: string | null, semaine: string, l: LigneAuto, raison: string | null) {
  if (!l.ids[0] || !l.contrat_id) return;
  const { data: id } = await supabase.rpc("paie_api_reserver", {
    p_paie_semaine_id: l.ids[0], p_poster: l.poster_id, p_semaine: semaine, p_contrat: l.contrat_id, p_montant: 0, p_par: par,
  });
  if (!id) return;
  const type = classerErreur(raison);
  const reessai = aReessayer(type) && !reessaisFinis(new Date(), semaine);
  await supabase.from("paie_paiements_api").update({
    statut: "a_verifier", erreur: raison ?? "refusée", type_erreur: type, reessai, lignes: l.ids,
    prochain_essai: reessai ? new Date(Date.now() + 3_600_000).toISOString() : null, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (!reessai) {
    await aFaire(supabase, {
      cle: `paie:${semaine}:${l.ids[0]}`, titre: `Paie ${l.poster_nom ?? l.poster_id} : à payer à la main`, detail: resumePaie(l, raison),
      poster_id: l.poster_id, contrat_id: l.contrat_id, semaine,
    });
  }
}

/** Le verrou de la paie de la semaine : attendu jusqu'à `essais` × 30 s (un passage dure moins de 2 min). */
async function prendreVerrou(supabase: Supabase, semaine: string, par: string | null, essais: number): Promise<boolean> {
  for (let i = 0; i < essais; i++) {
    const { data } = await supabase.rpc("paie_auto_prendre", { p_semaine: semaine, p_lancer: false, p_par: par });
    if ((data ?? []).length > 0) return true;
    if (i < essais - 1) await new Promise((r) => setTimeout(r, 30_000));
  }
  return false;
}

/** Relance la fonction (cron secret), sans attendre sa réponse. */
function enchainer(action: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("CRON_SECRET");
  if (!url || !secret) return;
  const appel = fetch(`${url}/functions/v1/upwork`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-cron-secret": secret },
    body: JSON.stringify({ action, enchaine: true }),
  }).then((r) => r.body?.cancel()).catch(() => undefined);
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(appel);
}

// ---------------------------------------------------------------------------
// Prompt 21, P2 : la réconciliation (lundi 20 h, mardi 12 h, Paris). Chaque
// ligne de la semaine est relue chez Upwork : la semaine finie est-elle
// payée ? la suivante financée au bon montant ? Ce qui peut l'être est
// corrigé (dans les plafonds), le reste va dans To do.
// ---------------------------------------------------------------------------

async function paieReconcilier(supabase: Supabase, par: string | null) {
  const debut = Date.now();
  if (await bloquer(supabase, { fonction: "upwork", action: "paie_reconcilier" })) return { ok: false, error: PAUSE };
  const r = await reglagesPaieApi(supabase);
  if (r.mode !== "on") return { ok: true, ignore: `paie_api = ${r.mode} : rien n'est corrigé` };
  const semaine = semaineAPayer();
  const { data: etatAuto } = await supabase.from("paie_auto").select("canari_ok, statut").eq("semaine", semaine).maybeSingle();
  if (!etatAuto?.canari_ok) return { ok: true, ignore: "le canari n'a pas encore réussi cette semaine" };
  // Jamais en même temps que la paie automatique (même ligne, même milestone).
  if (!(await prendreVerrou(supabase, semaine, par, 6))) return { ok: false, error: "paie automatique en cours : réconciliation pas faite" };
  try {
    return await reconcilier(supabase, par, semaine, r, debut);
  } finally {
    await supabase.rpc("paie_auto_rendre", { p_semaine: semaine });
  }
}

async function reconcilier(supabase: Supabase, par: string | null, semaine: string, r: ReglagesPaieApi, debut: number) {
  const { lignes, tenantDe } = await chargerLignes(supabase, semaine);
  const tenant = (l: LigneAuto) => (l.contrat_id ? (tenantDe.get(l.contrat_id) ?? null) : null);
  const { data: verrous } = await supabase.from("paie_paiements_api").select(COLONNES_PAIEMENT).eq("semaine", semaine).neq("statut", "libere");
  const verrouDe = new Map(((verrous ?? []) as PaiementApi[]).map((x) => [x.paie_semaine_id, x]));
  await jetonValide(supabase, par);
  const bilan = { semaine, relues: 0, corrigees: 0, a_faire: 0, ecarts: [] as string[] };
  const aRelire = lignes.filter((l) => ACTIONS_PAYEES.includes(l.action) && !l.exclu && l.contrat_id && l.ids[0] && !l.refus);
  for (let i = 0; i < aRelire.length; i += 5) {
    if (Date.now() - debut > 200_000) {
      bilan.ecarts.push("temps écoulé : la suite au prochain passage de la paie automatique");
      break;
    }
    await Promise.all(aRelire.slice(i, i + 5).map(async (l) => {
      const v = verrouDe.get(l.ids[0]);
      const nom = l.poster_nom ?? l.poster_id;
      // Rien n'a été payé et la ligne attend une personne : on la reprend de zéro.
      if (v && v.statut === "a_verifier" && !v.jalon_approuve && !v.reessai) {
        await supabase.from("paie_paiements_api").update({ statut: "libere", libere_raison: "réconciliation : nouvel essai", updated_at: new Date().toISOString() }).eq("id", v.id);
        const issue = await executer(supabase, par, semaine, await planLigne(supabase, par, semaine, l, tenant(l), r), null);
        bilan.relues++;
        if (issue.resultat === "paye" || issue.resultat === "deja_payee") bilan.corrigees++;
        else bilan.ecarts.push(`${nom} : ${issue.raison ?? issue.resultat}`);
        return;
      }
      if (v && v.statut === "a_verifier") {
        // En réessai : la réconciliation le fait tout de suite.
        const p: LignePlan = v.plan
          ? { ligne: l, tenant: tenant(l), jalons: [], plan: v.plan, bloque: null }
          : await planLigne(supabase, par, semaine, l, tenant(l), r);
        const issue = await executer(supabase, par, semaine, p, v);
        bilan.relues++;
        if (issue.resultat === "paye") bilan.corrigees++;
        else bilan.ecarts.push(`${nom} : ${issue.raison ?? issue.resultat}`);
        return;
      }
      if (!v && !l.paye_at) {
        // Pas encore payée (la paie automatique ne l'a pas encore prise).
        const issue = await executer(supabase, par, semaine, await planLigne(supabase, par, semaine, l, tenant(l), r), null);
        bilan.relues++;
        if (issue.resultat === "paye" || issue.resultat === "deja_payee") bilan.corrigees++;
        else if (issue.resultat !== "rien") bilan.ecarts.push(`${nom} : ${issue.raison ?? issue.resultat}`);
        return;
      }
      // Payée : on relit Upwork.
      const relu = await relireJalons(supabase, par, l.contrat_id!, tenant(l), "paie_reconcilier_jalons");
      bilan.relues++;
      if (!relu.jalons) {
        bilan.ecarts.push(`${nom} : milestones illisibles`);
        return;
      }
      const ecarts = ecartsReconciliation(l, v ?? null, relu.jalons, semaine);
      if (ecarts.length === 0) return;
      bilan.ecarts.push(`${nom} : ${ecarts.join(" · ")}`);
      bilan.a_faire++;
      await aFaire(supabase, {
        cle: `paie:${semaine}:${l.ids[0]}:reconciliation`, titre: `Paie ${nom} : écart avec Upwork`, detail: ecarts.join(" · "),
        poster_id: l.poster_id, contrat_id: l.contrat_id, semaine,
      });
    }));
  }
  return { ok: true, ...bilan };
}

// ---------------------------------------------------------------------------
// Prompt 21, P3 : un posteur écrit au sujet de sa paie (« not paid », « wrong
// amount », « milestone not funded »). L'OS regarde sa ligne et répond.
// ---------------------------------------------------------------------------

async function paieQuestion(supabase: Supabase, par: string | null, posterId: string, simuler: boolean) {
  if (!posterId) return { ok: false, error: "poster_id requis" };
  const v = await reglagesValeurs(supabase, ["paie_reponse_payee_texte", "paie_reponse_deja_payee_texte", "paie_reponse_financee_texte"]);
  const semaine = semaineAPayer();
  const NN = numeroSemaine(semaine);
  const { lignes, tenantDe } = await chargerLignes(supabase, semaine);
  const l = lignes.find((x) => x.posteurs.includes(posterId));
  const attente = { ok: true, cas: "attente", texte: null as string | null, liste: "paie" };
  // Prompt 26 : ce qu'Upwork montre d'abord : la semaine payée, ou la suivante financée → la réponse part seule.
  const vu = await semaineVueSurUpwork(supabase, par, posterId, semaine).catch(() => null);
  if (vu?.cas === "payee") {
    return { ok: true, cas: "payee", texte: remplirTexte(texteReglage(v.paie_reponse_payee_texte, REPONSE_PAYEE), { montant: vu.montant.toFixed(2).replace(/\.00$/, ""), NN }) };
  }
  if (vu?.cas === "financee") {
    return { ok: true, cas: "financee", texte: remplirTexte(texteReglage(v.paie_reponse_financee_texte, REPONSE_FINANCEE), { NN: NN + 1 }) };
  }
  if (!l || !ACTIONS_PAYEES.includes(l.action) || l.exclu || !l.contrat_id || !l.ids[0]) return attente;
  const { data: x } = await supabase.from("paie_paiements_api").select(COLONNES_PAIEMENT).eq("paie_semaine_id", l.ids[0]).neq("statut", "libere").maybeSingle();
  const verrou = x as (PaiementApi & { montant_approuve: number | null }) | null;
  const payeLe = l.paye_at ?? (verrou?.jalon_approuve ? verrou.updated_at : null);
  const montant = Number(verrou?.montant_approuve ?? l.montant);
  const suiteDue = ["financer", "financer_normal", "financer_double"].includes(l.suivante_action ?? "");
  const r = await reglagesPaieApi(supabase);
  const peutEcrire = !simuler && r.mode === "on" && !(await automationEnPause(supabase));
  const tenant = tenantDe.get(l.contrat_id) ?? null;

  if (payeLe) {
    // Payée : la semaine suivante est-elle financée ?
    if (suiteDue && !l.semaine_suivante_faite_at && verrou?.plan && verrou.statut === "a_verifier" && peutEcrire) {
      if (!(await prendreVerrou(supabase, semaine, par, 1))) return attente;
      try {
        await jetonValide(supabase, par);
        const issue = await executer(supabase, par, semaine, { ligne: l, tenant, jalons: [], plan: verrou.plan, bloque: null }, verrou);
        if (issue.resultat === "paye") {
          return { ok: true, cas: "financee", texte: remplirTexte(texteReglage(v.paie_reponse_financee_texte, REPONSE_FINANCEE), { NN: NN + 1 }) };
        }
      } finally {
        await supabase.rpc("paie_auto_rendre", { p_semaine: semaine });
      }
      return attente;
    }
    const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", day: "numeric", month: "short" }).format(new Date(payeLe));
    return { ok: true, cas: "deja_payee", texte: remplirTexte(texteReglage(v.paie_reponse_deja_payee_texte, REPONSE_DEJA_PAYEE), { montant: montant.toFixed(2).replace(/\.00$/, ""), NN, date }) };
  }
  // Due et pas payée : payée tout de suite (mêmes garde-fous que la paie automatique).
  if (!peutEcrire) return attente;
  const { data: etatAuto } = await supabase.from("paie_auto").select("canari_ok").eq("semaine", semaine).maybeSingle();
  if (!etatAuto?.canari_ok) return attente;
  if (!(await prendreVerrou(supabase, semaine, par, 1))) return attente;
  try {
    return await payerQuestion(supabase, par, semaine, l, verrou, tenant, r, v, NN) ?? attente;
  } finally {
    await supabase.rpc("paie_auto_rendre", { p_semaine: semaine });
  }
}

/**
 * Prompt 26 : la paie d'un posteur vue chez Upwork (lecture seule) : la
 * milestone de la semaine payée (« Week w » payée) ou la suivante financée
 * (« Week w+1 » financée). null : rien de sûr.
 */
async function semaineVueSurUpwork(
  supabase: Supabase,
  par: string | null,
  posterId: string,
  semaine: string,
): Promise<{ cas: "payee"; montant: number } | { cas: "financee" } | null> {
  const { data: pr } = await supabase.from("profiles").select("upwork_contract_id").eq("id", posterId).maybeSingle();
  const contrat = (pr?.upwork_contract_id as string | null) ?? null;
  if (!contrat) return null;
  const { data: uc } = await supabase.from("upwork_contrats").select("organisation_id").eq("contrat_id", contrat).maybeSingle();
  const tenant = (uc?.organisation_id as string | null) ?? null;
  if (!tenant) return null;
  await jetonValide(supabase, par);
  const relu = await relireJalons(supabase, par, contrat, tenant, "paie_question_jalons");
  if (!relu.jalons) return null;
  const w = numeroSemaine(semaine);
  const payee = relu.jalons.find((j) => semaineDuNom(j.nom) === w && PAYEES.includes(j.etat));
  const montant = Number(payee?.paye ?? payee?.depot ?? 0);
  if (payee && montant > 0) return { cas: "payee", montant };
  const n = numeroSemaine(ajouterJours(semaine, 7));
  if (relu.jalons.some((j) => semaineDuNom(j.nom) === n && ETATS_FINANCES.includes(j.etat))) return { cas: "financee" };
  return null;
}

async function payerQuestion(
  supabase: Supabase,
  par: string | null,
  semaine: string,
  l: LigneAuto,
  verrou: PaiementApi | null,
  tenant: string | null,
  r: ReglagesPaieApi,
  v: Record<string, unknown>,
  NN: number,
) {
  await jetonValide(supabase, par);
  const issue = verrou
    ? (verrou.statut === "a_verifier" && verrou.reessai
      ? await executer(supabase, par, semaine, verrou.plan ? { ligne: l, tenant, jalons: [], plan: verrou.plan, bloque: null } : await planLigne(supabase, par, semaine, l, tenant, r), verrou)
      : { resultat: "a_verifier" as const })
    : await executer(supabase, par, semaine, await planLigne(supabase, par, semaine, l, tenant, r), null);
  if (issue.resultat === "paye" || issue.resultat === "deja_payee") {
    const paye = ("plan" in issue ? issue.plan?.approuver?.montant : null) ?? l.montant;
    return { ok: true, cas: "payee", texte: remplirTexte(texteReglage(v.paie_reponse_payee_texte, REPONSE_PAYEE), { montant: paye.toFixed(2).replace(/\.00$/, ""), NN }) };
  }
  return null;
}

const REPONSE_PAYEE = "You've been paid ${montant} for week {NN}.";
const REPONSE_DEJA_PAYEE = "You were paid ${montant} for week {NN} on {date}. It can take a few days to show in your Upwork balance.";
const REPONSE_FINANCEE = "Your milestone for week {NN} is now funded.";

/** La raison de fin de contrat (réglage `arret_raison_upwork`, 107 par défaut). */
async function raisonFin(supabase: Supabase): Promise<string> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "arret_raison_upwork").maybeSingle();
  return typeof data?.valeur === "string" && data.valeur.trim() ? data.valeur.trim() : RAISON_FIN_DEFAUT;
}

/**
 * Un même posteur peut avoir 2 comptes, donc 2 fiches sur un seul contrat
 * Upwork (0410). Arrêter une fiche ne touche pas au contrat tant qu'une autre
 * fiche active l'utilise.
 */
async function contratPartage(supabase: Supabase, contratId: string, saufPoster: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("id").eq("upwork_contract_id", contratId).eq("is_active", true)
    .neq("id", saufPoster).limit(1);
  return (data ?? []).length > 0;
}

/** Fermer un contrat par l'API (endContractByClient), un seul essai. */
async function fermerContrat(
  supabase: Supabase,
  par: string | null,
  contratId: string,
  tenant: string | null,
  raison: string,
  saufPoster: string,
): Promise<{ ferme: boolean; raison: string | null }> {
  if (await contratPartage(supabase, contratId, saufPoster)) {
    return { ferme: false, raison: "contrat partagé avec un autre compte actif du posteur : pas fermé" };
  }
  const r = await ecrire(supabase, {
    par,
    action: "fermer_contrat",
    query: MUTATION_FERMER_CONTRAT,
    variables: { contractId: contratId, input: { reasonRef: raison } },
    tenant,
    contrat: contratId,
  });
  return r.data?.endContractByClient?.success === true
    ? { ferme: true, raison: null }
    : { ferme: false, raison: `fermeture : ${r.erreur ?? "non confirmée par Upwork"}` };
}

/**
 * Le Kill payé (partie F) : on relit les milestones ; s'il ne reste rien de
 * financé, le contrat est fermé, coché « Ended » dans Contracts to end, et
 * l'étape « paie » de son arrêt complet passe faite. Sinon : à vérifier
 * (une milestone financée reste à rembourser à la main).
 */
async function fermerApresPaiement(
  supabase: Supabase,
  par: string | null,
  semaine: string,
  posterId: string,
  contratId: string,
  tenant: string | null,
): Promise<{ ferme: boolean; raison: string | null }> {
  const relu = await lire(supabase, { par, action: "kill_relire_jalons", query: REQUETE_JALONS, variables: { id: contratId }, tenant });
  if (relu.erreur || !relu.data?.contractDetails) return { ferme: false, raison: `milestones illisibles (${relu.erreur ?? "réponse vide"}) : contrat à fermer à la main` };
  const jalons = lireJalonsContrat(relu.data.contractDetails);
  const plan = planUpwork(jalons);
  if (!plan.fermer) {
    return { ferme: false, raison: plan.rembourser.length ? `encore financé : ${decrireJalons(plan.rembourser)} (à rembourser, puis fermer à la main)` : "aucune milestone lue : contrat à fermer à la main" };
  }
  const fin = await fermerContrat(supabase, par, contratId, tenant, await raisonFin(supabase), posterId);
  if (!fin.ferme) return fin;
  await supabase.from("contrats_fins").upsert({ poster_id: posterId, semaine, termine_par: par }, { onConflict: "poster_id,semaine", ignoreDuplicates: true });
  const { data: arrets } = await supabase.from("arrets").select("id, etapes").eq("poster_id", posterId).order("created_at", { ascending: false }).limit(1);
  const a = arrets?.[0];
  if (a) {
    const etapes = ((a.etapes ?? []) as EtapeArret[]).map((e) =>
      e.action === "paie" && e.statut === "a_faire" ? etape("paie", "fait", "payée par l'API, contrat fermé") : e
    );
    await supabase.from("arrets").update({ etapes, maj_at: new Date().toISOString() }).eq("id", a.id);
  }
  return fin;
}

/** Payée à la main sur Upwork : verrou à 0 $, « déjà payée », case « Payé » cochée. */
async function noterDejaPayee(supabase: Supabase, par: string | null, semaine: string, p: LignePlan): Promise<string> {
  if (!p.ligne.id || !p.ligne.contrat_id) return "rien";
  const { data: id, error } = await supabase.rpc("paie_api_reserver", {
    p_paie_semaine_id: p.ligne.id, p_poster: p.ligne.poster_id, p_semaine: semaine,
    p_contrat: p.ligne.contrat_id, p_montant: 0, p_par: par,
  });
  if (error || !id) return "refuse";
  await supabase.from("paie_paiements_api").update({
    statut: "deja_payee", montant_approuve: p.plan.montant_trouve, erreur: p.plan.raison, updated_at: new Date().toISOString(),
  }).eq("id", id);
  await marquerLignes(supabase, p.ligne.ids.length ? p.ligne.ids : [p.ligne.id], par, "paye");
  return "deja_payee";
}

/** Ce que la clé permet de LIRE, testé sur un contrat actif. Aucune écriture. */
async function testerDroits(supabase: Supabase, par: string | null) {
  const { data: c } = await supabase
    .from("upwork_contrats")
    .select("contrat_id, organisation_id")
    .eq("actif", true)
    .not("contrat_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (!c) return { ok: false, error: "aucun contrat lu : lancer d'abord l'action contrats" };
  const jalons = await lire(supabase, {
    par, action: "droits_jalons", query: REQUETE_JALONS, variables: { id: c.contrat_id }, tenant: c.organisation_id,
  });
  const salon = await lire(supabase, {
    par, action: "droits_salon", query: REQUETE_SALON, variables: { id: c.contrat_id }, tenant: c.organisation_id,
  });
  const resultat = {
    lu_at: new Date().toISOString(),
    contrat_teste: c.contrat_id,
    contrats: true,
    jalons: { ok: Boolean(jalons.data?.contractDetails), erreur: jalons.erreur },
    salon: { ok: Boolean(salon.data?.contractRoom), erreur: salon.erreur },
  };
  const { data: conn } = await supabase.from("upwork_connexion").select("droits").eq("compte", COMPTE).maybeSingle();
  await supabase.from("upwork_connexion").update({ droits: { ...(conn?.droits ?? {}), lectures: resultat } }).eq("compte", COMPTE);
  return { ok: true, ...resultat, apercu_jalons: jalons.data?.contractDetails ?? null };
}

// ---------------------------------------------------------------------------
// Messages (prompt 17) : la conversation du contrat, puis le message
// ---------------------------------------------------------------------------

/** Une ÉCRITURE GraphQL : un seul essai, journalisée, jamais relancée. */
async function ecrire(
  supabase: Supabase,
  o: {
    par: string | null;
    action: string;
    query: string;
    variables: Record<string, unknown>;
    tenant: string | null;
    contrat: string;
    montant?: number | null;
    /** Prompt 25 v4 : les messages peuvent partir du compte de secours ; tout le reste, du compte de Max. */
    compte?: string;
  },
  // deno-lint-ignore no-explicit-any
): Promise<{ data: any; erreur: string | null }> {
  // Prompt 22 : le grand interrupteur passe avant tout (rien n'est écrit sur Upwork).
  if (await bloquer(supabase, { fonction: "upwork", action: o.action, cible: o.contrat })) return { data: null, erreur: PAUSE };
  const jeton = await jetonValide(supabase, o.par, o.compte);
  const debut = Date.now();
  let statut: number | null = null;
  // deno-lint-ignore no-explicit-any
  let valeur: any = null;
  // Un 429 n'a rien fait chez Upwork : on attend ce qu'il demande (Retry-After,
  // prompt 21 B11) et on renvoie une seule fois. Toute autre erreur : jamais.
  for (let essai = 1; essai <= 2; essai++) {
    let retryAfter: string | null = null;
    try {
      const reponse = await fetch(UPWORK_GRAPHQL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${jeton}`,
          "content-type": "application/json",
          ...(o.tenant ? { "X-Upwork-API-TenantId": o.tenant } : {}),
        },
        body: JSON.stringify({ query: o.query, variables: o.variables }),
      });
      statut = reponse.status;
      retryAfter = reponse.headers.get("retry-after");
      valeur = await reponse.json().catch(() => null);
    } catch (e) {
      statut = null;
      valeur = { errors: [{ message: messageErreur(e) }] };
    }
    if (statut === 429) await noter429(supabase, null);
    if (statut !== 429 || essai === 2) break;
    await new Promise((r) => setTimeout(r, attenteRetryAfter(retryAfter) ?? 5_000));
  }
  const erreur = statut !== null && statut >= 400
    ? `HTTP ${statut}${erreurGraphql(valeur) ? ` : ${erreurGraphql(valeur)}` : ""}`
    : erreurGraphql(valeur) ?? (statut === null ? "réseau" : null);
  await noter(supabase, {
    par: o.par,
    action: o.action,
    contrat: o.contrat,
    montant: o.montant ?? null,
    requete: { query: o.query, variables: o.variables, tenant: o.tenant },
    reponse: valeur,
    erreur,
    statut,
    duree: Date.now() - debut,
    compte: o.compte,
  });
  return { data: valeur?.data ?? null, erreur };
}

/**
 * « Send on Upwork » (page Pipeline, Relances) : le texte, dans la conversation
 * du contrat du posteur, une fois, puis noté dans `nudges` (canal upwork, à la
 * main) : il apparaît dans l'historique et compte comme une relance.
 */
async function messagePosteur(supabase: Supabase, par: string | null, posterId: string, texte: string, type: unknown) {
  if (!posterId || !texte.trim()) return { ok: false, error: "poster_id et texte requis" };
  const { data: p } = await supabase.from("profiles").select("upwork_contract_id").eq("id", posterId).maybeSingle();
  const contrat = p?.upwork_contract_id as string | undefined;
  if (!contrat) return { ok: false, error: "contrat Upwork non relié à ce posteur" };
  const envoi = await envoyerMessage(supabase, par, contrat, texte.trim());
  if (!envoi.ok) return envoi;
  await supabase.from("nudges").insert({
    poster_id: posterId,
    type: typeof type === "string" && type.trim() ? `${type.trim()}_upwork` : "manuel_upwork",
    canal: "upwork",
    texte: texte.trim(),
    cible: "manuel",
    envoye_par: par,
  });
  return envoi;
}

/**
 * Prompt 25 : Upwork bloque après un nombre de conversations par jour (« maximum
 * number of rooms … in one day », 50 le 29/10). Au plus `upwork_conversations_jour_max`
 * (45) conversations distinctes par jour (UTC) et par compte ; relances et nudges
 * s'arrêtent `upwork_reserve_prioritaire` (5) avant, pour la bienvenue, le Kill
 * et l'arrêt. Écrire à une conversation déjà écrite aujourd'hui ne compte pas.
 * Après l'erreur de limite d'Upwork : plus rien sur ce compte jusqu'au
 * lendemain. 1 message par seconde au plus.
 * Prompt 25 v4 : Max d'abord, puis Adrien (« secours ») ; une personne garde
 * le même compte toute la journée (_shared/upwork_comptes.ts). Rend le compte,
 * ou l'erreur si rien ne peut partir aujourd'hui.
 */
async function compteDuMessage(
  supabase: Supabase,
  contratId: string,
  prioritaire: boolean,
  exclure: string[] = [],
): Promise<{ compte: string; erreur: null } | { compte: null; erreur: string }> {
  const { data, error } = await supabase.rpc("upwork_budget_jour", { p_contrat: contratId });
  if (error) return { compte: null, erreur: `budget Upwork illisible : ${error.message}` };
  const b = data as { max: number; reserve: number; dernier_ms: number | null; comptes?: CompteDuJour[] };
  const choix = choisirCompte(b.comptes ?? [], { max: b.max, reserve: b.reserve, prioritaire, exclure });
  if (choix.compte === null) return { compte: null, erreur: choix.raison };
  if (b.dernier_ms !== null && b.dernier_ms < 1_000) await new Promise((r) => setTimeout(r, 1_000 - b.dernier_ms!));
  return { compte: choix.compte, erreur: null };
}

async function envoyerMessage(
  supabase: Supabase,
  par: string | null,
  contratId: string,
  texte: string,
  o: { prioritaire?: boolean; exclure?: string[]; forcer?: string } = {},
): Promise<{ ok: boolean; error?: string; budget?: boolean; reporter?: boolean; story_id?: string; compte?: string }> {
  if (!contratId || !texte.trim()) return { ok: false, error: "contrat_id et texte requis" };
  // Run now (contrat de test) : le compte de secours, forcé ; sinon Adrien d'abord, puis Max (prompt 25 MAJ).
  const choix = o.forcer ? { compte: o.forcer, erreur: null } : await compteDuMessage(supabase, contratId, o.prioritaire !== false, o.exclure);
  if (choix.compte === null) return { ok: false, error: choix.erreur, budget: true };
  const compte = choix.compte;
  const { data: c } = await supabase
    .from("upwork_contrats")
    .select("organisation_id")
    .eq("contrat_id", contratId)
    .maybeSingle();
  const tenant = (c?.organisation_id as string | undefined) ?? null;
  // La conversation se lit avec le compte de Max (propriétaire), sinon avec celui qui écrit.
  let salon = await lire(supabase, { par, action: "message_salon", query: REQUETE_SALON, variables: { id: contratId }, tenant });
  if (!salon.data?.contractRoom?.id && compte !== COMPTE) {
    salon = await lire(supabase, { par, action: "message_salon", query: REQUETE_SALON, variables: { id: contratId }, tenant, compte });
  }
  const roomId = salon.data?.contractRoom?.id as string | undefined;
  if (!roomId) return { ok: false, error: salon.erreur ?? "conversation du contrat introuvable" };
  const poster = () =>
    ecrire(supabase, { par, action: "message", query: MUTATION_MESSAGE, variables: { input: { roomId, message: texte } }, tenant, contrat: contratId, compte });
  let r = await poster();
  let storyId = r.data?.createRoomStoryV2?.id as string | undefined;
  if (storyId) return { ok: true, story_id: storyId, compte };
  // Prompt 25 MAJ : Adrien d'abord. Il n'a pas pu écrire : Max l'ajoute à la conversation et un seul
  // nouvel essai ; sinon (ou limite d'Upwork) Max prend le relais (une fois). Max plein : la HM.
  const relais = !o.forcer && !(o.exclure ?? []).includes(COMPTE);
  if (compte === COMPTE_SECOURS && r.erreur !== PAUSE) {
    let ajout: string | null = null;
    if (!estLimiteUpwork(r.erreur)) {
      ajout = await ajouterSecoursAuSalon(supabase, par, roomId, tenant, contratId);
      if (!ajout) {
        r = await poster();
        storyId = r.data?.createRoomStoryV2?.id as string | undefined;
        if (storyId) return { ok: true, story_id: storyId, compte };
      }
      await noter(supabase, {
        par, action: "message_secours_echec", contrat: contratId, compte,
        erreur: `compte de secours : ${r.erreur ?? "message non confirmé"}${ajout ? ` ; ajout à la conversation : ${ajout}` : ""}${relais ? " — relais par le compte principal" : ""}`,
      });
    }
    if (relais) return await envoyerMessage(supabase, par, contratId, texte, { ...o, exclure: [...(o.exclure ?? []), COMPTE_SECOURS] });
    return { ok: false, error: `compte de secours : ${r.erreur ?? "message non confirmé"}`, budget: estLimiteUpwork(r.erreur), compte };
  }
  return { ok: false, error: r.erreur ?? "message non confirmé par Upwork", budget: estLimiteUpwork(r.erreur), compte };
}

/** addUserToRoom (par le compte de Max, propriétaire) : Adrien entre dans la conversation. Rend l'erreur, ou null. */
async function ajouterSecoursAuSalon(supabase: Supabase, par: string | null, roomId: string, tenant: string | null, contratId: string): Promise<string | null> {
  const { data: conn } = await supabase.from("upwork_connexion").select("utilisateur").eq("compte", COMPTE_SECOURS).maybeSingle();
  const userId = (conn?.utilisateur as { id?: string } | null)?.id;
  if (!userId) return "id Upwork d'Adrien inconnu (Diagnostic du compte de secours)";
  if (!tenant) return "organisation du contrat inconnue";
  const r = await ecrire(supabase, {
    par,
    action: "message_ajout_secours",
    query: MUTATION_AJOUT_SALON,
    variables: { roomId, users: [{ userId, organizationId: tenant, role: "participant" }] },
    tenant,
    contrat: contratId,
  });
  return r.data?.addUserToRoom === true ? null : r.erreur ?? "ajout non confirmé par Upwork";
}

const MUTATION_AJOUT_SALON = `mutation AjoutSalon($roomId: ID!, $users: [RoomUserInput!]!) { addUserToRoom(roomId: $roomId, roomUsers: $users) }`;

// ---------------------------------------------------------------------------
// Système du 2 nov., partie A : l'accueil automatique
// ---------------------------------------------------------------------------

/** Le mot de passe de départ, comme sur /embauche ; le posteur le change à sa 1re connexion. */
const MOT_DE_PASSE_DEPART = "12345678";

/** 0470 : un pays absent de la liste des offres ne remplace pas celui lu sur le profil du freelance. */
function sansPaysVide<T extends { freelancer_pays: string | null }>(c: T): Omit<T, "freelancer_pays"> | T {
  if (c.freelancer_pays) return c;
  const { freelancer_pays: _vide, ...reste } = c;
  return reste;
}

/** 0470 : « Lives in Lithuania, job post Croatia ». */
function ecartPays(e: { vit: string; annonce: string } | undefined): string | null {
  if (!e) return null;
  const nom = (c: string) => {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? c;
    } catch {
      return c;
    }
  };
  return `Lives in ${nom(e.vit)}, job post ${nom(e.annonce)}`;
}

interface Localisation {
  pays: string | null;
  pays_brut: string | null;
  ville: string | null;
  requete: string | null;
  essais: { requete: string; erreur: string | null; pays: string | null }[];
}

/**
 * 0470 : où vit le freelance (lecture seule), avec l'id freelancer du contrat.
 * Les requêtes de REQUETES_LOCALISATION, dans l'ordre ; la première qui rend un
 * pays gagne. Rien n'est écrit sur Upwork.
 */
async function lireLocalisation(
  supabase: Supabase,
  par: string | null,
  o: { contrat: string; freelancer: string | null; tenant: string | null },
): Promise<Localisation> {
  const essais: Localisation["essais"] = [];
  for (const q of REQUETES_LOCALISATION) {
    const id = q.variable === "contrat" ? o.contrat : o.freelancer;
    if (!id) {
      essais.push({ requete: q.nom, erreur: "id freelancer inconnu", pays: null });
      continue;
    }
    const r = await lire(supabase, { par, action: "freelance_localisation", query: q.query, variables: { id }, tenant: o.tenant });
    const l = r.data ? q.lire(r.data) : { pays: null, ville: null };
    const code = codePays(l.pays);
    essais.push({ requete: q.nom, erreur: r.erreur ?? (l.pays ? null : "aucun pays dans la réponse"), pays: code ?? l.pays });
    if (code) return { pays: code, pays_brut: l.pays, ville: l.ville, requete: q.nom, essais };
  }
  return { pays: null, pays_brut: null, ville: null, requete: null, essais };
}

/** 0470 : les HM de l'OS (actives), pour relier la HM du contrat par son nom Upwork. */
async function hmsDeLOs(supabase: Supabase): Promise<{ id: string; prenom: string | null; nom: string | null }[]> {
  const { data: roles } = await supabase.from("user_roles").select("user_id").in("role", ["hiring_manager", "head_of_ops"]);
  const ids = (roles ?? []).map((r) => String(r.user_id));
  if (ids.length === 0) return [];
  const { data } = await supabase.from("profiles").select("id, prenom, nom, is_active").in("id", ids).eq("is_active", true);
  return (data ?? []).filter((p) => normaliserNom(p.prenom) !== "ruul").map((p) => ({ id: String(p.id), prenom: p.prenom, nom: p.nom }));
}

/** 0470 : la HM de l'OS du contrat : hiringManager, sinon supervisor ; une correspondance notée à la main (hm_upwork) d'abord. */
function hmDuContrat(
  d: { hm_upwork_id: string | null; hm_upwork_nom?: string | null; superviseur_upwork_id?: string | null; superviseur_upwork_nom?: string | null },
  hms: { id: string; prenom: string | null; nom: string | null }[],
  notees: Map<string, string>,
): { hm_id: string | null; hm_nom: string | null } {
  for (const [id, nom] of [[d.hm_upwork_id, d.hm_upwork_nom], [d.superviseur_upwork_id, d.superviseur_upwork_nom]] as const) {
    const trouve = (id && notees.get(id)) || hmDeNomUpwork(nom, hms);
    if (trouve) return { hm_id: trouve, hm_nom: nom ?? null };
  }
  return { hm_id: null, hm_nom: d.hm_upwork_nom ?? d.superviseur_upwork_nom ?? null };
}

/**
 * 0470 : ce que l'API dit d'un contrat à accueillir : la HM (hiringManager /
 * supervisor, avec leurs noms) et le pays du freelance. Lu une fois par
 * contrat (accueils.freelance_lu_at), ou à nouveau sur demande (forcer).
 */
async function lireInfosContrat(
  supabase: Supabase,
  par: string | null,
  c: { contrat_id: string; organisation_id: string | null },
  // deno-lint-ignore no-explicit-any
  connu: any | null,
  forcer: boolean,
): Promise<{ details: DetailsContrat | null; loc: Localisation | null; erreur: string | null }> {
  if (connu?.freelance_lu_at && !forcer) return { details: null, loc: null, erreur: null };
  const lu = await lire(supabase, {
    par, action: "accueil_contrat", query: REQUETE_DETAILS_CONTRAT, variables: { id: c.contrat_id }, tenant: c.organisation_id,
  });
  const details = lireDetailsContrat(lu.data?.contractDetails);
  if (!details) return { details: null, loc: null, erreur: lu.erreur ?? "contrat illisible" };
  const { data: uc } = await supabase.from("upwork_contrats").select("freelancer_id").eq("contrat_id", c.contrat_id).limit(1).maybeSingle();
  const loc = await lireLocalisation(supabase, par, {
    contrat: c.contrat_id, freelancer: details.freelancer_id ?? (uc?.freelancer_id as string | null) ?? null, tenant: c.organisation_id,
  });
  if (loc.pays) {
    await supabase.from("upwork_contrats").update({ freelancer_pays: loc.pays, freelancer_ville: loc.ville }).eq("contrat_id", c.contrat_id);
  }
  return { details, loc, erreur: null };
}

/** Les champs 0470 d'un accueil, depuis ce qui vient d'être lu (ou ce qui était noté). */
function champsInfos(
  details: DetailsContrat | null,
  loc: Localisation | null,
): Record<string, unknown> {
  if (!details || !loc) return {};
  return {
    hm_upwork_nom: details.hm_upwork_nom ?? null,
    superviseur_upwork_id: details.superviseur_upwork_id ?? null,
    superviseur_upwork_nom: details.superviseur_upwork_nom ?? null,
    freelance_pays: loc.pays,
    freelance_ville: loc.ville,
    freelance_requete: loc.requete ?? `aucune : ${loc.essais.map((e) => `${e.requete} (${e.erreur ?? "?"})`).join(" ; ")}`.slice(0, 500),
    freelance_lu_at: new Date().toISOString(),
  };
}

async function accueillir(supabase: Supabase, par: string | null) {
  const { data: regl } = await supabase
    .from("reglages")
    .select("cle, valeur")
    .in("cle", ["accueil_auto", "accueil_contrats_depuis", "accueil_message_texte", "slack_lien_invitation"]);
  const v = Object.fromEntries((regl ?? []).map((r) => [r.cle as string, r.valeur]));
  // Prompt 25 MAJ : plus de mode Approve (un ancien « approve » se lit comme test).
  const mode = lireModeAuto(v.accueil_auto);

  // 1. Les contrats actifs, relus (lecture seule) ; chaque posteur sans
  // contrat est relié au sien (0409), toujours, même en test ou sur off.
  const lecture = await lireContrats(supabase, par);
  const { data: relies, error: errRelier } = await supabase.rpc("contrats_relier");
  const reliage = { relies: (relies ?? []).length, erreur_relier: errRelier?.message ?? null };
  if (mode === "off") return { ok: true, mode, ignore: "accueil_auto = off", ...reliage };
  // Prompt 22 : en pause, ni posteur créé ni bienvenue envoyée ; repris au passage suivant.
  if (await automationEnPause(supabase)) {
    await noterBloquee(supabase, { fonction: "upwork", action: "accueil" });
    return { ok: true, mode, ignore: PAUSE, ...reliage };
  }
  const depuis = typeof v.accueil_contrats_depuis === "string" ? v.accueil_contrats_depuis : null;
  if (!depuis) return { ok: false, error: "accueil_contrats_depuis absent" };
  const modele = typeof v.accueil_message_texte === "string" ? v.accueil_message_texte : "";
  // Prompt 21, C8 : un seul lien Slack, le réglage slack_lien_invitation (plus de lien écrit en dur).
  const slack = typeof v.slack_lien_invitation === "string" ? v.slack_lien_invitation.trim() : "";

  const { data: nouveaux, error } = await supabase
    .from("upwork_contrats")
    .select("contrat_id, organisation_id, offre_id, debut_at")
    .eq("actif", true)
    .in("organisation_id", [...ORGS_OS])
    .not("contrat_id", "is", null)
    .gte("debut_at", depuis);
  if (error) throw error;
  const ids = (nouveaux ?? []).map((c) => String(c.contrat_id));
  const { data: connus } = ids.length
    ? await supabase.from("accueils").select("*").in("contrat_id", ids)
    : { data: [] };
  const connuDe = new Map((connus ?? []).map((a) => [String(a.contrat_id), a]));
  const [{ data: profils }, { data: comptesPays }, hms, { data: hmNotees }] = await Promise.all([
    supabase.from("profiles").select("id, prenom, nom, is_active, upwork_contract_id"),
    supabase.from("comptes").select("poster_id, pays, langue").not("pays", "is", null),
    hmsDeLOs(supabase),
    supabase.from("hm_upwork").select("upwork_id, hm_id").not("hm_id", "is", null),
  ]);
  const notees = new Map((hmNotees ?? []).map((h) => [String(h.upwork_id), String(h.hm_id)]));
  const languesPays = (comptesPays ?? []).map((c) => ({ pays: c.pays as string | null, langue: c.langue as string | null }));
  // 0470 : au plus 30 contrats relus à l'API par passage (HM et pays du freelance), les autres au suivant.
  let lecturesApi = 0;
  const paysDe = new Map((comptesPays ?? []).map((c) => [String(c.poster_id), String(c.pays)]));
  const posteurs: PosteurExistant[] = (profils ?? []).map((p) => ({
    id: p.id, prenom: p.prenom, nom: p.nom, is_active: p.is_active, upwork_contract_id: p.upwork_contract_id,
    pays: paysDe.get(p.id) ?? null,
  }));

  // Prompt 25 v4 (0440) : sur un contrat de test, la bienvenue part pour de vrai même sur Test ou Approve.
  const { data: tests } = await supabase.from("contrats_test").select("contrat_id, poster_id").is("retire_at", null);
  const testDe = new Map((tests ?? []).map((x) => [String(x.contrat_id), (x.poster_id as string | null) ?? null]));

  const bilan = { mode, contrats: lecture.organisations, ...reliage, nouveaux: ids.length, crees: 0, simules: 0, a_relier: 0, doublons: 0, erreurs: [] as string[] };
  for (const c of nouveaux ?? []) {
    const contratId = String(c.contrat_id);
    const test = testDe.has(contratId);
    // Le posteur TEST de ce contrat existe déjà (Overview → Test contracts) : rien à créer.
    if (test && testDe.get(contratId)) continue;
    const connu = connuDe.get(contratId);
    // Déjà traité : jamais repris (créé, envoi en cours ou fait, doublon, erreur). Sauf (prompt 25, 16) :
    // une recrue déjà créée par la HM, notée « doublon » avant le passage sur On, sans bienvenue :
    // sur On, la bienvenue part quand même (accueillirExistant).
    if (connu && ["cree", "envoi", "envoye", "doublon", "erreur"].includes(connu.statut) && !bienvenueARattraper(connu, mode)) continue;
    // À relier : le plan est refait à chaque passage (sans appel à Upwork) ; si
    // l'annonce a reçu son pays depuis, le contrat est accueilli.

    // 0470 : la HM du contrat (hiringManager / supervisor) et le pays du freelance, lus une fois.
    if (!connu?.freelance_lu_at && lecturesApi >= 30) continue;
    if (!connu?.freelance_lu_at) lecturesApi++;
    const infos = await lireInfosContrat(supabase, par, { contrat_id: contratId, organisation_id: c.organisation_id }, connu ?? null, false);
    if (infos.erreur) {
      bilan.erreurs.push(`${contratId} : ${infos.erreur}`);
      // Déjà connu : le plan est refait avec ce qui est noté (relu au passage suivant).
      if (!connu) continue;
    }
    const lu0470 = champsInfos(infos.details, infos.loc);
    const details: DetailsContrat = infos.details
      ? { ...infos.details, prenom: infos.details.prenom ?? connu?.prenom ?? null, nom: infos.details.nom ?? connu?.nom ?? null }
      : {
        contrat_id: contratId, offre_id: connu.offre_id, job_id: connu.job_id, job_titre: connu.job_titre,
        prenom: connu.prenom, nom: connu.nom, debut_at: connu.debut_at, hm_upwork_id: connu.hm_upwork_id, statut: null,
        hm_upwork_nom: connu.hm_upwork_nom, superviseur_upwork_id: connu.superviseur_upwork_id, superviseur_upwork_nom: connu.superviseur_upwork_nom,
      };
    const freelancePays = (lu0470.freelance_pays as string | null | undefined) ?? connu?.freelance_pays ?? null;
    const hmContrat = hmDuContrat(details, hms, notees);
    const api: InfosApi = {
      freelance_pays: freelancePays,
      freelance_langue: langueDePays(freelancePays, languesPays),
      hm_id: hmContrat.hm_id,
      hm_nom: hmContrat.hm_nom,
    };
    // L'annonce : vue pour la 1re fois → notée, pays à dire.
    let annonce: Annonce | null = null;
    let errAnnonce: string | null = null;
    if (details.job_id) {
      const { data: a, error: errLu } = await supabase.from("annonces_pays").select("job_id, pays, langue, hm_id, tarif, generique").eq("job_id", details.job_id).maybeSingle();
      if (a) annonce = { ...a, tarif: a.tarif === null ? null : Number(a.tarif) } as Annonce;
      else {
        const { error: errIns } = await supabase.from("annonces_pays").upsert(
          { job_id: details.job_id, titre: details.job_titre },
          { onConflict: "job_id", ignoreDuplicates: true },
        );
        errAnnonce = errLu?.message ?? errIns?.message ?? null;
        if (errAnnonce) bilan.erreurs.push(`annonce ${details.job_id} : ${errAnnonce}`);
      }
    }
    const plan = planAccueil(
      details,
      annonce,
      connu ? { statut: connu.statut, pays: connu.pays, langue: connu.langue, hm_id: connu.hm_id, relie_at: connu.relie_at } : null,
      posteurs,
      api,
    );
    if (errAnnonce && plan.raison) plan.raison = `${plan.raison} (annonce non notée : ${errAnnonce})`;
    const base = {
      contrat_id: contratId, organisation_id: c.organisation_id, offre_id: details.offre_id ?? c.offre_id, job_id: details.job_id,
      job_titre: details.job_titre, prenom: details.prenom, nom: details.nom, debut_at: details.debut_at ?? c.debut_at,
      hm_upwork_id: details.hm_upwork_id, pays: plan.pays, langue: plan.langue, hm_id: plan.hm_id, tarif: plan.tarif,
      ...lu0470, pays_source: plan.source ?? null, ecart_pays: ecartPays(plan.ecart),
      updated_at: new Date().toISOString(),
    };
    if (plan.statut === "doublon") {
      // Prompt 25 MAJ : la recrue déjà créée par la HM. Jamais un 2e profil : le contrat est relié au sien
      // et la bienvenue part quand même (un message en double n'est pas grave).
      if (plan.poster_id && (mode === "on" || test)) {
        const r = await accueillirExistant(supabase, par, base, plan.poster_id, modele, slack);
        if (r.erreur) bilan.erreurs.push(`${contratId} : ${r.erreur}`);
        else bilan.crees++;
        continue;
      }
      await supabase.from("accueils").upsert({ ...base, statut: "doublon", raison: plan.raison });
      bilan.doublons++;
      continue;
    }
    if (plan.statut === "a_relier") {
      await supabase.from("accueils").upsert({ ...base, statut: "a_relier", raison: plan.raison });
      bilan.a_relier++;
      continue;
    }
    // Prompt 25 MAJ, point 3 : acceptée au plus tard le samedi à 23 h 59, heure de Paris (pour tout le monde).
    const { data: lundi } = await supabase.rpc("cohorte_lundi_de_pays", {
      p_at: new Date(base.debut_at ?? Date.now()).toISOString(),
      p_pays: null,
    });
    const cohorte = String(lundi ?? "");
    if (test) {
      // Un contrat de test : le posteur s'appelle « TEST {prénom} ».
      base.prenom = `TEST ${(base.prenom ?? "").trim()}`.trim();
    }
    if (mode === "test" && !test) {
      // Test : le plan et le message, sans rien créer ni envoyer.
      await supabase.from("accueils").upsert({
        ...base, statut: "simule", raison: "test : rien n'est créé ni envoyé", cohorte_lundi: cohorte || null,
        message_texte: messageAccueil(modele, {
          prenom: details.prenom, url: OS_URL, email: "(login créé à la création)", mot_de_passe: MOT_DE_PASSE_DEPART,
          slack, guide: GUIDE_POSTER, cohorte_lundi: cohorte, handle: "(@ généré à la création)",
        }),
      });
      bilan.simules++;
      continue;
    }
    // On : la ligne d'abord (« envoi »), pour qu'un 2e passage ne recrée rien.
    const { error: errVerrou } = await supabase.from("accueils").upsert({ ...base, statut: "envoi", raison: "création en cours", cohorte_lundi: cohorte || null });
    if (errVerrou) {
      bilan.erreurs.push(`${contratId} : ${errVerrou.message}`);
      continue;
    }
    const resultat = await creerEtAccueillir(supabase, par, { ...base, cohorte_lundi: cohorte }, modele, slack);
    if (resultat.erreur) bilan.erreurs.push(`${contratId} : ${resultat.erreur}`);
    else bilan.crees++;
    if (test) {
      const { data: a } = await supabase.from("accueils").select("poster_id").eq("contrat_id", contratId).maybeSingle();
      if (a?.poster_id) await supabase.from("contrats_test").update({ poster_id: a.poster_id }).eq("contrat_id", contratId);
    }
  }
  return { ok: bilan.erreurs.length === 0, ...bilan };
}

/**
 * 0470 : « Show the country found » : pour les contrats à relier (ou ceux
 * donnés), relit à l'API la HM du contrat et le pays du freelance, les note
 * dans accueils et upwork_contrats.freelancer_pays, et dit ce que l'OS ferait.
 * Ne crée aucun posteur et n'envoie rien.
 */
async function localiserAccueils(supabase: Supabase, par: string | null, contrats: string[] | null) {
  let q = supabase.from("accueils").select("*");
  q = contrats?.length ? q.in("contrat_id", contrats) : q.in("statut", ["a_relier", "simule", "a_creer"]);
  const { data: lignes, error } = await q;
  if (error) throw error;
  const [hms, { data: hmNotees }, { data: comptes }, { data: profils }, { data: orgs }] = await Promise.all([
    hmsDeLOs(supabase),
    supabase.from("hm_upwork").select("upwork_id, hm_id").not("hm_id", "is", null),
    supabase.from("comptes").select("poster_id, pays, langue").not("pays", "is", null),
    supabase.from("profiles").select("id, prenom, nom, is_active, upwork_contract_id"),
    supabase.from("upwork_contrats").select("contrat_id, organisation_id, organisation_nom").in("contrat_id", (lignes ?? []).map((l) => l.contrat_id)),
  ]);
  const notees = new Map((hmNotees ?? []).map((h) => [String(h.upwork_id), String(h.hm_id)]));
  const languesPays = (comptes ?? []).map((c) => ({ pays: c.pays as string | null, langue: c.langue as string | null }));
  const paysDe = new Map((comptes ?? []).map((c) => [String(c.poster_id), String(c.pays)]));
  const posteurs: PosteurExistant[] = (profils ?? []).map((p) => ({
    id: p.id, prenom: p.prenom, nom: p.nom, is_active: p.is_active, upwork_contract_id: p.upwork_contract_id, pays: paysDe.get(p.id) ?? null,
  }));
  const orgDe = new Map((orgs ?? []).map((o) => [String(o.contrat_id), o]));
  const nomHm = new Map(hms.map((h) => [h.id, [h.prenom, h.nom].filter(Boolean).join(" ")]));
  await jetonValide(supabase, par);
  const resultats = [];
  for (const a of lignes ?? []) {
    const org = orgDe.get(String(a.contrat_id));
    const tenant = (org?.organisation_id as string | null) ?? (a.organisation_id as string | null) ?? null;
    const infos = await lireInfosContrat(supabase, par, { contrat_id: String(a.contrat_id), organisation_id: tenant }, a, true);
    if (infos.erreur || !infos.details || !infos.loc) {
      resultats.push({ contrat_id: a.contrat_id, nom: [a.prenom, a.nom].filter(Boolean).join(" "), erreur: infos.erreur });
      continue;
    }
    const champs = champsInfos(infos.details, infos.loc);
    const hm = hmDuContrat(infos.details, hms, notees);
    let annonce: Annonce | null = null;
    if (a.job_id) {
      const { data: an } = await supabase.from("annonces_pays").select("job_id, pays, langue, hm_id, tarif, generique").eq("job_id", a.job_id).maybeSingle();
      if (an) annonce = { ...an, tarif: an.tarif === null ? null : Number(an.tarif) } as Annonce;
    }
    const plan = planAccueil(
      { ...infos.details, prenom: infos.details.prenom ?? a.prenom, nom: infos.details.nom ?? a.nom },
      annonce,
      { statut: a.statut, pays: a.pays, langue: a.langue, hm_id: a.hm_id, relie_at: a.relie_at },
      posteurs,
      { freelance_pays: infos.loc.pays, freelance_langue: langueDePays(infos.loc.pays, languesPays), hm_id: hm.hm_id, hm_nom: hm.hm_nom },
    );
    await supabase.from("accueils").update({
      ...champs, pays_source: plan.source ?? null, ecart_pays: ecartPays(plan.ecart), updated_at: new Date().toISOString(),
    }).eq("contrat_id", a.contrat_id);
    // Les noms des HM Upwork vus, pour la correspondance (une HM notée à la main n'est jamais changée).
    for (const [id, nom] of [[infos.details.hm_upwork_id, infos.details.hm_upwork_nom], [infos.details.superviseur_upwork_id, infos.details.superviseur_upwork_nom]]) {
      if (id) await supabase.from("hm_upwork").upsert({ upwork_id: id, nom: nom ?? null, vu_at: new Date().toISOString() }, { onConflict: "upwork_id" });
    }
    resultats.push({
      contrat_id: a.contrat_id,
      nom: [a.prenom, a.nom].filter(Boolean).join(" "),
      equipe: org?.organisation_nom ?? null,
      freelancer_id: infos.details.freelancer_id ?? null,
      freelance: { pays: infos.loc.pays, ville: infos.loc.ville, requete: infos.loc.requete, essais: infos.loc.essais },
      annonce: annonce ? { pays: annonce.pays, generique: annonce.generique } : null,
      hm_contrat: { hiring_manager: infos.details.hm_upwork_nom ?? null, supervisor: infos.details.superviseur_upwork_nom ?? null, hm_os: hm.hm_id ? nomHm.get(hm.hm_id) ?? hm.hm_id : null },
      plan: { statut: plan.statut, pays: plan.pays, langue: plan.langue, source: plan.source ?? null, hm: plan.hm_id ? nomHm.get(plan.hm_id) ?? plan.hm_id : null, raison: plan.raison, ecart: ecartPays(plan.ecart) },
    });
  }
  return { ok: true, contrats: resultats.length, resultats };
}

/**
 * 0470 : la carte « Contract to link » : pays et HM choisis pour le contrat, un
 * clic : le posteur est créé, relié au contrat, la bienvenue part, la carte se
 * ferme. Quel que soit accueil_auto (c'est un clic explicite). L'erreur est
 * rendue telle quelle.
 */
async function creerAccueilMaintenant(
  supabase: Supabase,
  par: string | null,
  o: { contrat: string; pays: string; langue: string | null; hm_id: string | null; tarif?: number | null },
): Promise<{ ok: boolean; error?: string; poster_id?: string | null; statut?: string; raison?: string | null }> {
  const pays = codePays(o.pays);
  if (!o.contrat || !pays) return { ok: false, error: "contrat et pays obligatoires" };
  if (!o.hm_id) return { ok: false, error: "choisis la HM" };
  if (await automationEnPause(supabase)) return { ok: false, error: PAUSE };
  const { data: comptes } = await supabase.from("comptes").select("pays, langue").eq("pays", pays);
  const langue = o.langue || langueDePays(pays, (comptes ?? []) as { pays: string | null; langue: string | null }[]);
  if (!langue) return { ok: false, error: `aucune langue connue pour ${pays} : choisis la langue` };
  const tarif = o.tarif && o.tarif > 0 ? o.tarif : null;
  // Le profil déjà créé par la HM (même contrat) : pas de 2e profil, la bienvenue part avec son login.
  const { data: deja } = await supabase.from("profiles").select("id, prenom, nom, is_active").eq("upwork_contract_id", o.contrat)
    .order("is_active", { ascending: false }).limit(1).maybeSingle();
  if (deja && !deja.is_active) return { ok: false, error: `contrat relié à ${[deja.prenom, deja.nom].filter(Boolean).join(" ")}, profil inactif` };
  // Le verrou : la ligne passe à « envoi » seulement depuis à relier, simulé, à créer, doublon ou erreur.
  const { data: verrou, error: errVerrou } = await supabase.from("accueils").update({
    pays, langue, hm_id: o.hm_id, relie_par: par, relie_at: new Date().toISOString(), pays_source: "main",
    ...(tarif ? { tarif } : {}), statut: "envoi", raison: "création en cours (clic)", updated_at: new Date().toISOString(),
  }).eq("contrat_id", o.contrat).in("statut", ["a_relier", "simule", "a_creer", "doublon", "erreur"]).select("*");
  if (errVerrou) return { ok: false, error: errVerrou.message };
  const a = verrou?.[0];
  if (!a) return { ok: false, error: "contrat introuvable ou déjà en cours de création" };
  const { data: regl } = await supabase.from("reglages").select("cle, valeur").in("cle", ["accueil_message_texte", "slack_lien_invitation"]);
  const v = Object.fromEntries((regl ?? []).map((r) => [r.cle as string, r.valeur]));
  const modele = typeof v.accueil_message_texte === "string" ? v.accueil_message_texte : "";
  const slack = typeof v.slack_lien_invitation === "string" ? v.slack_lien_invitation.trim() : "";
  if (deja) {
    // La HM et le tarif choisis sur la carte, puis la bienvenue (accueillirExistant).
    await supabase.from("profiles").update({ manager_id: o.hm_id, ...(tarif ? { tarif_hebdo: tarif } : {}) }).eq("id", deja.id);
    const r = await accueillirExistant(
      supabase,
      par,
      { contrat_id: o.contrat, organisation_id: a.organisation_id, prenom: a.prenom, nom: a.nom, pays, langue, hm_id: o.hm_id, tarif: tarif ?? a.tarif },
      String(deja.id),
      modele,
      slack,
    );
    const { data: apres } = await supabase.from("accueils").select("statut, raison, poster_id").eq("contrat_id", o.contrat).maybeSingle();
    if (r.erreur) return { ok: false, error: r.erreur, statut: apres?.statut, poster_id: apres?.poster_id ?? null };
    return { ok: true, statut: apres?.statut, raison: apres?.raison ?? null, poster_id: apres?.poster_id ?? null };
  }
  const { data: lundi } = await supabase.rpc("cohorte_lundi_de_pays", { p_at: new Date(a.debut_at ?? Date.now()).toISOString(), p_pays: null });
  const cohorte = String(lundi ?? "");
  await supabase.from("accueils").update({ cohorte_lundi: cohorte || null }).eq("contrat_id", o.contrat);
  const r = await creerEtAccueillir(
    supabase,
    par,
    {
      contrat_id: o.contrat, organisation_id: a.organisation_id, prenom: a.prenom, nom: a.nom, debut_at: a.debut_at,
      pays, langue, hm_id: o.hm_id, tarif: tarif ?? (a.tarif === null ? null : Number(a.tarif)), cohorte_lundi: cohorte,
    },
    modele,
    slack,
  );
  const { data: apres } = await supabase.from("accueils").select("statut, raison, poster_id").eq("contrat_id", o.contrat).maybeSingle();
  if (r.erreur) return { ok: false, error: r.erreur, statut: apres?.statut, poster_id: apres?.poster_id ?? null };
  return { ok: true, statut: apres?.statut, raison: apres?.raison ?? null, poster_id: apres?.poster_id ?? null };
}

/** Prompt 13 : le @ TikTok que la recrue doit créer (son 1er compte perso, généré à la création). */
async function handleACreer(supabase: Supabase, posterId: string): Promise<string | null> {
  const { data } = await supabase.from("comptes").select("handle_tiktok").eq("poster_id", posterId).eq("type_compte", "perso")
    .eq("is_active", true).order("created_at").limit(1).maybeSingle();
  return (data?.handle_tiktok as string | null) ?? null;
}

/** Crée le posteur comme /embauche (manage-users), le relie, puis envoie le message de bienvenue (une fois). */
async function creerEtAccueillir(
  supabase: Supabase,
  par: string | null,
  a: {
    contrat_id: string; organisation_id: string | null; prenom: string | null; nom: string | null; debut_at: string | null;
    pays: string | null; langue: string | null; hm_id: string | null; tarif: number | null; cohorte_lundi: string;
  },
  modele: string,
  slack: string,
): Promise<{ erreur: string | null }> {
  const fin = async (champs: Record<string, unknown>) =>
    await supabase.from("accueils").update({ ...champs, updated_at: new Date().toISOString() }).eq("contrat_id", a.contrat_id);
  const base = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("CRON_SECRET");
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !secret) {
    await fin({ statut: "erreur", raison: "SUPABASE_URL ou CRON_SECRET absent" });
    return { erreur: "SUPABASE_URL ou CRON_SECRET absent" };
  }
  const contratUrl = `https://www.upwork.com/nx/wm/workroom/${a.contrat_id}/overview`;
  // 1. Le posteur, comme sur /embauche : 2 posts par jour, identité générée.
  let cree: { userId?: string; email?: string; error?: string } | null = null;
  try {
    const r = await fetch(`${base}/functions/v1/manage-users`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cron-secret": secret,
        ...(cle ? { authorization: `Bearer ${cle}`, apikey: cle } : {}),
      },
      body: JSON.stringify({
        action: "create",
        prenom: a.prenom ?? "",
        nom: a.nom ?? "",
        password: MOT_DE_PASSE_DEPART,
        langue: a.langue,
        ...(a.pays ? { pays: a.pays } : {}),
        type_compte: "perso",
        posts_par_jour: 2,
        upwork_contrat_url: contratUrl,
      }),
    });
    cree = await r.json().catch(() => null);
    if (!r.ok || !cree?.userId) throw new Error(cree?.error ?? `HTTP ${r.status}`);
  } catch (e) {
    const erreur = `création du posteur : ${messageErreur(e)}`;
    await fin({ statut: "erreur", raison: erreur });
    return { erreur };
  }
  // 2. Relié : HM de l'annonce, contrat, tarif, cohorte depuis le début du contrat.
  await supabase.from("profiles").update({
    manager_id: a.hm_id,
    upwork_contract_id: a.contrat_id,
    upwork_contrat_url: contratUrl,
    offre_acceptee_le: a.debut_at,
    cohorte_lundi: a.cohorte_lundi || null,
    ...(a.tarif ? { tarif_hebdo: a.tarif } : {}),
  }).eq("id", cree.userId);
  await fin({ statut: "cree", raison: null, poster_id: cree.userId, email: cree.email ?? null });
  // 3. Le message de bienvenue, une seule fois (accueils.message_at).
  const texte = messageAccueil(modele, {
    prenom: a.prenom, url: OS_URL, email: cree.email ?? "", mot_de_passe: MOT_DE_PASSE_DEPART, slack, guide: GUIDE_POSTER,
    cohorte_lundi: a.cohorte_lundi, handle: await handleACreer(supabase, cree.userId),
  });
  const envoi = await envoyerMessage(supabase, par, a.contrat_id, texte);
  if (!envoi.ok && envoi.budget) {
    // Prompt 25 v4 (0442) : Upwork plein (Max et Adrien) : la HM envoie la bienvenue à la main aujourd'hui.
    const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
    await supabase.from("relances_prevues").upsert({
      poster_id: cree.userId, type: "accueil", periode: jour, statut: "main", canal: "upwork", texte, raison: "upwork_plein",
      main_at: new Date().toISOString(), main_hm_id: a.hm_id, main_slack_at: null, maj_at: new Date().toISOString(),
      donnees: { contrat: a.contrat_id, cohorte: a.cohorte_lundi || null, email: cree.email ?? null },
    });
    await fin({ statut: "cree", raison: "Upwork plein : bienvenue à envoyer à la main par la HM (To send by hand)", message_texte: texte });
    return { erreur: null };
  }
  if (!envoi.ok) {
    const erreur = `message de bienvenue : ${"error" in envoi ? envoi.error : "non envoyé"}`;
    await fin({ statut: "erreur", raison: erreur, message_texte: texte });
    return { erreur };
  }
  await fin({ statut: "envoye", message_texte: texte, message_at: new Date().toISOString() });
  return { erreur: null };
}

/**
 * Prompt 25 MAJ : le profil existe déjà (créé par la HM, même contrat ou même
 * nom et même pays). Le contrat lui est relié (s'il n'en a pas), la bienvenue
 * part avec son login. Un profil relié à un autre contrat : rien (doublon).
 */
async function accueillirExistant(
  supabase: Supabase,
  par: string | null,
  base: Record<string, unknown> & { contrat_id: string; hm_id: string | null },
  posterId: string,
  modele: string,
  slack: string,
): Promise<{ erreur: string | null }> {
  const { data: p } = await supabase.from("profiles")
    .select("id, prenom, email, cohorte_lundi, upwork_contract_id, must_change_password, is_active")
    .eq("id", posterId).maybeSingle();
  if (!p?.is_active || (p.upwork_contract_id && String(p.upwork_contract_id) !== base.contrat_id)) {
    await supabase.from("accueils").upsert({ ...base, statut: "doublon", raison: "profil existant inactif ou relié à un autre contrat" });
    return { erreur: null };
  }
  if (!p.upwork_contract_id) {
    const { error } = await supabase.from("profiles").update({ upwork_contract_id: base.contrat_id }).eq("id", posterId).is("upwork_contract_id", null);
    if (error) return { erreur: `liaison du contrat : ${error.message}` };
  }
  const cohorte = String(p.cohorte_lundi ?? "");
  await supabase.from("accueils").upsert({
    ...base, statut: "envoi", poster_id: posterId, cohorte_lundi: cohorte || null,
    raison: "recrue déjà créée par la HM : contrat relié, bienvenue envoyée", relie_at: new Date().toISOString(),
  });
  const fin = async (champs: Record<string, unknown>) =>
    await supabase.from("accueils").update({ ...champs, updated_at: new Date().toISOString() }).eq("contrat_id", base.contrat_id);
  const texte = messageAccueil(modele, {
    prenom: (p.prenom as string | null) ?? (base.prenom as string | null) ?? null, url: OS_URL, email: (p.email as string | null) ?? "",
    // Il a peut-être déjà changé son mot de passe : on ne lui en donne pas un faux.
    mot_de_passe: p.must_change_password ? MOT_DE_PASSE_DEPART : "the one you chose", slack, guide: GUIDE_POSTER, cohorte_lundi: cohorte,
    handle: await handleACreer(supabase, posterId),
  });
  const envoi = await envoyerMessage(supabase, par, base.contrat_id, texte);
  if (!envoi.ok && envoi.budget) {
    const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
    await supabase.from("relances_prevues").upsert({
      poster_id: posterId, type: "accueil", periode: jour, statut: "main", canal: "upwork", texte, raison: "upwork_plein",
      main_at: new Date().toISOString(), main_hm_id: base.hm_id, main_slack_at: null, maj_at: new Date().toISOString(),
      donnees: { contrat: base.contrat_id, cohorte: cohorte || null, email: p.email ?? null, existant: true },
    });
    await fin({ statut: "cree", raison: "Upwork plein : bienvenue à envoyer à la main par la HM", message_texte: texte });
    return { erreur: null };
  }
  if (!envoi.ok) {
    const erreur = `message de bienvenue : ${"error" in envoi ? envoi.error : "non envoyé"}`;
    await fin({ statut: "erreur", raison: erreur, message_texte: texte });
    return { erreur };
  }
  await fin({ statut: "envoye", message_texte: texte, message_at: new Date().toISOString() });
  return { erreur: null };
}

// ---------------------------------------------------------------------------
// Vérification quotidienne
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Système du 2 nov., partie A : les annonces depuis les posteurs déjà embauchés
// ---------------------------------------------------------------------------

const REQUETE_ANNONCE_CONTRAT = `query AnnonceContrat($id: ID!) { contractDetails(id: $id) { id job { id content { title } } } }`;

async function amorcerAnnonces(supabase: Supabase, par: string | null) {
  const { data: posteurs, error } = await supabase
    .from("profiles")
    .select("id, manager_id, tarif_hebdo, upwork_contract_id")
    .eq("is_active", true)
    .not("upwork_contract_id", "is", null);
  if (error) throw error;
  const ids = (posteurs ?? []).map((p) => p.id as string);
  const [{ data: comptes }, { data: contrats }, { data: connues }] = await Promise.all([
    supabase.from("comptes").select("poster_id, pays, langue, created_at").in("poster_id", ids).eq("type_compte", "perso")
      .order("created_at"),
    supabase.from("upwork_contrats").select("contrat_id, organisation_id").not("contrat_id", "is", null),
    supabase.from("annonces_pays").select("job_id, pays, generique, maj_par"),
  ]);
  const compteDe = new Map<string, { pays: string | null; langue: string | null }>();
  for (const c of comptes ?? []) if (!compteDe.has(c.poster_id)) compteDe.set(c.poster_id, { pays: c.pays, langue: c.langue });
  const tenantDe = new Map((contrats ?? []).map((c) => [String(c.contrat_id), (c.organisation_id as string | null) ?? null]));

  // Le jeton renouvelé une fois, puis les lectures par paquets de 8.
  await jetonValide(supabase, par);
  const lignes: PosteurAnnonce[] = [];
  const erreurs: string[] = [];
  const liste = posteurs ?? [];
  for (let i = 0; i < liste.length; i += 8) {
    await Promise.all(liste.slice(i, i + 8).map(async (p) => {
      const contrat = String(p.upwork_contract_id);
      const r = await lire(supabase, { par, action: "annonce_contrat", query: REQUETE_ANNONCE_CONTRAT, variables: { id: contrat }, tenant: tenantDe.get(contrat) ?? null });
      const job = r.data?.contractDetails?.job;
      if (!job?.id) {
        erreurs.push(`${contrat} : ${r.erreur ?? "annonce introuvable"}`);
        return;
      }
      const c = compteDe.get(p.id as string);
      lignes.push({
        job_id: String(job.id),
        titre: job.content?.title ?? null,
        pays: c?.pays ?? null,
        langue: c?.langue ?? null,
        hm_id: (p.manager_id as string | null) ?? null,
        tarif: p.tarif_hebdo === null ? null : Number(p.tarif_hebdo),
      });
    }));
  }

  // Une annonce déjà dite (pays, générique ou modifiée à la main) ne change jamais.
  const dites = new Set((connues ?? []).filter((a) => a.pays || a.generique || a.maj_par).map((a) => a.job_id as string));
  const deduites = annoncesDepuisPosteurs(lignes).filter((a) => !dites.has(a.job_id));
  if (deduites.length > 0) {
    const { error: errUp } = await supabase.from("annonces_pays").upsert(
      deduites.map(({ posteurs: _n, ...a }) => ({ ...a, maj_at: new Date().toISOString() })),
      { onConflict: "job_id" },
    );
    if (errUp) throw errUp;
  }
  return {
    ok: erreurs.length === 0,
    posteurs: liste.length,
    lus: lignes.length,
    annonces: deduites.length,
    avec_pays: deduites.filter((a) => a.pays).length,
    generiques: deduites.filter((a) => a.generique).length,
    deja_dites: dites.size,
    erreurs: erreurs.slice(0, 20),
  };
}

// ---------------------------------------------------------------------------
// Système du 2 nov., partie E : les messages des posteurs sur Upwork
// ---------------------------------------------------------------------------

/** La conversation d'un contrat et l'id du freelancer (vérifiés le 28/10 : story.user.id = freelancer.id). */
const REQUETE_SALON_POSTEUR = `query SalonPosteur($id: ID!) {
  contractDetails(id: $id) { id freelancer { id } }
  contractRoom(contractId: $id) { id }
}`;
const REQUETE_MESSAGES_SALON = `query MessagesSalon($r: ID!) {
  roomStories(filter: { roomId_eq: $r }) { edges { node { id createdDateTime message user { id } } } }
}`;

/** Prompt 21, A2 : 5 conversations à la fois au plus (Upwork : 10 requêtes par seconde). */
const REPONSES_EN_PARALLELE = 5;

async function lireReponsesUpwork(supabase: Supabase, par: string | null, posteurs: string[] | null = null) {
  // Toutes les conversations où l'OS a écrit depuis 14 jours (0413) ; `posteurs` : juste avant un Kill.
  const { data: cibles, error } = await supabase.rpc("reponses_cibles_upwork_v2", { p_posteurs: posteurs });
  if (error) throw error;
  const liste = (cibles ?? []) as { poster_id: string; contrat_id: string; organisation_id: string | null; depuis: string }[];
  const bilan = { cibles: liste.length, nouveaux: 0, erreurs: [] as string[], posteurs_nouveaux: [] as string[] };
  const lireUne = async (c: (typeof liste)[number]) => {
    try {
      const salon = await lire(supabase, { par, action: "reponses_salon", query: REQUETE_SALON_POSTEUR, variables: { id: c.contrat_id }, tenant: c.organisation_id });
      const roomId = salon.data?.contractRoom?.id as string | undefined;
      const freelancer = salon.data?.contractDetails?.freelancer?.id as string | undefined;
      if (!roomId || !freelancer) {
        bilan.erreurs.push(`${c.contrat_id} : ${salon.erreur ?? "conversation introuvable"}`);
        return;
      }
      const msgs = await lire(supabase, { par, action: "reponses_messages", query: REQUETE_MESSAGES_SALON, variables: { r: roomId }, tenant: c.organisation_id });
      if (msgs.erreur) {
        bilan.erreurs.push(`${c.contrat_id} : ${msgs.erreur}`);
        return;
      }
      const depuis = new Date(c.depuis).getTime();
      // deno-lint-ignore no-explicit-any
      const nouveaux = ((msgs.data?.roomStories?.edges ?? []) as any[])
        .map((e) => e?.node)
        .filter((n) => n?.id && n.user?.id === freelancer && String(n.message ?? "").trim() && new Date(n.createdDateTime).getTime() > depuis);
      for (const n of nouveaux) {
        const { error: errIns } = await supabase.from("posteur_reponses").insert({
          poster_id: c.poster_id,
          canal: "upwork",
          source_id: String(n.id),
          texte: String(n.message).slice(0, 4000),
          recu_at: new Date(n.createdDateTime).toISOString(),
        });
        if (!errIns) {
          bilan.nouveaux++;
          if (!bilan.posteurs_nouveaux.includes(c.poster_id)) bilan.posteurs_nouveaux.push(c.poster_id);
        } else if (errIns.code !== "23505") bilan.erreurs.push(`${c.contrat_id} : ${errIns.message}`);
      }
    } catch (e) {
      bilan.erreurs.push(`${c.contrat_id} : ${messageErreur(e)}`);
    }
  };
  for (let i = 0; i < liste.length; i += REPONSES_EN_PARALLELE) {
    await Promise.all(liste.slice(i, i + REPONSES_EN_PARALLELE).map(lireUne));
  }
  return { ok: bilan.erreurs.length === 0, ...bilan };
}

/**
 * Prompt 27 : la conversation Upwork de chaque contrat actif (masterlist,
 * colonne Context). Lecture seule : les 10 derniers messages des deux côtés
 * sont gardés dans `upwork_salons`, sans rien classer ni répondre. Le salon
 * (room) est retenu après la 1re lecture : une seule requête ensuite.
 */
/** Les derniers messages de la conversation d'un contrat (lecture seule) → upwork_salons. null : lu. */
async function lireSalon(
  supabase: Supabase,
  par: string | null,
  c: { poster_id: string | null; contrat_id: string; organisation_id: string | null; room_id: string | null; freelance_id: string | null },
): Promise<string | null> {
  const noter = async (champs: Record<string, unknown>) =>
    await supabase.from("upwork_salons").upsert({ contrat_id: c.contrat_id, poster_id: c.poster_id, lu_at: new Date().toISOString(), ...champs });
  try {
    let room = c.room_id;
    let freelance = c.freelance_id;
    if (!room || !freelance) {
      const salon = await lire(supabase, { par, action: "contexte_salon", query: REQUETE_SALON_POSTEUR, variables: { id: c.contrat_id }, tenant: c.organisation_id });
      room = (salon.data?.contractRoom?.id as string | undefined) ?? null;
      freelance = (salon.data?.contractDetails?.freelancer?.id as string | undefined) ?? null;
      if (!room || !freelance) {
        await noter({ erreur: salon.erreur ?? "conversation introuvable" });
        return salon.erreur ?? "conversation introuvable";
      }
    }
    const msgs = await lire(supabase, { par, action: "contexte_messages", query: REQUETE_MESSAGES_SALON, variables: { r: room }, tenant: c.organisation_id });
    if (msgs.erreur) {
      await noter({ room_id: room, freelance_id: freelance, erreur: msgs.erreur });
      return msgs.erreur;
    }
    // deno-lint-ignore no-explicit-any
    const derniers = derniersMessagesSalon(((msgs.data?.roomStories?.edges ?? []) as any[]).map((e) => e?.node), freelance);
    await noter({
      room_id: room, freelance_id: freelance, messages: derniers, erreur: null,
      dernier_posteur_at: derniers.find((m) => m.de === "posteur")?.at ?? null,
      dernier_nous_at: derniers.find((m) => m.de === "nous")?.at ?? null,
    });
    return null;
  } catch (e) {
    return messageErreur(e);
  }
}

/**
 * 0464 : les contrats actifs de VIk Studios sans profil OS (masterlist du samedi,
 * « Contracts with no poster ») : leurs milestones et leur conversation, relues
 * (lecture seule). Cron `contrats-sans-posteur`, chaque jour ; admin.
 */
async function lireContratsSansPosteur(supabase: Supabase, par: string | null) {
  const { data, error } = await supabase.rpc("contrats_sans_posteur");
  if (error) throw error;
  const liste = (data ?? []) as { contrat_id: string; organisation_id: string | null }[];
  const { data: salons } = liste.length
    ? await supabase.from("upwork_salons").select("contrat_id, room_id, freelance_id").in("contrat_id", liste.map((c) => c.contrat_id))
    : { data: [] };
  const salonDe = new Map((salons ?? []).map((x) => [String(x.contrat_id), x]));
  await jetonValide(supabase, par);
  const bilan = { contrats: liste.length, jalons: 0, salons: 0, erreurs: [] as string[] };
  for (let i = 0; i < liste.length; i += 5) {
    await Promise.all(liste.slice(i, i + 5).map(async (c) => {
      const r = await lire(supabase, { par, action: "sans_posteur_jalons", query: REQUETE_JALONS, variables: { id: c.contrat_id }, tenant: c.organisation_id });
      const cd = r.data?.contractDetails;
      await supabase.from("upwork_jalons").upsert({
        contrat_id: c.contrat_id, organisation_id: c.organisation_id, ...jalonAApprouver(cd),
        jalons: cd ? lireJalonsContrat(cd) : null, erreur: cd ? null : (r.erreur ?? "réponse sans contractDetails"), lu_at: new Date().toISOString(),
      }, { onConflict: "contrat_id" });
      if (cd) bilan.jalons++;
      else bilan.erreurs.push(`${c.contrat_id} : ${r.erreur ?? "milestones illisibles"}`);
      const s = salonDe.get(c.contrat_id);
      const e = await lireSalon(supabase, par, {
        poster_id: null, contrat_id: c.contrat_id, organisation_id: c.organisation_id,
        room_id: (s?.room_id as string | null) ?? null, freelance_id: (s?.freelance_id as string | null) ?? null,
      });
      if (e) bilan.erreurs.push(`${c.contrat_id} : ${e}`);
      else bilan.salons++;
    }));
  }
  return { ok: bilan.erreurs.length === 0, ...bilan, erreurs: bilan.erreurs.slice(0, 20) };
}

/**
 * 0464 : fermer, sur un clic de l'admin (avec confirmation), un contrat de VIk
 * Studios sans profil OS. Seulement si le test de fermeture est bon et s'il ne
 * reste aucune milestone financée (relue juste avant) ; aucun message.
 */
async function fermerContratSansPosteur(supabase: Supabase, par: string | null, contratId: string) {
  if (await bloquer(supabase, { fonction: "upwork", action: "contrat_sans_posteur_fermer", cible: contratId })) return { ok: false, error: PAUSE };
  const { data, error } = await supabase.rpc("contrats_sans_posteur");
  if (error) throw error;
  const c = ((data ?? []) as { contrat_id: string; organisation_id: string | null }[]).find((x) => x.contrat_id === contratId);
  if (!c) return { ok: false, error: "ce contrat n'est pas dans « Contracts with no poster »" };
  if (!(await fermetureTestee(supabase))) return { ok: false, error: "le test de fermeture (Overview → Test contracts) n'a pas encore réussi" };
  await jetonValide(supabase, par);
  const r = await lire(supabase, { par, action: "sans_posteur_relire", query: REQUETE_JALONS, variables: { id: contratId }, tenant: c.organisation_id });
  if (!r.data?.contractDetails) return { ok: false, error: `milestones illisibles : ${r.erreur ?? "réponse vide"}` };
  const finances = lireJalonsContrat(r.data.contractDetails).filter((j) => ETATS_FINANCES.includes(j.etat));
  if (finances.length) return { ok: false, error: `encore financé : ${decrireJalons(finances)} (payer ou rembourser d'abord)` };
  const fe = await ecrire(supabase, {
    par, action: "sans_posteur_fermer", query: MUTATION_FERMER_CONTRAT, tenant: c.organisation_id, contrat: contratId,
    variables: { contractId: contratId, input: { reasonRef: await raisonFin(supabase) } },
  });
  if (fe.erreur || fe.data?.endContractByClient?.success !== true) return { ok: false, error: `fermeture : ${fe.erreur ?? "non confirmée par Upwork"}` };
  return { ok: true, ferme: true };
}

async function lireContexteUpwork(supabase: Supabase, par: string | null, posteurs: string[] | null, max: number) {
  const { data, error } = await supabase.rpc("contexte_cibles_upwork", { p_posteurs: posteurs, p_max: max });
  if (error) throw error;
  // 0469 : une room demandée par une page peut venir d'un contrat sans posteur (poster_id null).
  const liste = (data ?? []) as { poster_id: string | null; contrat_id: string; organisation_id: string | null; room_id: string | null; freelance_id: string | null }[];
  const bilan = { cibles: liste.length, lus: 0, erreurs: [] as string[] };
  const lireUn = async (c: (typeof liste)[number]) => {
    const erreur = await lireSalon(supabase, par, c);
    if (erreur) bilan.erreurs.push(`${c.contrat_id} : ${erreur}`);
    else bilan.lus++;
  };
  for (let i = 0; i < liste.length; i += REPONSES_EN_PARALLELE) {
    await Promise.all(liste.slice(i, i + REPONSES_EN_PARALLELE).map(lireUn));
  }
  return { ok: bilan.erreurs.length === 0, ...bilan, erreurs: bilan.erreurs.slice(0, 20) };
}

// ---------------------------------------------------------------------------
// Prompt 25, mises à jour, point 8 : la HM a-t-elle vraiment envoyé ?
// ---------------------------------------------------------------------------

interface TacheMain {
  poster_id: string;
  type: string;
  periode: string;
  statut: string;
  texte: string | null;
  main_at: string;
  main_envoye_at: string | null;
  contrat_id: string;
  organisation_id: string | null;
}

/**
 * Les messages confiés aux HM (Upwork plein) : la conversation du contrat est
 * relue (30 min au plus entre deux lectures ; lire ne compte pas dans la
 * limite). Un nouveau message du côté client après l'heure de la tâche (pas
 * le freelance, pas un message parti par l'API) : envoyé, vérifié — même sans
 * « Sent ». « Sent » cliqué et rien 1 h après : « Sent cliqué, message
 * introuvable » (Needs you).
 */
async function verifierEnvoisMain(supabase: Supabase, par: string | null) {
  const bilan = { lues: 0, verifiees: 0, introuvables: 0, erreurs: [] as string[] };
  const { data, error } = await supabase.rpc("envois_main_a_verifier");
  if (error) throw error;
  const taches = (data ?? []) as TacheMain[];
  const parContrat = new Map<string, TacheMain[]>();
  for (const t of taches) parContrat.set(t.contrat_id, [...(parContrat.get(t.contrat_id) ?? []), t]);
  const maintenant = Date.now();
  const lireUn = async ([contrat, liste]: [string, TacheMain[]]) => {
    const tenant = liste[0]!.organisation_id;
    const salon = await lire(supabase, { par, action: "verif_main_salon", query: REQUETE_SALON_POSTEUR, variables: { id: contrat }, tenant });
    const roomId = salon.data?.contractRoom?.id as string | undefined;
    const freelancer = salon.data?.contractDetails?.freelancer?.id as string | undefined;
    if (!roomId || !freelancer) {
      bilan.erreurs.push(`${contrat} : ${salon.erreur ?? "conversation introuvable"}`);
      return;
    }
    const msgs = await lire(supabase, { par, action: "verif_main_messages", query: REQUETE_MESSAGES_SALON, variables: { r: roomId }, tenant });
    if (msgs.erreur) {
      bilan.erreurs.push(`${contrat} : ${msgs.erreur}`);
      return;
    }
    bilan.lues++;
    // Les messages partis par l'API (comptes de Max et d'Adrien) : pas ceux de la HM.
    const debut = liste.reduce((m, t) => (t.main_at < m ? t.main_at : m), liste[0]!.main_at);
    const { data: appels } = await supabase.from("upwork_appels").select("at").eq("action", "message").eq("contrat", contrat)
      .is("erreur", null).gte("at", debut);
    const parApi = (appels ?? []).map((a) => Date.parse(a.at as string));
    // deno-lint-ignore no-explicit-any
    const cote = ((msgs.data?.roomStories?.edges ?? []) as any[]).map((e) => e?.node)
      .filter((n) => n?.id && n.user?.id && n.user.id !== freelancer && String(n.message ?? "").trim())
      .map((n) => ({ at: Date.parse(n.createdDateTime), texte: String(n.message) }))
      .filter((n) => !parApi.some((a) => Math.abs(a - n.at) < 120_000));
    for (const t of liste) {
      const vu = cote.some((n) => n.at > Date.parse(t.main_at));
      if (vu) {
        const { error: errV } = await supabase.rpc("envoi_main_verifie", { p_poster: t.poster_id, p_type: t.type, p_periode: t.periode });
        if (errV) bilan.erreurs.push(`${contrat} ${t.type} : ${errV.message}`);
        else bilan.verifiees++;
        continue;
      }
      const maj: Record<string, unknown> = { main_lu_at: new Date().toISOString() };
      if (t.statut === "deja_envoye" && t.main_envoye_at && maintenant - Date.parse(t.main_envoye_at) >= 3_600_000) {
        maj.main_verif = "sent_introuvable";
        maj.main_verif_at = new Date().toISOString();
        bilan.introuvables++;
        await supabase.from("nudges").update({ verif: "sent_introuvable" })
          .eq("poster_id", t.poster_id).eq("type", t.type).eq("cible", "hm");
      }
      await supabase.from("relances_prevues").update(maj).match({ poster_id: t.poster_id, type: t.type, periode: t.periode });
    }
  };
  const entrees = [...parContrat.entries()];
  for (let i = 0; i < entrees.length; i += 5) await Promise.all(entrees.slice(i, i + 5).map(lireUn));
  return { ok: bilan.erreurs.length === 0, ...bilan };
}

// ---------------------------------------------------------------------------
// Système du 2 nov., partie C : l'arrêt complet
// ---------------------------------------------------------------------------

async function traiterArrets(supabase: Supabase, par: string | null) {
  const { data: regl } = await supabase
    .from("reglages")
    .select("cle, valeur")
    .in("cle", ["arret_auto", "arret_raison_upwork"]);
  const v = Object.fromEntries((regl ?? []).map((r) => [r.cle as string, r.valeur]));
  // 0463 : samedi, à Validate, l'arrêt se fait dans la base (trigger arrets_immediat :
  // désactivé, « To remove from Slack »), sans API. Une ligne restée « à faire » le rattrape ici.
  const { data: restes } = await supabase.from("arrets").select("id").eq("statut", "a_faire").is("annule_at", null).limit(50);
  for (const a of restes ?? []) await supabase.rpc("arret_immediat", { p_id: a.id });
  const mode = lireModeAuto(v.arret_auto);
  if (mode === "off") return { ok: true, mode, rattrapes: restes?.length ?? 0, ignore: "arret_auto = off" };
  // Prompt 22 : en pause, aucune fin de contrat ; la file reste.
  if (await automationEnPause(supabase)) {
    await noterBloquee(supabase, { fonction: "upwork", action: "arrets" });
    return { ok: true, mode, ignore: PAUSE };
  }
  const raison = typeof v.arret_raison_upwork === "string" && v.arret_raison_upwork.trim()
    ? v.arret_raison_upwork.trim()
    : RAISON_FIN_DEFAUT;
  // Lundi, après la paie : le contrat fermé par l'API, seulement si le test de fermeture est bon.
  const fins = await finsDeContrat(supabase, par, mode === "on", raison)
    .catch((e) => ({ terminees: 0, attente: 0, bloquees: 0, simulees: 0, sans_test: 0, erreurs: [`fins de contrat : ${messageErreur(e)}`] }));
  return { ok: fins.erreurs.length === 0, mode, rattrapes: restes?.length ?? 0, fins };
}

/**
 * 0463 : le dernier test de fermeture (Overview → Test contracts) a-t-il fermé le
 * contrat sans erreur ? Sinon, aucune fermeture par l'API.
 */
async function fermetureTestee(supabase: Supabase): Promise<boolean> {
  const { data } = await supabase
    .from("upwork_appels")
    .select("erreur, reponse")
    .eq("action", "test_fermeture_bilan")
    .order("at", { ascending: false })
    .limit(1);
  const d = (data ?? [])[0] as { erreur: string | null; reponse: { bilan?: { contrat_ferme?: boolean } } | null } | undefined;
  return !!d && !d.erreur && d.reponse?.bilan?.contrat_ferme === true;
}

/**
 * 0464 : le lundi 20 h et le mardi 12 h (Paris), chaque contrat tué ces 10
 * derniers jours est relu sur Upwork (lecture seule). Pas fermé, ou une
 * milestone encore financée sans remboursement demandé : une ligne
 * `arrets_verifs` avec le problème → carte Needs you « arret_a_verifier ».
 */
async function verifierArrets(supabase: Supabase, par: string | null, passage: string) {
  const depuis = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const { data: arrets, error } = await supabase.from("arrets").select("id, poster_id, etapes")
    .in("statut", ["fait", "erreur"]).is("annule_at", null).gte("created_at", depuis);
  if (error) throw error;
  const liste = (arrets ?? []) as { id: string; poster_id: string; etapes: EtapeArret[] | null }[];
  const { data: profils } = liste.length
    ? await supabase.from("profiles").select("id, upwork_contract_id").in("id", liste.map((a) => a.poster_id))
    : { data: [] };
  const contratDe = new Map((profils ?? []).map((p) => [String(p.id), (p.upwork_contract_id as string | null) ?? null]));
  const { data: regl } = await supabase.from("reglages").select("valeur").eq("cle", "arret_auto").maybeSingle();
  const mode = lireModeAuto(regl?.valeur);
  const testOk = liste.length ? await fermetureTestee(supabase) : false;
  if (liste.length) await jetonValide(supabase, par);
  const bilan = { arrets: liste.length, relus: 0, problemes: 0, erreurs: [] as string[] };
  for (const a of liste) {
    const contrat = contratDe.get(a.poster_id) ?? null;
    if (!contrat || (await contratPartage(supabase, contrat, a.poster_id))) continue;
    const { data: uc } = await supabase.from("upwork_contrats").select("organisation_id").eq("contrat_id", contrat).maybeSingle();
    const tenant = (uc?.organisation_id as string | null) ?? null;
    const st = await lire(supabase, { par, action: "arret_verif_statut", query: REQUETE_STATUT_CONTRAT, variables: { id: contrat }, tenant });
    const jl = await lire(supabase, { par, action: "arret_verif_jalons", query: REQUETE_JALONS, variables: { id: contrat }, tenant });
    if (st.erreur || !jl.data?.contractDetails) {
      bilan.erreurs.push(`${contrat} : ${st.erreur ?? jl.erreur ?? "illisible"}`);
      continue;
    }
    const statut = (st.data?.contractDetails?.status as string | undefined) ?? null;
    const ferme = contratFerme(statut);
    const finances = lireJalonsContrat(jl.data.contractDetails).filter((j) => ETATS_FINANCES.includes(j.etat));
    const etapes = a.etapes ?? [];
    const rembourser = etapes.some((e) => e.action === "remboursement" && e.statut === "a_faire");
    const problemes: string[] = [];
    if (!ferme) {
      const pourquoi = mode !== "on"
        ? `Full stop is ${mode}`
        : !testOk
        ? "the contract-closing test has not passed"
        : etapes.find((e) => e.action === "fermeture" && e.statut !== "fait")?.detail ?? "not closed by the OS yet";
      problemes.push(`still open on Upwork (${statut ?? "?"}; ${pourquoi})`);
    }
    if (finances.length && !rembourser) problemes.push(`milestone still funded: ${decrireJalons(finances)}`);
    await supabase.from("arrets_verifs").insert({
      arret_id: a.id, poster_id: a.poster_id, contrat_id: contrat, passage, statut_contrat: statut, ferme,
      finances: finances.map((j) => ({ nom: j.nom, depot: j.depot, etat: j.etat })), probleme: problemes.join(" · ") || null,
    });
    bilan.relus++;
    if (problemes.length) bilan.problemes++;
  }
  return { ok: bilan.erreurs.length === 0, passage, ...bilan, erreurs: bilan.erreurs.slice(0, 20) };
}

/**
 * Prompt 21, partie F (0414) : un posteur arrêté qui avait posté (Kill du
 * samedi, « je ne veux plus », Arrêter). Dès que la ligne de paie de sa
 * dernière semaine est payée (par l'API ou cochée « Payé ») — ou si la semaine
 * est à 0 $ —, au passage suivant : milestones non financées supprimées, rien
 * de financé, contrat terminé (endContractByClient, motif arret_raison_upwork),
 * noté dans recrue_evenements (« Contract ended »). Jamais avec une milestone
 * financée restante, sauf à 0 $ (remboursement à demander). Test : simulé.
 */
async function finsDeContrat(supabase: Supabase, par: string | null, reel: boolean, raison: string) {
  const { data, error } = await supabase.rpc("arrets_fins_a_faire");
  if (error) throw error;
  const bilan = { terminees: 0, attente: 0, bloquees: 0, simulees: 0, sans_test: 0, erreurs: [] as string[] };
  const lignes = (data ?? []) as { arret_id: string; poster_id: string; contrat_id: string | null; semaine: string; montant: number | string | null; paye_at: string | null; posts: number }[];
  const testOk = reel && lignes.length > 0 ? await fermetureTestee(supabase) : false;
  for (const f of lignes) {
    const semaine = etatSemaineKill({ montant: f.montant === null ? null : Number(f.montant), paye_at: f.paye_at, posts: Number(f.posts ?? 0) });
    if (semaine === "attendre") {
      bilan.attente++;
      continue;
    }
    // 0463 : pas de test de fermeture réussi → rien chez Upwork, la ligne attend.
    if (reel && !testOk) {
      bilan.sans_test++;
      continue;
    }
    if (!reel) {
      // En test : simulé une fois ; la ligne reste dans la file (elle partira pour de vrai sur on).
      const { data: deja } = await supabase.from("arrets").select("etapes").eq("id", f.arret_id).maybeSingle();
      if (((deja?.etapes ?? []) as EtapeArret[]).some((e) => e.action === "fermeture" && e.statut === "simule")) continue;
    }
    const nouvelles: EtapeArret[] = [];
    let termine = false;
    if (!f.contrat_id) {
      nouvelles.push(etape("fermeture", "erreur", "contrat Upwork non relié"));
    } else if (await contratPartage(supabase, f.contrat_id, f.poster_id)) {
      nouvelles.push(etape("fermeture", "sans_objet", "contrat partagé avec un autre compte actif du posteur"));
    } else {
      const { data: c } = await supabase.from("upwork_contrats").select("organisation_id").eq("contrat_id", f.contrat_id).maybeSingle();
      const tenant = (c?.organisation_id as string | undefined) ?? null;
      const lu = await lire(supabase, { par, action: "fin_jalons", query: REQUETE_JALONS, variables: { id: f.contrat_id }, tenant });
      if (lu.erreur || !lu.data?.contractDetails) {
        nouvelles.push(etape("fermeture", "erreur", `milestones illisibles (${lu.erreur ?? "réponse vide"})`));
      } else {
        const plan = planUpwork(lireJalonsContrat(lu.data.contractDetails));
        if (plan.supprimer.length && !reel) {
          nouvelles.push(etape("jalons", "simule", `à supprimer : ${decrireJalons(plan.supprimer)}`));
        } else if (plan.supprimer.length) {
          const echecs: string[] = [];
          for (const j of plan.supprimer) {
            const r = await ecrire(supabase, { par, action: "fin_supprimer_jalon", query: MUTATION_SUPPRIMER_JALON, variables: { input: { id: j.id } }, tenant, contrat: f.contrat_id });
            if (r.erreur || r.data?.deleteMilestone !== true) echecs.push(`${j.nom ?? j.id} : ${r.erreur ?? "non confirmé"}`);
          }
          nouvelles.push(echecs.length ? etape("jalons", "erreur", echecs.join(" ; ")) : etape("jalons", "fait", `supprimées : ${decrireJalons(plan.supprimer)}`));
        }
        if (semaine === "zero" && plan.rembourser.length) {
          nouvelles.push(etape("remboursement", "a_faire", `Ask for a refund : ${decrireJalons(plan.rembourser)} (liste de paie)`));
        }
        const fin = planFinContrat(plan, semaine);
        if (!fin.fermer) {
          nouvelles.push(etape("fermeture", "a_faire", fin.raison));
          bilan.bloquees++;
        } else if (!reel) {
          nouvelles.push(etape("fermeture", "simule", `endContractByClient, raison ${raison}`));
          bilan.simulees++;
        } else {
          const r = await fermerContrat(supabase, par, f.contrat_id, tenant, raison, f.poster_id);
          nouvelles.push(r.ferme ? etape("fermeture", "fait", "contrat terminé") : etape("fermeture", "erreur", r.raison));
          termine = r.ferme;
        }
      }
    }
    if (termine) {
      bilan.terminees++;
      await supabase.from("contrats_fins").upsert({ poster_id: f.poster_id, semaine: f.semaine, termine_par: par }, { onConflict: "poster_id,semaine", ignoreDuplicates: true });
      await supabase.from("recrue_evenements").upsert(
        { poster_id: f.poster_id, type: "contrat_termine", at: new Date().toISOString(), detail: semaine === "zero" ? "semaine à 0 $" : "dernière semaine payée", cle: `contrat_termine:${f.semaine}` },
        { onConflict: "poster_id,type,cle", ignoreDuplicates: true },
      );
    }
    const erreur = nouvelles.filter((e) => e.statut === "erreur").map((e) => `${e.action} : ${e.detail}`).join(" · ") || null;
    if (erreur) bilan.erreurs.push(`${f.poster_id} : ${erreur}`);
    const { data: a } = await supabase.from("arrets").select("etapes").eq("id", f.arret_id).maybeSingle();
    const paie = semaine === "zero" ? "semaine à 0 $" : "dernière semaine payée";
    const etapes = [
      ...((a?.etapes ?? []) as EtapeArret[]).map((e) => reel && e.action === "paie" && e.statut === "a_faire" ? etape("paie", "fait", paie) : e),
      ...nouvelles,
    ];
    await supabase.from("arrets").update({ etapes, erreur, statut: erreur ? "erreur" : "fait", maj_at: new Date().toISOString() }).eq("id", f.arret_id);
  }
  return bilan;
}

async function verifier(supabase: Supabase) {
  // Prompt 25 v4 : chaque compte connecté (Max, et Adrien s'il a connecté le sien).
  const { data: comptes } = await supabase.from("upwork_connexion").select("compte, statut, alerte_at, access_secret_id");
  const resultats: Record<string, { ok: boolean; error?: string; ignore?: string }> = {};
  for (const c of comptes ?? []) {
    const compte = String(c.compte);
    if (!c.access_secret_id) {
      resultats[compte] = { ok: true, ignore: "pas encore connecté" };
      continue;
    }
    try {
      const r = await lire(supabase, {
        par: null,
        action: "verification",
        query: "query Verification { companySelector { items { organizationId } } }",
        compte,
      });
      if (r.erreur) throw new Error(r.erreur);
      await supabase.from("upwork_connexion").update({ statut: "connecte", derniere_erreur: null }).eq("compte", compte);
      resultats[compte] = { ok: true };
    } catch (e) {
      const message = messageErreur(e);
      const deja = c.alerte_at && Date.now() - new Date(c.alerte_at).getTime() < 20 * 3_600_000;
      await supabase.from("upwork_connexion").update({
        statut: "erreur",
        derniere_erreur: message.slice(0, 500),
        ...(deja ? {} : { alerte_at: new Date().toISOString() }),
      }).eq("compte", compte);
      if (!deja) await alerterMax(message, compte);
      resultats[compte] = { ok: false, error: message };
    }
  }
  if (!resultats[COMPTE]) return { ok: true, ignore: "pas encore connecté", comptes: resultats };
  return { ok: Object.values(resultats).every((r) => r.ok), ...(resultats[COMPTE].error ? { error: resultats[COMPTE].error } : {}), comptes: resultats };
}

async function alerterMax(message: string, compte: string = COMPTE): Promise<void> {
  const jeton = Deno.env.get("SLACK_HM_BOT_TOKEN");
  if (!jeton) return;
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { authorization: `Bearer ${jeton}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      channel: SLACK_MAX,
      text: compte === COMPTE
        ? `:warning: La connexion Upwork de l'OS ne marche plus (${message.slice(0, 300)}). Reconnecte-la : ${OS_URL}/admin/reglages#upwork`
        : `:warning: Le compte Upwork de secours (${compte}) ne marche plus (${message.slice(0, 300)}). ` +
          `Les messages passent par le compte principal seulement. Reconnecter : ${OS_URL}/admin/auto`,
    }),
  }).catch(() => undefined);
}
