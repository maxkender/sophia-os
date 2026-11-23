import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { LOGOS } from "@/components/brand/logosApplications";
import { couleurApplication, nomAffiche, trierApplications } from "@/components/brand/identiteApplications";

import { MOTIFS_PAR_APPLICATION } from "../../../supabase/functions/_shared/concurrents";
import { APP_VERS_NOTION } from "../../../supabase/functions/_shared/notion";
import {
  CATALOGUE_APPLICATIONS,
  enumererMarques,
  ficheApplication,
  ficheApplicationParId,
  idApplication,
  marqueApplication,
  marqueCapitalisee,
  SLUGS_APPLICATIONS,
} from "./catalogueApplications";
import { ID_SOPHIA, SLUG_SOPHIA } from "./multiApp";

const corps = (chemin: string) => readFileSync(chemin, "utf8").split("*/").slice(1).join("*/").trim();

describe("catalogue des applications", () => {
  it("liste Sophia, micabo, Unswipe, Atala et Artura, dans cet ordre, sans doublon", () => {
    expect(SLUGS_APPLICATIONS).toEqual(["sophia", "micabo", "unswipe", "atala", "artura"]);
    expect(new Set(CATALOGUE_APPLICATIONS.map((a) => a.id)).size).toBe(CATALOGUE_APPLICATIONS.length);
    expect(idApplication(SLUG_SOPHIA)).toBe(ID_SOPHIA);
    expect(idApplication("atala")).toBe("00000000-0000-4000-8000-000000000004");
    expect(idApplication("artura")).toBe("00000000-0000-4000-8000-000000000005");
    for (const app of CATALOGUE_APPLICATIONS) {
      expect(app.slug, app.slug).toMatch(/^[a-z][a-z0-9_-]{1,31}$/);
      expect(app.id, app.slug).toMatch(/^00000000-0000-4000-8000-0000000000\d\d$/);
      expect(app.nom.trim(), app.slug).not.toBe("");
      expect(app.concept.trim(), app.slug).not.toBe("");
    }
  });

  it("rend la fiche par slug ou par id, quelle que soit la casse ; rien hors catalogue", () => {
    expect(ficheApplication(" Atala ")?.concept).toBe("course à pied (running)");
    expect(ficheApplicationParId("00000000-0000-4000-8000-000000000002")?.slug).toBe("micabo");
    expect(ficheApplication("inconnue")).toBeNull();
    expect(ficheApplication(null)).toBeNull();
    expect(() => idApplication("inconnue")).toThrow(/hors catalogue/);
  });

  it("écrit la marque comme dans un post, et avec une majuscule dans une phrase", () => {
    expect(marqueApplication("unswipe")).toBe("UnSwipe");
    expect(marqueApplication("micabo")).toBe("micabo");
    expect(marqueCapitalisee("micabo")).toBe("Micabo");
    expect(marqueCapitalisee("atala")).toBe("Atala");
    expect(marqueApplication("nouvelle")).toBe("nouvelle");
    expect(enumererMarques()).toBe("Sophia, Micabo, UnSwipe, Atala, Artura");
    expect(enumererMarques("et")).toBe("Sophia, Micabo, UnSwipe, Atala et Artura");
    expect(enumererMarques("ou")).toBe("Sophia, Micabo, UnSwipe, Atala ou Artura");
  });

  it("`catalogue_applications.ts` (Deno) est identique au module front (hors en-tête)", () => {
    expect(corps("supabase/functions/_shared/catalogue_applications.ts")).toBe(
      corps("src/features/moteur/catalogueApplications.ts"),
    );
  });

  it("`themeLabel.ts` (front) est identique à `label_theme.ts` (Deno, hors en-tête)", () => {
    expect(corps("src/features/moteur/themeLabel.ts")).toBe(corps("supabase/functions/_shared/label_theme.ts"));
  });
});

// La liste de ce qu'une application doit avoir À CÔTÉ du catalogue. Ajouter
// une ligne au catalogue sans le reste fait échouer ces tests, qui disent quoi
// ajouter et où (voir docs/applications.md).
describe("une application du catalogue est complète", () => {
  const css = readFileSync("src/index.css", "utf8");

  it.each(CATALOGUE_APPLICATIONS.map((a) => a.slug))("%s : logo, couleur claire et sombre, nom", (slug) => {
    expect(LOGOS[slug], `logo : src/assets/applications/${slug}.png + logosApplications.ts`).toBeTruthy();
    const definitions = css.match(new RegExp(`--app-${slug}: #[0-9a-f]{6};`, "g")) ?? [];
    expect(definitions.length, `couleur : --app-${slug} (clair ET sombre) dans src/index.css`).toBe(2);
    expect(css, `couleur Tailwind : --color-app-${slug} dans src/index.css`).toContain(
      `--color-app-${slug}: var(--app-${slug});`,
    );
    expect(couleurApplication(slug)).toBe(`var(--app-${slug})`);
    expect(nomAffiche(slug)).toBe(ficheApplication(slug)!.nom);
  });

  it.each(CATALOGUE_APPLICATIONS.filter((a) => a.slug !== SLUG_SOPHIA).map((a) => a.slug))(
    "%s : motif de concurrents (concurrents.ts)",
    (slug) => {
      expect(MOTIFS_PAR_APPLICATION[slug], `motif à écrire dans _shared/concurrents.ts`).toBeInstanceOf(RegExp);
    },
  );

  it.each(CATALOGUE_APPLICATIONS.map((a) => a.slug))("%s : nom dans le suivi Notion (notion.ts)", (slug) => {
    expect(APP_VERS_NOTION[slug], `ligne à ajouter dans APP_VERS_NOTION`).toBeTruthy();
  });

  it("une application hors catalogue garde le gris « autre » et son slug", () => {
    expect(couleurApplication("nouvelle")).toBe("var(--app-autre)");
    expect(nomAffiche("nouvelle")).toBe("nouvelle");
  });

  it("trie les applications dans l'ordre du catalogue, les inconnues à la fin", () => {
    const slugs = ["atala", "nouvelle", "unswipe", "sophia", "micabo"];
    expect(trierApplications(slugs, (s) => s)).toEqual(["sophia", "micabo", "unswipe", "atala", "nouvelle"]);
  });
});
