/**
 * Upwork (prompt 14, 0386) : ce qui ne dépend ni de Supabase ni du réseau.
 *
 * Adresses relevées dans les SDK officiels d'Upwork (python-upwork-oauth2,
 * node-upwork-oauth2) : la page d'autorisation, l'échange du jeton (secret
 * envoyé dans le corps, `authorizationMethod: 'body'`) et GraphQL. L'en-tête
 * `X-Upwork-API-TenantId` choisit l'organisation (Vik Studios, compte perso,
 * Micabo) ; sans lui, l'organisation par défaut de l'utilisateur.
 */

export const UPWORK_AUTORISATION = "https://www.upwork.com/ab/account-security/oauth2/authorize";
export const UPWORK_JETON = "https://www.upwork.com/api/v3/oauth2/token";
export const UPWORK_GRAPHQL = "https://api.upwork.com/graphql";

/** L'URL de retour déclarée dans la clé Upwork (Callback URL). */
export function urlRetour(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/upwork-callback`;
}

export function urlAutorisation(clientId: string, redirectUri: string, state: string): string {
  const u = new URL(UPWORK_AUTORISATION);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

/** Le corps de l'échange (code) ou du renouvellement (refresh_token). */
export function corpsJeton(
  o:
    | { type: "code"; code: string; redirectUri: string; clientId: string; clientSecret: string }
    | { type: "refresh"; refreshToken: string; clientId: string; clientSecret: string },
): URLSearchParams {
  const p = new URLSearchParams();
  if (o.type === "code") {
    p.set("grant_type", "authorization_code");
    p.set("code", o.code);
    p.set("redirect_uri", o.redirectUri);
  } else {
    p.set("grant_type", "refresh_token");
    p.set("refresh_token", o.refreshToken);
  }
  p.set("client_id", o.clientId);
  p.set("client_secret", o.clientSecret);
  return p;
}

export interface Jetons {
  access: string;
  refresh: string | null;
  expireAt: string;
  scope: string | null;
}

/** Lit la réponse du serveur de jetons ; lève si elle n'a pas d'access_token. */
// deno-lint-ignore no-explicit-any
export function lireJetons(r: any, maintenant: Date = new Date()): Jetons {
  if (!r || typeof r.access_token !== "string" || !r.access_token) {
    const erreur = r?.error_description ?? r?.error ?? r?.message ?? "réponse sans access_token";
    throw new Error(`jeton Upwork : ${String(erreur).slice(0, 200)}`);
  }
  // Par défaut 24 h (doc Upwork : jeton d'accès valable 24 h).
  const secondes = Number(r.expires_in) > 0 ? Number(r.expires_in) : 86_400;
  return {
    access: r.access_token,
    refresh: typeof r.refresh_token === "string" && r.refresh_token ? r.refresh_token : null,
    expireAt: new Date(maintenant.getTime() + secondes * 1000).toISOString(),
    scope: typeof r.scope === "string" ? r.scope : null,
  };
}

/** À renouveler : expiré, inconnu, ou à moins de 2 h de l'expiration. */
export function aRenouveler(expireAt: string | null, maintenant: Date = new Date()): boolean {
  if (!expireAt) return true;
  return new Date(expireAt).getTime() - maintenant.getTime() < 2 * 3_600_000;
}

/** Une erreur qui vaut un nouvel essai (lecture seulement) : réseau, 429, 5xx. */
export function erreurPassagere(statut: number | null): boolean {
  return statut === null || statut === 429 || statut >= 500;
}

/**
 * Lectures seulement : jusqu'à `essais` tentatives, attente doublée à chaque
 * fois (1 s, 2 s, 4 s). Une écriture (paiement, message) n'y passe JAMAIS.
 */
export async function avecRetry<T>(
  appel: () => Promise<{ statut: number | null; valeur: T }>,
  o: { essais?: number; attenteMs?: number; dormir?: (ms: number) => Promise<void> } = {},
): Promise<{ statut: number | null; valeur: T; essais: number }> {
  const essais = o.essais ?? 3;
  const dormir = o.dormir ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let attente = o.attenteMs ?? 1000;
  let dernier: { statut: number | null; valeur: T } | null = null;
  for (let i = 1; i <= essais; i++) {
    dernier = await appel();
    if (!erreurPassagere(dernier.statut)) return { ...dernier, essais: i };
    if (i < essais) {
      await dormir(attente);
      attente *= 2;
    }
  }
  return { ...dernier!, essais };
}

/** La requête d'introspection standard de GraphQL (les noms exacts de l'API). */
export const INTROSPECTION = `query Introspection {
  __schema {
    queryType { name }
    mutationType { name }
    types {
      kind name description
      fields(includeDeprecated: true) {
        name description isDeprecated
        args { name description type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
      }
      inputFields { name description type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
      enumValues(includeDeprecated: true) { name }
    }
  }
}`;

/** Les champs racine (requêtes et mutations) d'un schéma lu par introspection. */
// deno-lint-ignore no-explicit-any
export function racinesSchema(schema: any): { requetes: string[]; mutations: string[] } {
  const s = schema?.__schema ?? schema;
  // deno-lint-ignore no-explicit-any
  const types: any[] = s?.types ?? [];
  // deno-lint-ignore no-explicit-any
  const champs = (nom: string | undefined) => (types.find((t) => t.name === nom)?.fields ?? []).map((f: any) => f.name as string);
  return {
    requetes: champs(s?.queryType?.name).sort(),
    mutations: champs(s?.mutationType?.name).sort(),
  };
}

/** Le texte d'une erreur GraphQL (erreurs de la réponse), ou null. */
// deno-lint-ignore no-explicit-any
export function erreurGraphql(r: any): string | null {
  // deno-lint-ignore no-explicit-any
  const e: any[] = Array.isArray(r?.errors) ? r.errors : [];
  if (e.length === 0) return null;
  return e.map((x) => x?.message ?? JSON.stringify(x)).join(" · ").slice(0, 500);
}

/** Pour le journal : la réponse sans les longues listes (au plus ~20 Ko). */
export function abregerPourJournal(valeur: unknown, max = 20_000): unknown {
  const texte = JSON.stringify(valeur ?? null);
  if (texte.length <= max) return valeur ?? null;
  return { abrege: true, taille: texte.length, debut: texte.slice(0, max) };
}

// ---------------------------------------------------------------------------
// Lectures du point 2 (noms vérifiés dans le schéma lu à l'API, 28/10) :
// CurrentOrganization.clientOffers(offerByClientFilter, pagination: Pagination!)
// → ContractOfferConnection { totalCount, edges { node: ContractOfferResult }, pageInfo }.
// ---------------------------------------------------------------------------

/**
 * Sans `milestoneState` : Upwork rend parfois une valeur absente de son propre
 * schéma (« PaidBySystem », 28/10), ce qui vide toute la ligne du contrat.
 */
export function requeteContrats(): string {
  return `query ContratsActifs($pagination: Pagination!) {
  organization {
    id
    name
    clientOffers(offerByClientFilter: { commonFilter: { states_any: [Active] } }, pagination: $pagination) {
      totalCount
      edges {
        cursor
        node {
          id title type state startDateTime
          team { id name }
          freelancer { id name }
          contractDetails { id status }
        }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
}`;
}

/** clientOffers rend 50 lignes au plus par page, même si on en demande plus (testé le 28/10). */
export const TAILLE_PAGE_OFFRES = 50;

/**
 * Le curseur de la page suivante. Upwork laisse `endCursor` vide (testé le
 * 28/10) : on prend alors le `cursor` de la dernière ligne (sa position, « 50 »
 * → la page suivante commence à 51). Null : plus de page.
 */
// deno-lint-ignore no-explicit-any
export function curseurSuivant(offres: any): string | null {
  if (!offres?.pageInfo?.hasNextPage) return null;
  const edges = offres.edges ?? [];
  const dernier = edges.length > 0 ? edges[edges.length - 1]?.cursor : null;
  return offres.pageInfo.endCursor ?? dernier ?? null;
}

/** Les jalons d'un contrat au forfait (contractDetails(id: ID!) → terms.fixedPriceTerms.milestones). */
export const REQUETE_JALONS = `query Jalons($id: ID!) {
  contractDetails(id: $id) {
    id status
    terms { fixedPriceTerms { id fixedAmount { rawValue currency } milestones { id description state sequenceId depositAmount { rawValue currency displayValue } paid { rawValue currency displayValue } dueDateTime } } }
  }
}`;

/** Une milestone financée et pas encore payée (MilestoneState, schéma lu le 28/10). */
export const ETATS_FINANCES = ["Active", "Submitted", "Rejected"];

export interface JalonAApprouver {
  jalon_id: string | null;
  nom: string | null;
  montant: number | null;
  etat: string | null;
  sequence: number | null;
  /** Combien de milestones financées et non payées (plus d'une : à vérifier). */
  nb_finances: number;
}

/**
 * La milestone à approuver (chantier du 28 oct., F1) : la PREMIÈRE financée et
 * pas encore payée du contrat (plus petit sequenceId), quel que soit son nom.
 * Aucune : tout à null.
 */
// deno-lint-ignore no-explicit-any
export function jalonAApprouver(contractDetails: any): JalonAApprouver {
  // deno-lint-ignore no-explicit-any
  const jalons: any[] = (contractDetails?.terms?.fixedPriceTerms ?? []).flatMap((t: any) => t?.milestones ?? []);
  const finances = jalons
    .filter((m) => ETATS_FINANCES.includes(m?.state))
    .sort((a, b) => Number(a?.sequenceId ?? 0) - Number(b?.sequenceId ?? 0));
  const m = finances[0];
  // rawValue est en centimes (« 1500 » = 15 $, vérifié le 28/10) ; displayValue en dollars (« 15.00 »).
  const brut = m?.depositAmount;
  const montant = brut?.displayValue !== undefined && brut?.displayValue !== null
    ? Number(String(brut.displayValue).replace(/[^0-9.]/g, ""))
    : brut?.rawValue !== undefined ? Number(brut.rawValue) / 100 : NaN;
  return {
    jalon_id: m?.id ? String(m.id) : null,
    nom: m?.description?.trim() || null,
    montant: Number.isFinite(montant) ? montant : null,
    etat: m?.state ?? null,
    sequence: m?.sequenceId !== undefined && m?.sequenceId !== null ? Number(m.sequenceId) : null,
    nb_finances: finances.length,
  };
}

/**
 * Prompt 14, point 3 : les ÉCRITURES de la paie (noms et types vérifiés dans
 * le schéma lu à l'API le 28/10). Montants en centimes (« 1000 » = 10 $).
 * Jamais de nouvel essai automatique.
 * - approveMilestone(input: ApproveMilestoneInput! { id, paidAmount!,
 *   paymentComment, underpaymentReason }) → Milestone ;
 * - createMilestoneV2(input: CreateMilestoneInput! { contractId, description,
 *   depositAmount }) → Milestone ;
 * - editMilestone(input: EditMilestoneInput { id!, description, depositAmount }) ;
 * - activateMilestone(input: ActivateMilestoneInput { id!, message }) : la doc
 *   dit qu'hors compte « enterprise », Upwork ouvre un paiement (checkout) et
 *   ne finance qu'après : l'état est relu, jamais supposé.
 */
export const MUTATION_APPROUVER = `mutation Approuver($input: ApproveMilestoneInput!) { approveMilestone(input: $input) { id state } }`;
export const MUTATION_CREER_JALON = `mutation CreerJalon($input: CreateMilestoneInput!) { createMilestoneV2(input: $input) { id state } }`;
export const MUTATION_EDITER_JALON = `mutation EditerJalon($input: EditMilestoneInput) { editMilestone(input: $input) { id state } }`;
export const MUTATION_FINANCER_JALON = `mutation FinancerJalon($input: ActivateMilestoneInput) { activateMilestone(input: $input) { id state } }`;

/** La conversation d'un contrat (contractRoom(contractId: ID!)), lecture seule. */
export const REQUETE_SALON = `query Salon($id: ID!) { contractRoom(contractId: $id) { id roomName roomType } }`;

/**
 * Un message dans une conversation (prompt 17) : createRoomStoryV2(input:
 * RoomStoryCreateInputV2! { roomId, message }) → RoomStory { id }. Noms
 * vérifiés dans le schéma lu à l'API (28/10). Une écriture : jamais de retry.
 */
export const MUTATION_MESSAGE = `mutation Message($input: RoomStoryCreateInputV2!) { createRoomStoryV2(input: $input) { id } }`;

export interface ContratLu {
  offre_id: string;
  contrat_id: string | null;
  titre: string | null;
  type: string | null;
  etat: string | null;
  jalon_etat: string | null;
  debut_at: string | null;
  freelancer_id: string | null;
  freelancer_nom: string | null;
  freelancer_pays: string | null;
  equipe_id: string | null;
  equipe_nom: string | null;
}

// deno-lint-ignore no-explicit-any
export function lireContrat(node: any): ContratLu {
  const debut = node?.startDateTime ? new Date(isNaN(Number(node.startDateTime)) ? node.startDateTime : Number(node.startDateTime)) : null;
  return {
    offre_id: String(node?.id ?? ""),
    contrat_id: node?.contractDetails?.id ? String(node.contractDetails.id) : null,
    titre: node?.title ?? null,
    type: node?.type ?? null,
    etat: node?.state ?? null,
    jalon_etat: node?.milestoneState ?? null,
    debut_at: debut && !isNaN(debut.getTime()) ? debut.toISOString() : null,
    freelancer_id: node?.freelancer?.id ? String(node.freelancer.id) : null,
    freelancer_nom: node?.freelancer?.name ?? null,
    freelancer_pays: node?.freelancer?.freelancerProfile?.countryDetails?.twoLetterAbbreviation ?? null,
    equipe_id: node?.team?.id ? String(node.team.id) : null,
    equipe_nom: node?.team?.name ?? null,
  };
}
