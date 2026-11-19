import { describe, expect, it } from "vitest";

import { candidatesRepartition } from "./candidates";

const SOPHIA = { id: "id-sophia", slug: "sophia", langues: null, actif: true };
const MICABO = { id: "id-micabo", slug: "micabo", langues: ["fr", "de"], actif: true };
const ATALA = { id: "id-atala", slug: "atala", langues: null, actif: false };
const VIEILLE = { id: "id-vieille", slug: "vieille", langues: null, actif: false };

describe("candidatesRepartition", () => {
  it("sans application en préparation, seules les actives sont candidates", () => {
    const r = candidatesRepartition([SOPHIA, MICABO, ATALA], []);
    expect(r.candidates.map((a) => a.slug)).toEqual(["sophia", "micabo"]);
    expect([...r.enPreparation]).toEqual([]);
  });

  it("une application inactive en préparation devient candidate, et elle est marquée", () => {
    const r = candidatesRepartition([SOPHIA, MICABO, ATALA], ["id-atala"]);
    expect(r.candidates).toEqual([
      { id: "id-sophia", slug: "sophia", langues: null },
      { id: "id-micabo", slug: "micabo", langues: ["fr", "de"] },
      { id: "id-atala", slug: "atala", langues: null },
    ]);
    expect([...r.enPreparation]).toEqual(["atala"]);
  });

  it("une application inactive sans label reste dehors", () => {
    const r = candidatesRepartition([SOPHIA, ATALA, VIEILLE], ["id-atala"]);
    expect(r.candidates.map((a) => a.slug)).toEqual(["sophia", "atala"]);
  });

  it("une application active n'est jamais marquée en préparation", () => {
    // Liste lue juste avant l'activation : `actif` fait foi.
    const r = candidatesRepartition([SOPHIA, { ...ATALA, actif: true }], ["id-atala"]);
    expect(r.candidates.map((a) => a.slug)).toEqual(["sophia", "atala"]);
    expect([...r.enPreparation]).toEqual([]);
  });
});
