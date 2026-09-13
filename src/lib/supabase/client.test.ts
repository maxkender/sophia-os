import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSupabase, viseRest } from "./client";

const REST = "https://projet.supabase.co/rest/v1/comptes?select=id";
const FONCTION = "https://projet.supabase.co/functions/v1/manage-users";

describe("fetch du client Supabase", () => {
  let appels: Array<{ url: string; entetes: Headers }>;

  beforeEach(() => {
    appels = [];
    vi.stubGlobal("fetch", (entree: RequestInfo | URL, init?: RequestInit) => {
      appels.push({
        url: String(entree),
        entetes: new Headers(init?.headers ?? {}),
      });
      return Promise.resolve(new Response("{}"));
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reconnaît les requêtes PostgREST", () => {
    expect(viseRest(REST)).toBe(true);
    expect(viseRest(`${REST}&x=/functions/v1/`)).toBe(true);
    expect(viseRest(FONCTION)).toBe(false);
    expect(viseRest("https://projet.supabase.co/storage/v1/object/medias/x")).toBe(false);
  });

  it("pose no-store sur PostgREST, sans perdre les en-têtes d'origine", async () => {
    await fetchSupabase(REST, { headers: { apikey: "k" } });
    expect(appels[0].entetes.get("cache-control")).toBe("no-store");
    expect(appels[0].entetes.get("apikey")).toBe("k");
  });

  it("laisse les Edge Functions intactes", async () => {
    // Régression : `global.headers` collait `Cache-Control` à TOUTES les
    // requêtes. Le préflight des Edge Functions ne l'autorise pas, donc le
    // navigateur bloquait l'appel — « Failed to send a request to the Edge
    // Function » sur Start warmup et sur tous les autres `invoke`.
    await fetchSupabase(FONCTION, { method: "POST", headers: { apikey: "k" } });
    expect(appels[0].entetes.has("cache-control")).toBe(false);
    expect(appels[0].entetes.get("apikey")).toBe("k");
  });

  it("laisse le storage intact", async () => {
    await fetchSupabase("https://projet.supabase.co/storage/v1/object/medias/x");
    expect(appels[0].entetes.has("cache-control")).toBe(false);
  });
});
