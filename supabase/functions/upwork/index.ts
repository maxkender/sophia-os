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
      case "paie_apercu":
        return json(await paieApercu(supabase, par, String(body.semaine ?? ""), body.ids));
      case "paie_payer":
        if (body.confirmer !== true) return json({ ok: false, error: "confirmation manquante" }, 400);
        return json(await paiePayer(supabase, par, String(body.semaine ?? ""), body.ids));
      case "droits":
        return json(await testerDroits(supabase, par));
      case "message":
        return json(await envoyerMessage(supabase, par, String(body.contrat_id ?? ""), String(body.texte ?? "")));
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
// Vérification quotidienne
// ---------------------------------------------------------------------------

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
