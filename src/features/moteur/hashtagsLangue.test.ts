import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { LANGUES_CIBLES } from "./langues";
import {
  HASHTAGS_PAR_LANGUE,
  hashtagsPour,
  languesSansHashtags,
} from "./hashtagsLangue";

/** Tags du jeu français — aucun ne doit sortir sur un compte étranger. */
const TAGS_FR = HASHTAGS_PAR_LANGUE.fr!;

/**
 * Tags SPÉCIFIQUEMENT français, relevés tels quels sur les 523 créneaux partis
 * en français depuis des comptes cs / hu / nl / pl / tr. `#fyp`, `#booktok` et
 * `#motivation` s'écrivent pareil dans plusieurs langues : ils ne comptent pas.
 */
const TAGS_FRANCAIS_SEULEMENT = [
  "#apprendre",
  "#culturegenerale",
  "#developpementpersonnel",
  "#pourtoi",
  "#savoir",
  "#apprendresurtiktok",
  "#connaissances",
  "#anecdotes",
];

describe("couverture des langues cibles", () => {
  it("chaque langue cible a son jeu de hashtags", () => {
    expect(languesSansHashtags()).toEqual([]);
  });

  it("couvre nommément les 7 langues qui retombaient sur le français", () => {
    // 523 créneaux sont partis avec « #apprendre #culturegenerale … » sur des
    // comptes cs / nl / el / hu / pl / ro / sv.
    for (const code of ["cs", "nl", "el", "hu", "pl", "ro", "sv"]) {
      expect(HASHTAGS_PAR_LANGUE[code], code).toBeDefined();
      expect(HASHTAGS_PAR_LANGUE[code]!.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("les tags français relevés en production n'existent que dans le jeu français", () => {
    for (const tag of TAGS_FRANCAIS_SEULEMENT) {
      expect(TAGS_FR, `${tag} devrait être dans le jeu fr`).toContain(tag);
    }
    for (const [code, pool] of Object.entries(HASHTAGS_PAR_LANGUE)) {
      if (code === "fr") continue;
      const empruntes = pool.filter((t) => TAGS_FRANCAIS_SEULEMENT.includes(t));
      expect(empruntes, `${code} emprunte ${empruntes.join(" ")}`).toEqual([]);
    }
  });

  it("tous les tags sont bien formés", () => {
    for (const [code, pool] of Object.entries(HASHTAGS_PAR_LANGUE)) {
      for (const tag of pool) {
        expect(tag.startsWith("#"), `${code} → ${tag}`).toBe(true);
        expect(tag.length, `${code} → ${tag}`).toBeGreaterThan(2);
        expect(/\s/.test(tag), `${code} → ${tag}`).toBe(false);
      }
      expect(new Set(pool).size, `${code} a des doublons`).toBe(pool.length);
    }
  });
});

describe("hashtagsPour", () => {
  it("rend exactement 3 tags de la langue demandée", () => {
    const sortie = hashtagsPour("pl", "compte-1-2026-09-17-0");
    const tags = sortie.split(" ");
    expect(tags).toHaveLength(3);
    for (const t of tags) expect(HASHTAGS_PAR_LANGUE.pl).toContain(t);
  });

  it("est déterministe et varie avec la graine", () => {
    expect(hashtagsPour("hu", "a")).toBe(hashtagsPour("hu", "a"));
    const differentes = new Set(
      ["a", "b", "c", "d", "e"].map((g) => hashtagsPour("hu", g)),
    );
    expect(differentes.size).toBeGreaterThan(1);
  });

  it("une langue inconnue retombe sur l'anglais, JAMAIS sur le français", () => {
    const sortie = hashtagsPour("xx", "graine");
    for (const t of sortie.split(" ")) {
      expect(HASHTAGS_PAR_LANGUE.en).toContain(t);
    }
  });

  it("aucune langue cible ne produit de tag français", () => {
    for (const code of LANGUES_CIBLES) {
      if (code === "fr") continue;
      for (const graine of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"]) {
        for (const tag of hashtagsPour(code, graine).split(" ")) {
          expect(TAGS_FRANCAIS_SEULEMENT, `${code} → ${tag}`).not.toContain(tag);
          expect(HASHTAGS_PAR_LANGUE[code], `${code} → ${tag}`).toContain(tag);
        }
      }
    }
  });
});

describe("copie Deno", () => {
  it("`hashtags_langue.ts` porte le même jeu que le module front", () => {
    const table = (chemin: string) => {
      const src = readFileSync(chemin, "utf8");
      const bloc = src.slice(
        src.indexOf("HASHTAGS_PAR_LANGUE: Record<string, string[]> = {"),
        src.indexOf("\n};"),
      );
      return bloc.replace(/\s+/g, " ").trim();
    };
    expect(table("supabase/functions/_shared/hashtags_langue.ts")).toBe(
      table("src/features/moteur/hashtagsLangue.ts"),
    );
  });

  it("plus aucun jeu de hashtags en dur dans les moteurs", () => {
    for (const chemin of [
      "supabase/functions/_shared/composer.ts",
      "supabase/functions/_shared/assignation_contenu.ts",
    ]) {
      const src = readFileSync(chemin, "utf8");
      expect(src, chemin).not.toContain("const HASHTAGS");
      expect(src, chemin).toContain('from "./hashtags_langue.ts"');
    }
  });
});
