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
  REQUETE_SALON,
  requeteContrats,
  UPWORK_GRAPHQL,
  UPWORK_JETON,
  urlAutorisation,
  urlRetour,
} from "../_shared/upwork.ts";
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
 *       (organization.clientOffers, 100 par page) dans `upwork_contrats`.
 *       Lecture seule.
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

    const acces = await assertRole(request, ["admin"]);
    if (acces instanceof Response) return acces;
    // deno-lint-ignore no-explicit-any
    const body: any = await request.json().catch(() => ({}));
    const par = acces.userId === "cron" ? null : acces.userId;

    switch (body.action) {
      case "lien":
        return json(await lien(supabase, par));
      case "diagnostic":
        return json(await diagnostic(supabase, par));
      case "verifier":
        return json(await verifier(supabase));
      case "contrats":
        return json(await lireContrats(supabase, par));
      case "droits":
        return json(await testerDroits(supabase, par));
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
  const bilan: Record<string, { total: number | null; lus: number; erreur: string | null; pays: boolean }> = {};
  for (const org of orgs) {
    let apres: string | null = null;
    let avecPays = true;
    let total: number | null = null;
    let lus = 0;
    let erreur: string | null = null;
    // 100 par page, 20 pages au plus (2 000 contrats) : pas de lecture sans fin.
    for (let page = 0; page < 20; page++) {
      let r = await lire(supabase, {
        par,
        action: "contrats",
        query: requeteContrats(avecPays),
        variables: { pagination: { first: 100, ...(apres ? { after: apres } : {}) } },
        tenant: org.organizationId,
      });
      // Sans le droit sur le profil du freelance : on relit sans le pays.
      if (avecPays && r.erreur && !r.data?.organization?.clientOffers) {
        avecPays = false;
        r = await lire(supabase, {
          par,
          action: "contrats",
          query: requeteContrats(false),
          variables: { pagination: { first: 100, ...(apres ? { after: apres } : {}) } },
          tenant: org.organizationId,
        });
      }
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
      if (!offres.pageInfo?.hasNextPage || !offres.pageInfo?.endCursor) break;
      apres = offres.pageInfo.endCursor;
    }
    // Un contrat de cette organisation qui n'est plus rendu actif n'est plus actif.
    if (!erreur) {
      await supabase.from("upwork_contrats").update({ actif: false })
        .eq("organisation_id", org.organizationId).lt("lu_at", debut);
    }
    bilan[org.title?.trim() ?? org.organizationId] = { total, lus, erreur, pays: avecPays };
  }
  return { ok: true, organisations: bilan };
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
