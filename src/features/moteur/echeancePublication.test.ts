import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { FUSEAU_PAYS, echeancePublication, estManque, fuseauPays, publicationOuverte } from "./echeancePublication";

describe("échéance de publication", () => {
  it("fin du jour à l'heure locale du pays", () => {
    // Lundi 19/10 : Paris en CEST (UTC+2).
    expect(echeancePublication("2026-10-19", "FR").toISOString()).toBe("2026-10-19T22:00:00.000Z");
    // US → Los Angeles (PDT, UTC-7) : le plus à l'ouest.
    expect(echeancePublication("2026-10-19", "US").toISOString()).toBe("2026-10-20T07:00:00.000Z");
    // NZ (NZDT, UTC+13).
    expect(echeancePublication("2026-10-19", "NZ").toISOString()).toBe("2026-10-19T11:00:00.000Z");
    // Après le passage à l'heure d'hiver à Paris (25/10).
    expect(echeancePublication("2026-10-26", "FR").toISOString()).toBe("2026-10-26T23:00:00.000Z");
    // Jour du changement d'heure lui-même.
    expect(echeancePublication("2026-10-24", "DE").toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });

  it("pays inconnu ou absent : Honolulu, le plus tolérant", () => {
    expect(fuseauPays(null)).toBe("Pacific/Honolulu");
    expect(echeancePublication("2026-10-19", null).toISOString()).toBe("2026-10-20T10:00:00.000Z");
  });

  it("manqué seulement non publié et après l'échéance", () => {
    const post = { date_publication_prevue: "2026-10-19", publie_at: null };
    expect(estManque(post, "FR", new Date("2026-10-19T21:59:00Z"))).toBe(false);
    expect(estManque(post, "FR", new Date("2026-10-19T22:01:00Z"))).toBe(true);
    expect(estManque({ ...post, publie_at: "2026-10-19T20:00:00Z" }, "FR", new Date("2026-10-21T00:00:00Z"))).toBe(false);
    expect(publicationOuverte("2026-10-19", "US", new Date("2026-10-20T06:59:00Z"))).toBe(true);
    expect(publicationOuverte("2026-10-19", "US", new Date("2026-10-20T07:01:00Z"))).toBe(false);
  });

  it("posts d'avant le lancement : pas d'échéance", () => {
    expect(publicationOuverte("2026-10-18", "FR", new Date("2026-10-25T00:00:00Z"))).toBe(true);
    expect(estManque({ date_publication_prevue: "2026-10-18", publie_at: null }, "FR", new Date("2026-10-25T00:00:00Z"))).toBe(false);
  });

  it("même table que la fonction SQL fuseau_pays (0304)", () => {
    const sql = readFileSync(resolve(__dirname, "../../../supabase/migrations/0304_echeance_publication.sql"), "utf8");
    const dansSql = Object.fromEntries([...sql.matchAll(/when '([A-Z]{2})' then '([^']+)'/g)].map((m) => [m[1], m[2]]));
    expect(dansSql).toEqual({ ...FUSEAU_PAYS });
    expect(sql).toContain("else 'Pacific/Honolulu'");
    expect(sql).toContain("date '2026-10-19'");
  });
});
