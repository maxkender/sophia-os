/**
 * Upwork (0386) : adresses, échange du jeton, renouvellement, retry des
 * lectures seulement, lecture du schéma.
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  lireFinContrat,
  orgDeLOs,
  abregerPourJournal,
  aRenouveler,
  avecRetry,
  corpsJeton,
  contratFerme,
  curseurSuivant,
  erreurGraphql,
  erreurPassagere,
  jalonAApprouver,
  lireContrat,
  lireJetons,
  requeteContrats,
  racinesSchema,
  TAILLE_PAGE_OFFRES,
  urlAutorisation,
  urlRetour,
} from "./upwork.ts";

Deno.test("l'URL de retour est celle déclarée dans la clé", () => {
  assertEquals(
    urlRetour("https://mbikecieskoobeizixig.supabase.co/"),
    "https://mbikecieskoobeizixig.supabase.co/functions/v1/upwork-callback",
  );
});

Deno.test("adresse d'autorisation : code, client, retour, state", () => {
  const u = new URL(urlAutorisation("id123", "https://x.supabase.co/functions/v1/upwork-callback", "s1"));
  assertEquals(u.origin + u.pathname, "https://www.upwork.com/ab/account-security/oauth2/authorize");
  assertEquals(u.searchParams.get("response_type"), "code");
  assertEquals(u.searchParams.get("client_id"), "id123");
  assertEquals(u.searchParams.get("redirect_uri"), "https://x.supabase.co/functions/v1/upwork-callback");
  assertEquals(u.searchParams.get("state"), "s1");
});

Deno.test("corps du jeton : secret dans le corps, code ou refresh", () => {
  const c = corpsJeton({ type: "code", code: "abc", redirectUri: "r", clientId: "i", clientSecret: "s" });
  assertEquals(Object.fromEntries(c), { grant_type: "authorization_code", code: "abc", redirect_uri: "r", client_id: "i", client_secret: "s" });
  const r = corpsJeton({ type: "refresh", refreshToken: "rt", clientId: "i", clientSecret: "s" });
  assertEquals(Object.fromEntries(r), { grant_type: "refresh_token", refresh_token: "rt", client_id: "i", client_secret: "s" });
});

Deno.test("lireJetons : expiration, refresh absent, erreur lisible", () => {
  const t0 = new Date("2026-10-28T10:00:00Z");
  const j = lireJetons({ access_token: "a", refresh_token: "r", expires_in: 86400, scope: "x y" }, t0);
  assertEquals(j, { access: "a", refresh: "r", expireAt: "2026-10-29T10:00:00.000Z", scope: "x y" });
  assertEquals(lireJetons({ access_token: "a" }, t0).refresh, null);
  assertThrows(() => lireJetons({ error: "invalid_grant", error_description: "Code expired" }), Error, "Code expired");
  assertThrows(() => lireJetons(null), Error, "access_token");
});

Deno.test("à renouveler à moins de 2 h de l'expiration", () => {
  const t0 = new Date("2026-10-28T10:00:00Z");
  assert(aRenouveler(null, t0));
  assert(aRenouveler("2026-10-28T11:30:00Z", t0));
  assert(!aRenouveler("2026-10-28T13:00:00Z", t0));
});

Deno.test("retry : seulement réseau, 429 et 5xx ; 1 s, 2 s ; au plus 3 essais", async () => {
  assert(erreurPassagere(null) && erreurPassagere(429) && erreurPassagere(503));
  assert(!erreurPassagere(200) && !erreurPassagere(401) && !erreurPassagere(400));
  const attentes: number[] = [];
  let n = 0;
  const r = await avecRetry(() => Promise.resolve({ statut: ++n < 3 ? 503 : 200, valeur: n }), {
    dormir: (ms) => Promise.resolve(void attentes.push(ms)),
  });
  assertEquals([r.statut, r.valeur, r.essais], [200, 3, 3]);
  assertEquals(attentes, [1000, 2000]);
  let m = 0;
  const refus = await avecRetry(() => Promise.resolve({ statut: 401, valeur: ++m }), { dormir: () => Promise.resolve() });
  assertEquals([refus.statut, refus.essais], [401, 1]);
});

Deno.test("racines du schéma et erreurs GraphQL", () => {
  const schema = {
    __schema: {
      queryType: { name: "Query" },
      mutationType: { name: "Mutation" },
      types: [
        { name: "Query", fields: [{ name: "user" }, { name: "companySelector" }] },
        { name: "Mutation", fields: [{ name: "b" }, { name: "a" }] },
      ],
    },
  };
  assertEquals(racinesSchema(schema), { requetes: ["companySelector", "user"], mutations: ["a", "b"] });
  assertEquals(erreurGraphql({ errors: [{ message: "Forbidden" }, { message: "x" }] }), "Forbidden · x");
  assertEquals(erreurGraphql({ data: {} }), null);
  assertEquals((abregerPourJournal({ a: "x".repeat(50) }, 20) as { abrege: boolean }).abrege, true);
});

Deno.test("contrats : requête sans le pays du freelance (il vient de l'annonce), lecture d'un nœud", () => {
  assert(!requeteContrats().includes("countryDetails"));
  assert(!requeteContrats().includes("freelancerProfile"));
  assert(requeteContrats().includes("states_any: [Active]"));
  assert(requeteContrats().includes("cursor"));
  const c = lireContrat({
    id: "o1", title: "Week 44", type: "FixedPrice", state: "Active", milestoneState: "Active",
    startDateTime: "1761000000000", team: { id: "t", name: "Vik" },
    freelancer: { id: "f", name: "Ana S.", freelancerProfile: { countryDetails: { twoLetterAbbreviation: "PT" } } },
    contractDetails: { id: "c9", status: "ACTIVE" },
  });
  assertEquals([c.offre_id, c.contrat_id, c.freelancer_nom, c.freelancer_pays, c.equipe_nom], ["o1", "c9", "Ana S.", "PT", "Vik"]);
  assertEquals(c.debut_at, new Date(1761000000000).toISOString());
  assertEquals(lireContrat({ id: "o2" }).contrat_id, null);
});

Deno.test("contrats : 50 par page, page suivante par le cursor de la dernière ligne (endCursor vide)", () => {
  assertEquals(TAILLE_PAGE_OFFRES, 50);
  const page = (debut: number, n: number, suite: boolean, fin: string | null = null) => ({
    edges: Array.from({ length: n }, (_, i) => ({ cursor: String(debut + i), node: { id: `o${debut + i}` } })),
    pageInfo: { endCursor: fin, hasNextPage: suite },
  });
  assertEquals(curseurSuivant(page(1, 50, true)), "50");
  assertEquals(curseurSuivant(page(51, 50, true)), "100");
  assertEquals(curseurSuivant(page(301, 39, false)), null);
  assertEquals(curseurSuivant(page(1, 50, true, "abc")), "abc");
  assertEquals(curseurSuivant({ edges: [], pageInfo: { hasNextPage: true, endCursor: null } }), null);
  assertEquals(curseurSuivant(null), null);
});

Deno.test("F1 : la 1re milestone financée et non payée, quel que soit son nom", () => {
  const details = {
    terms: {
      fixedPriceTerms: [{
        milestones: [
          { id: "m1", description: "Week 44", state: "Paid", sequenceId: 1, depositAmount: { rawValue: "1500", displayValue: "15.00" } },
          { id: "m3", description: "Week 46", state: "Active", sequenceId: 3, depositAmount: { rawValue: "1500", displayValue: "15.00" } },
          { id: "m2", description: " Week 45 ", state: "Submitted", sequenceId: 2, depositAmount: { rawValue: "1600", displayValue: "16.00" } },
          { id: "m4", description: "Week 47", state: "NotFunded", sequenceId: 4, depositAmount: { rawValue: "15" } },
        ],
      }],
    },
  };
  assertEquals(jalonAApprouver(details), { jalon_id: "m2", nom: "Week 45", montant: 16, etat: "Submitted", sequence: 2, nb_finances: 2 });
  assertEquals(jalonAApprouver({ terms: { fixedPriceTerms: [{ milestones: [{ id: "x", state: "NotFunded", sequenceId: 1 }] }] } }).jalon_id, null);
  // Sans displayValue : rawValue est en centimes.
  const sansAffichage = { terms: { fixedPriceTerms: [{ milestones: [{ id: "y", state: "Active", sequenceId: 1, depositAmount: { rawValue: "1100" } }] }] } };
  assertEquals(jalonAApprouver(sansAffichage).montant, 11);
  assertEquals(jalonAApprouver(null).nb_finances, 0);
});

Deno.test("contratFerme : seulement un statut lu et clairement terminé (décisions finales)", () => {
  for (const s of ["CLOSED", "Closed", "ENDED", "TERMINATED", "CANCELLED"]) assertEquals(contratFerme(s), true, s);
  for (const s of ["ACTIVE", "Active", "PAUSED", "SUSPENDED", "PENDING", "", null, undefined, "OTHER"]) assertEquals(contratFerme(s), false, String(s));
});

Deno.test("31/10 : VIk Studios (et Micabo) seulement ; fin de contrat : date et qui", () => {
  assertEquals([orgDeLOs("2074065383597823773"), orgDeLOs("1990051114607612379"), orgDeLOs("1908160914854122444"), orgDeLOs("1113124273601449984"), orgDeLOs(null)], [true, true, false, false, false]);
  assertEquals(lireFinContrat({ endDate: "2026-10-29T10:00:00Z", freelancer: { id: "F1" }, endedBy: { id: "F1" } }), { fin: "2026-10-29", par: "freelance" });
  assertEquals(lireFinContrat({ endDate: null, freelancer: { id: "F1" }, endedBy: { id: "C9" } }), { fin: null, par: "nous" });
});
