import {
  abregerPourJournal,
  aRenouveler,
  avecRetry,
  corpsJeton,
  erreurGraphql,
  INTROSPECTION,
  lireContrat,
  lireJetons,
  racinesSchema,
  REQUETE_JALONS,
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
  UPWORK_GRAPHQL,
  UPWORK_JETON,
  urlAutorisation,
  urlRetour,
} from "../_shared/upwork.ts";
import {
  type Annonce,
  type DetailsContrat,
  lireDetailsContrat,
  lireModeAuto,
  messageAccueil,
  planAccueil,
  type PosteurExistant,
  REQUETE_DETAILS_CONTRAT,
} from "../_shared/accueil.ts";
import {
  decrireJalons,
  etape,
  type EtapeArret,
  MESSAGE_FIN_DEFAUT,
  MUTATION_FERMER_CONTRAT,
  MUTATION_SUPPRIMER_JALON,
  planUpwork,
  RAISON_FIN_DEFAUT,
  statutArret,
} from "../_shared/arret.ts";
import {
  centimes,
  type JalonUpwork,
  type LignePaieApi,
  lireJalonsContrat,
  lireReglagesPaieApi,
  type PlanPaiement,
  planPaiement,
  refusMode,
} from "../_shared/paiement.ts";
import { assertRole, corsHeaders, json, messageErreur, serviceClient } from "../_shared/supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

/** L'OS, où l'admin revient après avoir autorisé Upwork (src/features/recrutements/constantes.ts). */
const OS_URL = "https://sophia-marketing-orga.vercel.app";
/** Max, sur Slack : prévenu si la connexion tombe. */
const SLACK_MAX = "U0BL5FRLBEU";
/** La seule connexion pour l'instant : celle de Max (propriétaire de Vik Studios). */
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
 *   { action: "arrets" }                     cron `arrets`, minute 40 ; admin
 *       Système du 2 nov., partie C : l'arrêt complet des posteurs de la file
 *       `arrets` (Kill à 48 h, « je ne veux plus », Arrêter). Désactivé dans
 *       l'OS ; jamais posté : dernier message, milestones non financées
 *       supprimées, remboursement à demander (liste de paie), contrat fermé
 *       s'il ne reste rien de financé ; déjà posté : la paie de lundi paie la
 *       semaine et ferme. Interrupteur `arret_auto` (off / test / on) : en
 *       test, rien ne part sur Upwork. Chaque action journalisée, un échec ne
 *       bloque pas les autres, jamais de nouvel essai.
 *   { action: "reponses_lire" }              cron `reponses-upwork`, 8 h 45 et 15 h 45 UTC ; admin
 *       Système du 2 nov., partie E : les messages des posteurs ciblés
 *       (`reponses_cibles_upwork`) dans la conversation de leur contrat, plus
 *       récents que le dernier lu → `posteur_reponses` (canal upwork). Lecture
 *       seule ; le classement et la réponse viennent de recrues-check.
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
  try {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
      return await retourUpwork(supabase, url);
    }

    // La paie (prompt 14, point 3) : admin et Head of Ops ; le reste : admin.
    const acces = await assertRole(request, ["admin", "head_of_ops"]);
    if (acces instanceof Response) return acces;
    // deno-lint-ignore no-explicit-any
    const body: any = await request.json().catch(() => ({}));
    const par = acces.userId === "cron" ? null : acces.userId;
    if (acces.role !== "admin" && !["paie_apercu", "paie_payer"].includes(body.action)) {
      return json({ error: "forbidden" }, 403);
    }

    switch (body.action) {
      case "lien":
        return json(await lien(supabase, par));
      case "diagnostic":
        return json(await diagnostic(supabase, par));
      case "verifier":
        return json(await verifier(supabase));
      case "contrats":
        return json(await lireContrats(supabase, par));
      case "jalons":
        return json(await lireJalons(supabase, par));
      case "accueil":
        return json(await accueillir(supabase, par));
      case "paie_apercu":
        return json(await paieApercu(supabase, par, String(body.semaine ?? ""), body.ids));
      case "paie_payer":
        if (body.confirmer !== true) return json({ ok: false, error: "confirmation manquante" }, 400);
        return json(await paiePayer(supabase, par, String(body.semaine ?? ""), body.ids));
      case "droits":
        return json(await testerDroits(supabase, par));
      case "message":
        return json(await envoyerMessage(supabase, par, String(body.contrat_id ?? ""), String(body.texte ?? "")));
      case "arrets":
        return json(await traiterArrets(supabase, par));
      case "reponses_lire":
        return json(await lireReponsesUpwork(supabase, par));
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
  },
): Promise<void> {
  await supabase.from("upwork_appels").insert({
    par: ligne.par,
    compte: COMPTE,
    action: ligne.action,
    contrat: ligne.contrat ?? null,
    montant: ligne.montant ?? null,
    requete: ligne.requete ?? null,
    reponse: abregerPourJournal(ligne.reponse),
    erreur: ligne.erreur ?? null,
    statut_http: ligne.statut ?? null,
    duree_ms: ligne.duree ?? null,
  });
  await supabase.from("upwork_connexion").update({ dernier_appel_at: new Date().toISOString() }).eq("compte", COMPTE);
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

async function lien(supabase: Supabase, par: string | null) {
  const { clientId, redirectUri } = identifiants();
  const state = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const { error } = await supabase.from("upwork_etats").insert({ state, compte: COMPTE, cree_par: par });
  if (error) throw error;
  return { ok: true, url: urlAutorisation(clientId, redirectUri, state), redirect_uri: redirectUri };
}

function versReglages(statut: "ok" | "erreur", raison?: string): Response {
  const u = new URL(`${OS_URL}/admin/reglages`);
  u.searchParams.set("upwork", statut);
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
    .select("state, cree_par, cree_at, utilise_at")
    .eq("state", state)
    .maybeSingle();
  if (error) throw error;
  if (!etat || etat.utilise_at || Date.now() - new Date(etat.cree_at).getTime() > 15 * 60_000 || !code) {
    return versReglages("erreur", "lien de connexion expiré ou déjà utilisé : recommence depuis Réglages");
  }
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
    });
    const { error: errJetons } = await supabase.rpc("upwork_jetons_ecrire", {
      p_compte: COMPTE,
      p_access: jetons.access,
      p_refresh: jetons.refresh,
      p_access_expire: jetons.expireAt,
      p_par: etat.cree_par,
    });
    if (errJetons) throw errJetons;
    await diagnostic(supabase, etat.cree_par, jetons.scope);
    return versReglages("ok");
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
    });
    return versReglages("erreur", message);
  }
}

/** Un jeton d'accès valide : renouvelé s'il expire dans moins de 2 h. */
async function jetonValide(supabase: Supabase, par: string | null): Promise<string> {
  const { data, error } = await supabase.rpc("upwork_jetons_lire", { p_compte: COMPTE });
  if (error) throw error;
  const j = (data ?? [])[0] as { access_token: string | null; refresh_token: string | null; access_expire_at: string | null } | undefined;
  if (!j?.access_token) throw new Error("Upwork n'est pas connecté : Réglages → Upwork → Connecter");
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
    });
    throw e;
  }
  await noter(supabase, {
    par,
    action: "renouvellement",
    reponse: { expires_in: brut?.expires_in, scope: brut?.scope ?? null },
    statut: reponse.status,
    duree: Date.now() - debut,
  });
  const { error: errJetons } = await supabase.rpc("upwork_jetons_ecrire", {
    p_compte: COMPTE,
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
  o: { par: string | null; action: string; query: string; variables?: Record<string, unknown>; tenant?: string | null },
  // deno-lint-ignore no-explicit-any
): Promise<{ data: any; erreur: string | null; statut: number | null }> {
  const jeton = await jetonValide(supabase, o.par);
  const debut = Date.now();
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
      return { statut: reponse.status, valeur: await reponse.json().catch(() => null) };
    } catch (e) {
      return { statut: null, valeur: { errors: [{ message: messageErreur(e) }] } };
    }
  });
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
  });
  return { data: r.valeur?.data ?? null, erreur, statut: r.statut };
}

// ---------------------------------------------------------------------------
// Diagnostic : schéma, organisations, ce que la clé permet de lire
// ---------------------------------------------------------------------------

async function diagnostic(supabase: Supabase, par: string | null, scope: string | null = null) {
  // 1. Le schéma : les noms exacts de l'API, rangés pour être vérifiés avant usage.
  const schema = await lire(supabase, { par, action: "schema", query: INTROSPECTION });
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
    })
    : { data: null, erreur: "companySelector absent du schéma", statut: null };

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
    statut: schema.erreur && orgs.erreur ? "erreur" : "connecte",
    derniere_erreur: schema.erreur && orgs.erreur ? `${schema.erreur} · ${orgs.erreur}` : null,
  }).eq("compte", COMPTE);
  return { ok: true, organisations: orgs.data?.companySelector?.items ?? null, droits };
}

// ---------------------------------------------------------------------------
// Point 2a : les contrats actifs (lecture seule)
// ---------------------------------------------------------------------------

interface Organisation {
  title: string;
  organizationId: string;
}

async function organisations(supabase: Supabase): Promise<Organisation[]> {
  const { data } = await supabase.from("upwork_connexion").select("organisations").eq("compte", COMPTE).maybeSingle();
  return ((data?.organisations ?? []) as Organisation[]).filter((o) => o?.organizationId);
}

async function lireContrats(supabase: Supabase, par: string | null) {
  const orgs = await organisations(supabase);
  if (orgs.length === 0) throw new Error("aucune organisation connue : relire les droits dans Réglages → Upwork");
  const debut = new Date().toISOString();
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
        ...lireContrat(e?.node),
        organisation_id: org.organizationId,
        organisation_nom: org.title?.trim() ?? null,
        actif: true,
        lu_at: new Date().toISOString(),
        brut: e?.node ?? null,
      })).filter((l: { offre_id: string }) => l.offre_id);
      if (lignes.length > 0) {
        const { error } = await supabase.from("upwork_contrats").upsert(lignes, { onConflict: "offre_id" });
        if (error) throw error;
      }
      lus += lignes.length;
      apres = curseurSuivant(offres);
      if (!apres) break;
    }
    // Un contrat de cette organisation qui n'est plus rendu actif n'est plus actif,
    // seulement si toute la liste a été lue (sinon on désactiverait des contrats actifs).
    if (!erreur && (total === null || lus >= total)) {
      await supabase.from("upwork_contrats").update({ actif: false })
        .eq("organisation_id", org.organizationId).lt("lu_at", debut);
    }
    bilan[org.title?.trim() ?? org.organizationId] = { total, lus, erreur };
  }
  return { ok: true, organisations: bilan };
}

// ---------------------------------------------------------------------------
// F1 (28 oct.) : la milestone à approuver de chaque contrat relié
// ---------------------------------------------------------------------------

async function lireJalons(supabase: Supabase, par: string | null) {
  // Les contrats actifs lus (action « contrats ») et reliés à un posteur actif.
  const [{ data: contrats, error: e1 }, { data: posteurs, error: e2 }] = await Promise.all([
    supabase.from("upwork_contrats").select("contrat_id, organisation_id").eq("actif", true).not("contrat_id", "is", null),
    supabase.from("profiles").select("upwork_contract_id").eq("is_active", true).not("upwork_contract_id", "is", null),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const relies = new Set((posteurs ?? []).map((p) => String(p.upwork_contract_id)));
  const aLire = (contrats ?? []).filter((c) => relies.has(String(c.contrat_id)));
  if (aLire.length === 0) return { ok: false, error: "aucun contrat actif relié : lancer d'abord l'action contrats" };

  // Le jeton renouvelé une seule fois avant les appels en parallèle.
  await jetonValide(supabase, par);
  let lus = 0;
  let erreurs = 0;
  // 5 à la fois : ~270 contrats en moins d'une minute.
  for (let i = 0; i < aLire.length; i += 5) {
    const lot = aLire.slice(i, i + 5);
    const lignes = await Promise.all(lot.map(async (c) => {
      const r = await lire(supabase, {
        par, action: "jalons", query: REQUETE_JALONS, variables: { id: c.contrat_id }, tenant: c.organisation_id,
      });
      const jalon = jalonAApprouver(r.data?.contractDetails);
      return {
        contrat_id: String(c.contrat_id),
        organisation_id: c.organisation_id,
        ...jalon,
        erreur: r.data?.contractDetails ? null : (r.erreur ?? "réponse sans contractDetails"),
        lu_at: new Date().toISOString(),
      };
    }));
    const { error } = await supabase.from("upwork_jalons").upsert(lignes, { onConflict: "contrat_id" });
    if (error) throw error;
    lus += lignes.filter((l) => !l.erreur).length;
    erreurs += lignes.filter((l) => l.erreur).length;
  }
  return { ok: true, contrats: aLire.length, lus, erreurs };
}

// ---------------------------------------------------------------------------
// Prompt 14, point 3 : payer depuis la liste de paie
// ---------------------------------------------------------------------------

interface LignePlan {
  ligne: LignePaieApi;
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
  return lireReglagesPaieApi(Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur])));
}

/** Les lignes demandées, leurs milestones lues chez Upwork, et le plan de chacune. */
async function planifier(supabase: Supabase, par: string | null, semaine: string, ids: unknown): Promise<LignePlan[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semaine)) throw new Error("semaine invalide");
  const voulues = new Set(Array.isArray(ids) ? ids.map(String) : []);
  if (voulues.size === 0) throw new Error("aucune ligne choisie");
  if (voulues.size > 400) throw new Error("trop de lignes d'un coup");
  const r = await reglagesPaieApi(supabase);
  const { data: liste, error } = await supabase.rpc("paie_liste_v2", { p_lundi: semaine, p_simulation: false });
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  const lignes = ((liste ?? []) as any[]).filter((l) => l.id && voulues.has(String(l.id)));
  const posteurs = lignes.map((l) => l.poster_id);
  const { data: profils } = posteurs.length
    ? await supabase.from("profiles").select("id, upwork_contract_id").in("id", posteurs)
    : { data: [] };
  const contratDe = new Map((profils ?? []).map((p) => [p.id as string, (p.upwork_contract_id as string | null) ?? null]));
  const contrats = [...new Set([...contratDe.values()].filter(Boolean))] as string[];
  const { data: orgs } = contrats.length
    ? await supabase.from("upwork_contrats").select("contrat_id, organisation_id").in("contrat_id", contrats)
    : { data: [] };
  const tenantDe = new Map((orgs ?? []).map((o) => [String(o.contrat_id), (o.organisation_id as string | null) ?? null]));

  await jetonValide(supabase, par);
  const resultat: LignePlan[] = [];
  // Lectures 5 à la fois ; seules les lignes à approuver lisent Upwork.
  for (let i = 0; i < lignes.length; i += 5) {
    const lot = lignes.slice(i, i + 5);
    resultat.push(...await Promise.all(lot.map(async (brute): Promise<LignePlan> => {
      const ligne: LignePaieApi = {
        id: brute.id, poster_id: brute.poster_id, poster_nom: brute.poster_nom, action: brute.action,
        faits: Number(brute.faits ?? 0), tarif: brute.tarif === null ? null : Number(brute.tarif),
        montant: Number(brute.montant ?? 0), montant_calcule: Number(brute.montant_calcule ?? 0),
        retenue: Number(brute.retenue ?? 0), raison_correction: brute.raison_correction ?? null,
        exclu: Boolean(brute.exclu), paye_at: brute.paye_at ?? null, semaine_suivante_faite_at: brute.semaine_suivante_faite_at ?? null,
        suivante_action: brute.suivante_action ?? null,
        suivante_comptes: brute.suivante_comptes === null ? null : Number(brute.suivante_comptes),
        suivante_montant: brute.suivante_montant === null ? null : Number(brute.suivante_montant),
        contrat_id: contratDe.get(brute.poster_id) ?? null,
      };
      const tenant = ligne.contrat_id ? (tenantDe.get(ligne.contrat_id) ?? null) : null;
      const aLire = ["payer", "payer_moins", "modifier", "kill"].includes(ligne.action) && ligne.contrat_id && !ligne.paye_at && !ligne.exclu;
      if (!aLire) return { ligne, tenant, jalons: [], plan: planPaiement(ligne, [], semaine, r), bloque: null };
      if (!tenant) {
        return {
          ligne, tenant, jalons: [],
          plan: { ...planPaiement(ligne, [], semaine, r), statut: "refuse", raison: "contrat absent des contrats actifs lus (Réglages → Upwork → Lire les contrats)" },
          bloque: null,
        };
      }
      const lu = await lire(supabase, {
        par, action: "paie_jalons", query: REQUETE_JALONS, variables: { id: ligne.contrat_id }, tenant,
      });
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
      const bloque = plan.statut === "pret" || plan.statut === "deja_payee" ? refusMode(r, ligne.contrat_id!, aujourdhuiParis()) : null;
      return { ligne, tenant, jalons, plan, bloque };
    })));
  }
  return resultat;
}

function resume(p: LignePlan) {
  return {
    id: p.ligne.id,
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

/** Exécute le plan, ligne par ligne. Jamais de nouvel essai : une erreur = « a_verifier ». */
async function paiePayer(supabase: Supabase, par: string | null, semaine: string, ids: unknown) {
  // Le plan est relu au moment de payer : rien ne part sur un aperçu périmé.
  const plans = await planifier(supabase, par, semaine, ids);
  const resultats: Record<string, unknown>[] = [];
  for (const p of plans) {
    const { ligne, plan, tenant } = p;
    if (p.bloque) {
      resultats.push({ ...resume(p), resultat: "refuse", raison: p.bloque });
      continue;
    }
    if (plan.statut === "deja_payee") {
      resultats.push({ ...resume(p), resultat: await noterDejaPayee(supabase, par, semaine, p) });
      continue;
    }
    if (plan.statut !== "pret" || !plan.approuver || !ligne.id || !ligne.contrat_id) {
      resultats.push({ ...resume(p), resultat: plan.statut });
      continue;
    }
    // 1. Le verrou et le plafond du jour, avant tout appel.
    const { data: paiementId, error: errVerrou } = await supabase.rpc("paie_api_reserver", {
      p_paie_semaine_id: ligne.id, p_poster: ligne.poster_id, p_semaine: semaine,
      p_contrat: ligne.contrat_id, p_montant: plan.total, p_par: par,
    });
    if (errVerrou || !paiementId) {
      resultats.push({ ...resume(p), resultat: "refuse", raison: errVerrou?.message ?? "verrou impossible" });
      continue;
    }
    const etapes: Record<string, unknown>[] = [];
    const maj = (champs: Record<string, unknown>) =>
      supabase.from("paie_paiements_api").update({ ...champs, etapes, updated_at: new Date().toISOString() }).eq("id", paiementId);

    // 2. Approuver la milestone de la semaine payée.
    const a = plan.approuver;
    const approuve = await ecrire(supabase, {
      par, action: "paie_approuver", query: MUTATION_APPROUVER, tenant, contrat: ligne.contrat_id, montant: a.montant,
      variables: {
        input: {
          id: a.jalon_id,
          paidAmount: centimes(a.montant),
          paymentComment: a.nom || "Weekly posting",
          ...(a.sous_paiement ? { underpaymentReason: a.sous_paiement } : {}),
        },
      },
    });
    etapes.push({ etape: "approuver", jalon: a.jalon_id, montant: a.montant, erreur: approuve.erreur, etat: approuve.data?.approveMilestone?.state ?? null });
    if (approuve.erreur || !approuve.data?.approveMilestone) {
      await maj({ statut: "a_verifier", erreur: `approbation : ${approuve.erreur ?? "réponse vide"}`, jalon_approuve: a.jalon_id });
      resultats.push({ ...resume(p), resultat: "a_verifier", raison: `approbation : ${approuve.erreur ?? "réponse vide"}` });
      continue;
    }
    await supabase.from("paie_semaines").update({ paye_at: new Date().toISOString(), paye_par: par }).eq("id", ligne.id).is("paye_at", null);
    await maj({ jalon_approuve: a.jalon_id, montant_approuve: a.montant });

    // Kill (système du 2 nov., partie F) : payée, rien de financé, puis le contrat fermé.
    if (plan.lien === "fermer") {
      const fin = await fermerApresPaiement(supabase, par, semaine, ligne.poster_id, ligne.contrat_id, tenant);
      etapes.push({ etape: "fermer", ...fin });
      await maj({ statut: fin.ferme ? "paye" : "a_verifier", financement: "non", erreur: fin.ferme ? null : `payée ; ${fin.raison}` });
      resultats.push({ ...resume(p), resultat: fin.ferme ? "paye" : "a_verifier", ...(fin.ferme ? {} : { raison: `payée ; ${fin.raison}` }) });
      continue;
    }

    // 3. Financer la semaine suivante (existante, sinon créée), puis relire son état.
    const f = plan.financer;
    if (!f) {
      await maj({ statut: "paye", financement: "non" });
      resultats.push({ ...resume(p), resultat: "paye" });
      continue;
    }
    let jalonId = f.jalon_id;
    let erreurFin: string | null = null;
    if (f.mode === "creer") {
      const cree = await ecrire(supabase, {
        par, action: "paie_creer_jalon", query: MUTATION_CREER_JALON, tenant, contrat: ligne.contrat_id, montant: f.montant,
        variables: { input: { contractId: ligne.contrat_id, description: f.nom, depositAmount: centimes(f.montant) } },
      });
      jalonId = cree.data?.createMilestoneV2?.id ? String(cree.data.createMilestoneV2.id) : null;
      etapes.push({ etape: "creer", jalon: jalonId, montant: f.montant, erreur: cree.erreur });
      if (cree.erreur || !jalonId) erreurFin = `création de ${f.nom} : ${cree.erreur ?? "réponse vide"}`;
    } else if (f.editer && jalonId) {
      const edite = await ecrire(supabase, {
        par, action: "paie_editer_jalon", query: MUTATION_EDITER_JALON, tenant, contrat: ligne.contrat_id, montant: f.montant,
        variables: { input: { id: jalonId, description: f.nom, depositAmount: centimes(f.montant) } },
      });
      etapes.push({ etape: "editer", jalon: jalonId, montant: f.montant, erreur: edite.erreur });
      if (edite.erreur || !edite.data?.editMilestone) erreurFin = `modification de ${f.nom} : ${edite.erreur ?? "réponse vide"}`;
    }
    if (!erreurFin && jalonId) {
      const active = await ecrire(supabase, {
        par, action: "paie_financer_jalon", query: MUTATION_FINANCER_JALON, tenant, contrat: ligne.contrat_id, montant: f.montant,
        variables: { input: { id: jalonId } },
      });
      etapes.push({ etape: "financer", jalon: jalonId, erreur: active.erreur, etat: active.data?.activateMilestone?.state ?? null });
      if (active.erreur || !active.data?.activateMilestone) erreurFin = `financement de ${f.nom} : ${active.erreur ?? "réponse vide"}`;
    }
    if (erreurFin) {
      await maj({ statut: "a_verifier", financement: "erreur", jalon_finance: jalonId, montant_finance: f.montant, erreur: erreurFin });
      resultats.push({ ...resume(p), resultat: "a_verifier", raison: `payée ; ${erreurFin}` });
      continue;
    }
    // L'activation peut passer par un paiement Upwork (checkout) : on relit.
    const relu = await lire(supabase, { par, action: "paie_relire_jalons", query: REQUETE_JALONS, variables: { id: ligne.contrat_id }, tenant });
    const etat = lireJalonsContrat(relu.data?.contractDetails).find((x) => x.id === jalonId)?.etat ?? null;
    etapes.push({ etape: "relire", jalon: jalonId, etat });
    if (etat === "Active") {
      await supabase.from("paie_semaines").update({ semaine_suivante_faite_at: new Date().toISOString(), semaine_suivante_faite_par: par })
        .eq("id", ligne.id).is("semaine_suivante_faite_at", null);
      await maj({ statut: "paye", financement: "finance", jalon_finance: jalonId, montant_finance: f.montant });
      resultats.push({ ...resume(p), resultat: "paye" });
    } else {
      const raison = `payée ; ${f.nom} pas encore financée sur Upwork (état ${etat ?? "inconnu"}) : à financer ou vérifier à la main`;
      await maj({ statut: "a_verifier", financement: "en_attente", jalon_finance: jalonId, montant_finance: f.montant, erreur: raison });
      resultats.push({ ...resume(p), resultat: "a_verifier", raison });
    }
  }
  return { ok: true, lignes: resultats };
}

/** La raison de fin de contrat (réglage `arret_raison_upwork`, 107 par défaut). */
async function raisonFin(supabase: Supabase): Promise<string> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "arret_raison_upwork").maybeSingle();
  return typeof data?.valeur === "string" && data.valeur.trim() ? data.valeur.trim() : RAISON_FIN_DEFAUT;
}

/** Fermer un contrat par l'API (endContractByClient), un seul essai. */
async function fermerContrat(
  supabase: Supabase,
  par: string | null,
  contratId: string,
  tenant: string | null,
  raison: string,
): Promise<{ ferme: boolean; raison: string | null }> {
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
  const fin = await fermerContrat(supabase, par, contratId, tenant, await raisonFin(supabase));
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
  await supabase.from("paie_semaines").update({ paye_at: new Date().toISOString(), paye_par: par }).eq("id", p.ligne.id).is("paye_at", null);
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
  },
  // deno-lint-ignore no-explicit-any
): Promise<{ data: any; erreur: string | null }> {
  const jeton = await jetonValide(supabase, o.par);
  const debut = Date.now();
  let statut: number | null = null;
  // deno-lint-ignore no-explicit-any
  let valeur: any = null;
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
    valeur = await reponse.json().catch(() => null);
  } catch (e) {
    valeur = { errors: [{ message: messageErreur(e) }] };
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
  });
  return { data: valeur?.data ?? null, erreur };
}

async function envoyerMessage(supabase: Supabase, par: string | null, contratId: string, texte: string) {
  if (!contratId || !texte.trim()) return { ok: false, error: "contrat_id et texte requis" };
  const { data: c } = await supabase
    .from("upwork_contrats")
    .select("organisation_id")
    .eq("contrat_id", contratId)
    .maybeSingle();
  const tenant = (c?.organisation_id as string | undefined) ?? null;
  const salon = await lire(supabase, { par, action: "message_salon", query: REQUETE_SALON, variables: { id: contratId }, tenant });
  const roomId = salon.data?.contractRoom?.id as string | undefined;
  if (!roomId) return { ok: false, error: salon.erreur ?? "conversation du contrat introuvable" };
  const r = await ecrire(supabase, {
    par,
    action: "message",
    query: MUTATION_MESSAGE,
    variables: { input: { roomId, message: texte } },
    tenant,
    contrat: contratId,
  });
  const storyId = r.data?.createRoomStoryV2?.id as string | undefined;
  if (!storyId) return { ok: false, error: r.erreur ?? "message non confirmé par Upwork" };
  return { ok: true, story_id: storyId };
}

// ---------------------------------------------------------------------------
// Système du 2 nov., partie A : l'accueil automatique
// ---------------------------------------------------------------------------

const GUIDE_POSTER = "https://app.notion.com/p/Vik-Studios-TikTok-Poster-Guide-3f4241308d6681f8ad41dc507f2c8505";
const SLACK_DEFAUT = "https://join.slack.com/t/sophia-system/shared_invite/zt-4ef0h51pi-utjxbNZ7ArY_6iwy3DWazA";
/** Le mot de passe de départ, comme sur /embauche ; le posteur le change à sa 1re connexion. */
const MOT_DE_PASSE_DEPART = "12345678";

async function accueillir(supabase: Supabase, par: string | null) {
  const { data: regl } = await supabase
    .from("reglages")
    .select("cle, valeur")
    .in("cle", ["accueil_auto", "accueil_contrats_depuis", "accueil_message_texte", "slack_lien_invitation"]);
  const v = Object.fromEntries((regl ?? []).map((r) => [r.cle as string, r.valeur]));
  const mode = lireModeAuto(v.accueil_auto);
  if (mode === "off") return { ok: true, mode, ignore: "accueil_auto = off" };
  const depuis = typeof v.accueil_contrats_depuis === "string" ? v.accueil_contrats_depuis : null;
  if (!depuis) return { ok: false, error: "accueil_contrats_depuis absent" };
  const modele = typeof v.accueil_message_texte === "string" ? v.accueil_message_texte : "";
  const slack = typeof v.slack_lien_invitation === "string" && v.slack_lien_invitation.trim()
    ? v.slack_lien_invitation.trim()
    : SLACK_DEFAUT;

  // 1. Les contrats actifs, relus (lecture seule).
  const lecture = await lireContrats(supabase, par);
  const { data: nouveaux, error } = await supabase
    .from("upwork_contrats")
    .select("contrat_id, organisation_id, offre_id, debut_at")
    .eq("actif", true)
    .not("contrat_id", "is", null)
    .gte("debut_at", depuis);
  if (error) throw error;
  const ids = (nouveaux ?? []).map((c) => String(c.contrat_id));
  const { data: connus } = ids.length
    ? await supabase.from("accueils").select("*").in("contrat_id", ids)
    : { data: [] };
  const connuDe = new Map((connus ?? []).map((a) => [String(a.contrat_id), a]));
  const [{ data: profils }, { data: comptesPays }] = await Promise.all([
    supabase.from("profiles").select("id, prenom, nom, is_active, upwork_contract_id"),
    supabase.from("comptes").select("poster_id, pays").not("pays", "is", null),
  ]);
  const paysDe = new Map((comptesPays ?? []).map((c) => [String(c.poster_id), String(c.pays)]));
  const posteurs: PosteurExistant[] = (profils ?? []).map((p) => ({
    id: p.id, prenom: p.prenom, nom: p.nom, is_active: p.is_active, upwork_contract_id: p.upwork_contract_id,
    pays: paysDe.get(p.id) ?? null,
  }));

  const bilan = { mode, contrats: lecture.organisations, nouveaux: ids.length, crees: 0, simules: 0, a_relier: 0, doublons: 0, erreurs: [] as string[] };
  for (const c of nouveaux ?? []) {
    const contratId = String(c.contrat_id);
    const connu = connuDe.get(contratId);
    // Déjà traité : jamais repris (créé, envoi en cours ou fait, doublon, erreur).
    if (connu && ["cree", "envoi", "envoye", "doublon", "erreur"].includes(connu.statut)) continue;
    // À relier sans pays choisi : on attend la HM.
    if (connu?.statut === "a_relier") continue;

    let details: DetailsContrat | null = connu
      ? {
        contrat_id: contratId, offre_id: connu.offre_id, job_id: connu.job_id, job_titre: connu.job_titre,
        prenom: connu.prenom, nom: connu.nom, debut_at: connu.debut_at, hm_upwork_id: connu.hm_upwork_id, statut: null,
      }
      : null;
    if (!details) {
      const lu = await lire(supabase, {
        par, action: "accueil_contrat", query: REQUETE_DETAILS_CONTRAT, variables: { id: contratId }, tenant: c.organisation_id,
      });
      details = lireDetailsContrat(lu.data?.contractDetails);
      if (!details) {
        bilan.erreurs.push(`${contratId} : ${lu.erreur ?? "contrat illisible"}`);
        continue;
      }
    }
    // L'annonce : vue pour la 1re fois → notée, pays à dire.
    let annonce: Annonce | null = null;
    if (details.job_id) {
      const { data: a } = await supabase.from("annonces_pays").select("job_id, pays, langue, hm_id, tarif, generique").eq("job_id", details.job_id).maybeSingle();
      if (a) annonce = { ...a, tarif: a.tarif === null ? null : Number(a.tarif) } as Annonce;
      else await supabase.from("annonces_pays").insert({ job_id: details.job_id, titre: details.job_titre });
    }
    const plan = planAccueil(details, annonce, connu ? { statut: connu.statut, pays: connu.pays, langue: connu.langue, hm_id: connu.hm_id } : null, posteurs);
    const base = {
      contrat_id: contratId, organisation_id: c.organisation_id, offre_id: details.offre_id ?? c.offre_id, job_id: details.job_id,
      job_titre: details.job_titre, prenom: details.prenom, nom: details.nom, debut_at: details.debut_at ?? c.debut_at,
      hm_upwork_id: details.hm_upwork_id, pays: plan.pays, langue: plan.langue, hm_id: plan.hm_id, tarif: plan.tarif,
      updated_at: new Date().toISOString(),
    };
    if (plan.statut === "doublon") {
      await supabase.from("accueils").upsert({ ...base, statut: "doublon", raison: plan.raison });
      bilan.doublons++;
      continue;
    }
    if (plan.statut === "a_relier") {
      await supabase.from("accueils").upsert({ ...base, statut: "a_relier", raison: plan.raison });
      bilan.a_relier++;
      continue;
    }
    const { data: lundi } = await supabase.rpc("cohorte_lundi_de", {
      p_jour: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(base.debut_at ?? Date.now())),
    });
    const cohorte = String(lundi ?? "");
    if (mode === "test") {
      // Test : le plan et le message, sans rien créer ni envoyer.
      await supabase.from("accueils").upsert({
        ...base, statut: "simule", raison: "test : rien n'est créé ni envoyé", cohorte_lundi: cohorte || null,
        message_texte: messageAccueil(modele, {
          prenom: details.prenom, url: OS_URL, email: "(login créé à la création)", mot_de_passe: MOT_DE_PASSE_DEPART,
          slack, guide: GUIDE_POSTER, cohorte_lundi: cohorte,
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
  }
  return { ok: bilan.erreurs.length === 0, ...bilan };
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
    cohorte_lundi: a.cohorte_lundi,
  });
  const envoi = await envoyerMessage(supabase, par, a.contrat_id, texte);
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

async function lireReponsesUpwork(supabase: Supabase, par: string | null) {
  const { data: cibles, error } = await supabase.rpc("reponses_cibles_upwork");
  if (error) throw error;
  const bilan = { cibles: (cibles ?? []).length, nouveaux: 0, erreurs: [] as string[] };
  for (const c of (cibles ?? []) as { poster_id: string; contrat_id: string; organisation_id: string | null; depuis: string }[]) {
    try {
      const salon = await lire(supabase, { par, action: "reponses_salon", query: REQUETE_SALON_POSTEUR, variables: { id: c.contrat_id }, tenant: c.organisation_id });
      const roomId = salon.data?.contractRoom?.id as string | undefined;
      const freelancer = salon.data?.contractDetails?.freelancer?.id as string | undefined;
      if (!roomId || !freelancer) {
        bilan.erreurs.push(`${c.contrat_id} : ${salon.erreur ?? "conversation introuvable"}`);
        continue;
      }
      const msgs = await lire(supabase, { par, action: "reponses_messages", query: REQUETE_MESSAGES_SALON, variables: { r: roomId }, tenant: c.organisation_id });
      if (msgs.erreur) {
        bilan.erreurs.push(`${c.contrat_id} : ${msgs.erreur}`);
        continue;
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
        if (!errIns) bilan.nouveaux++;
        else if (errIns.code !== "23505") bilan.erreurs.push(`${c.contrat_id} : ${errIns.message}`);
      }
    } catch (e) {
      bilan.erreurs.push(`${c.contrat_id} : ${messageErreur(e)}`);
    }
  }
  return { ok: bilan.erreurs.length === 0, ...bilan };
}

// ---------------------------------------------------------------------------
// Système du 2 nov., partie C : l'arrêt complet
// ---------------------------------------------------------------------------

async function traiterArrets(supabase: Supabase, par: string | null) {
  const { data: regl } = await supabase
    .from("reglages")
    .select("cle, valeur")
    .in("cle", ["arret_auto", "arret_message_texte", "arret_raison_upwork"]);
  const v = Object.fromEntries((regl ?? []).map((r) => [r.cle as string, r.valeur]));
  const mode = lireModeAuto(v.arret_auto);
  if (mode === "off") return { ok: true, mode, ignore: "arret_auto = off" };
  const texteFin = typeof v.arret_message_texte === "string" && v.arret_message_texte.trim()
    ? v.arret_message_texte.trim()
    : MESSAGE_FIN_DEFAUT;
  const raison = typeof v.arret_raison_upwork === "string" && v.arret_raison_upwork.trim()
    ? v.arret_raison_upwork.trim()
    : RAISON_FIN_DEFAUT;

  const { data: file, error } = await supabase
    .from("arrets")
    .select("id")
    .eq("statut", "a_faire")
    .order("created_at")
    .limit(20);
  if (error) throw error;
  const bilan = { mode, traites: 0, erreurs: [] as string[] };
  for (const a of file ?? []) {
    // Un seul passage prend la ligne.
    const { data: pris } = await supabase
      .from("arrets")
      .update({ statut: "en_cours", maj_at: new Date().toISOString() })
      .eq("id", a.id)
      .eq("statut", "a_faire")
      .select("id");
    if (!pris?.length) continue;
    // Une exception ne laisse jamais la ligne « en cours » : elle passe en erreur.
    const etapes = await arreterUn(supabase, par, a.id, mode === "on", texteFin, raison)
      .catch((e) => [etape("os", "erreur", `arrêt interrompu : ${messageErreur(e)}`)]);
    const statut = statutArret(etapes);
    const erreur = etapes.filter((e) => e.statut === "erreur").map((e) => `${e.action} : ${e.detail}`).join(" · ") || null;
    await supabase.from("arrets").update({ statut, etapes, erreur, maj_at: new Date().toISOString() }).eq("id", a.id);
    bilan.traites++;
    if (erreur) bilan.erreurs.push(erreur);
  }
  return { ok: bilan.erreurs.length === 0, ...bilan };
}

/** Les actions d'un arrêt, dans l'ordre ; chacune journalisée, un échec n'arrête pas les autres. */
async function arreterUn(
  supabase: Supabase,
  par: string | null,
  id: string,
  reel: boolean,
  texteFin: string,
  raison: string,
): Promise<EtapeArret[]> {
  const etapes: EtapeArret[] = [];
  // 1. L'OS : désactivé (profil et comptes), plus de messages ni de posts.
  const { data: os, error: errOs } = await supabase.rpc("arret_os", { p_id: id });
  const p = (os ?? [])[0] as { poster_id: string; a_poste: boolean; contrat_id: string | null; slack_user_id: string | null } | undefined;
  if (errOs || !p) {
    etapes.push(etape("os", "erreur", errOs?.message ?? "posteur introuvable"));
    return etapes;
  }
  etapes.push(etape("os", "fait", "posteur et comptes désactivés"));

  // Slack : pas de retrait par l'API (compte standard) → liste « À retirer de Slack ».
  const slack = p.slack_user_id ? etape("slack", "a_faire", "à retirer de Slack") : etape("slack", "sans_objet");

  if (p.a_poste) {
    // En cours de route : lundi, la liste de paie paie la semaine en cours, ne
    // finance rien et ferme le contrat.
    etapes.push(etape("paie", "a_faire", "lundi : payer la semaine en cours, ne rien financer, fermer le contrat"));
    etapes.push(slack);
    return etapes;
  }

  if (!p.contrat_id) {
    for (const a of ["message", "jalons", "remboursement", "fermeture"] as const) {
      etapes.push(etape(a, "erreur", "contrat Upwork non relié"));
    }
    etapes.push(slack);
    return etapes;
  }
  const { data: c } = await supabase.from("upwork_contrats").select("organisation_id").eq("contrat_id", p.contrat_id).maybeSingle();
  const tenant = (c?.organisation_id as string | undefined) ?? null;

  // 2. Le dernier message.
  if (reel) {
    const m = await envoyerMessage(supabase, par, p.contrat_id, texteFin);
    etapes.push(m.ok ? etape("message", "fait", texteFin) : etape("message", "erreur", m.error ?? "message non envoyé"));
  } else {
    etapes.push(etape("message", "simule", texteFin));
  }

  // 3. Les milestones : lues, les non financées supprimées, les financées à rembourser.
  const lu = await lire(supabase, { par, action: "arret_jalons", query: REQUETE_JALONS, variables: { id: p.contrat_id }, tenant });
  if (lu.erreur || !lu.data?.contractDetails) {
    etapes.push(etape("jalons", "erreur", lu.erreur ?? "contrat illisible"));
    etapes.push(etape("remboursement", "erreur", "milestones illisibles"));
    etapes.push(etape("fermeture", "erreur", "milestones illisibles"));
    etapes.push(slack);
    return etapes;
  }
  const jalons = lireJalonsContrat(lu.data.contractDetails);
  if (jalons.length === 0) {
    // Un contrat a toujours sa 1re semaine : une liste vide est une lecture ratée.
    for (const x of ["jalons", "remboursement", "fermeture"] as const) etapes.push(etape(x, "erreur", "aucune milestone lue"));
    etapes.push(slack);
    return etapes;
  }
  const plan = planUpwork(jalons);
  if (plan.supprimer.length === 0) {
    etapes.push(etape("jalons", "sans_objet", "aucune milestone non financée"));
  } else if (!reel) {
    etapes.push(etape("jalons", "simule", `à supprimer : ${decrireJalons(plan.supprimer)}`));
  } else {
    const echecs: string[] = [];
    for (const j of plan.supprimer) {
      const r = await ecrire(supabase, {
        par,
        action: "arret_supprimer_jalon",
        query: MUTATION_SUPPRIMER_JALON,
        variables: { input: { id: j.id } },
        tenant,
        contrat: p.contrat_id,
      });
      if (r.erreur || r.data?.deleteMilestone !== true) echecs.push(`${j.nom ?? j.id} : ${r.erreur ?? "non confirmé"}`);
    }
    etapes.push(
      echecs.length
        ? etape("jalons", "erreur", echecs.join(" ; "))
        : etape("jalons", "fait", `supprimées : ${decrireJalons(plan.supprimer)}`),
    );
  }

  // 4. Le remboursement : l'API ne le permet pas → la liste de paie (« Ask for a refund »).
  etapes.push(
    plan.rembourser.length
      ? etape("remboursement", "a_faire", `Ask for a refund : ${decrireJalons(plan.rembourser)} (liste de paie)`)
      : etape("remboursement", "sans_objet", "rien de financé"),
  );

  // 5. La fermeture : seulement s'il ne reste rien de financé.
  if (!plan.fermer) {
    etapes.push(etape("fermeture", "a_faire", "après le remboursement (liste de paie : End the contract)"));
  } else if (!reel) {
    etapes.push(etape("fermeture", "simule", `endContractByClient, raison ${raison}`));
  } else {
    const fin = await fermerContrat(supabase, par, p.contrat_id, tenant, raison);
    etapes.push(fin.ferme ? etape("fermeture", "fait", "contrat fermé") : etape("fermeture", "erreur", fin.raison));
  }
  etapes.push(slack);
  return etapes;
}

async function verifier(supabase: Supabase) {
  const { data: c } = await supabase
    .from("upwork_connexion")
    .select("statut, alerte_at, access_secret_id")
    .eq("compte", COMPTE)
    .maybeSingle();
  if (!c?.access_secret_id) return { ok: true, ignore: "pas encore connecté" };
  try {
    const r = await lire(supabase, {
      par: null,
      action: "verification",
      query: "query Verification { companySelector { items { organizationId } } }",
    });
    if (r.erreur) throw new Error(r.erreur);
    await supabase.from("upwork_connexion").update({ statut: "connecte", derniere_erreur: null }).eq("compte", COMPTE);
    return { ok: true };
  } catch (e) {
    const message = messageErreur(e);
    const deja = c.alerte_at && Date.now() - new Date(c.alerte_at).getTime() < 20 * 3_600_000;
    await supabase.from("upwork_connexion").update({
      statut: "erreur",
      derniere_erreur: message.slice(0, 500),
      ...(deja ? {} : { alerte_at: new Date().toISOString() }),
    }).eq("compte", COMPTE);
    if (!deja) await alerterMax(message);
    return { ok: false, error: message };
  }
}

async function alerterMax(message: string): Promise<void> {
  const jeton = Deno.env.get("SLACK_HM_BOT_TOKEN");
  if (!jeton) return;
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { authorization: `Bearer ${jeton}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      channel: SLACK_MAX,
      text: `:warning: La connexion Upwork de l'OS ne marche plus (${message.slice(0, 300)}). ` +
        `Reconnecte-la : ${OS_URL}/admin/reglages#upwork`,
    }),
  }).catch(() => undefined);
}
