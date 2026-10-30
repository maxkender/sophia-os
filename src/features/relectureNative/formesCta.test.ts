import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { FORMES_CTA, SLIDE_CTA_MIN } from "./formesCta";

describe("copie Deno des formes de CTA", () => {
  const serveur = readFileSync("supabase/functions/_shared/formes_cta.ts", "utf8");
  const liste = serveur.slice(serveur.indexOf("export const FORMES_CTA"), serveur.indexOf("];") + 2);

  it("les mêmes formes, dans le même ordre, avec les mêmes textes", () => {
    const champ = (nom: string) => [...liste.matchAll(new RegExp(`${nom}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g"))].map((m) => m[1]);
    expect(champ("code")).toEqual(FORMES_CTA.map((f) => f.code));
    expect(champ("nom")).toEqual(FORMES_CTA.map((f) => f.nom));
    expect(champ("definition")).toEqual(FORMES_CTA.map((f) => f.definition));
    expect(champ("exemple")).toEqual(FORMES_CTA.map((f) => f.exemple));
  });

  it("la même slide minimale pour le CTA", () => {
    expect(serveur).toContain(`export const SLIDE_CTA_MIN = ${SLIDE_CTA_MIN};`);
  });
});
