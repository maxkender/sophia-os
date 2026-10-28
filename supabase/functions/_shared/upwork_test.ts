/**
 * Upwork (0386) : adresses, échange du jeton, renouvellement, retry des
 * lectures seulement, lecture du schéma.
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  abregerPourJournal,
  aRenouveler,
  avecRetry,
  corpsJeton,
  erreurGraphql,
  erreurPassagere,
  lireContrat,
  lireJetons,
  requeteContrats,
  racinesSchema,
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

Deno.test("contrats : requête avec ou sans pays, lecture d'un nœud", () => {
  assert(requeteContrats(true).includes("countryDetails { twoLetterAbbreviation }"));
  assert(!requeteContrats(false).includes("countryDetails"));
  assert(requeteContrats(false).includes("states_any: [Active]"));
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
