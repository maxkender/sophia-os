import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const lire = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("prompt 15, point 6 : ce que voit le posteur", () => {
  it("d) toujours en anglais : sélecteur de langue caché pour le rôle poster, anglais forcé", () => {
    expect(lire("src/components/layout/AppShell.tsx")).toContain('SUPPORTED_LANGUAGES.length > 1 && roleReel !== "poster"');
    expect(lire("src/components/layout/PosterLayout.tsx")).toContain('roleReel === "poster" && i18n.resolvedLanguage !== "en"');
  });

  it("d) « Copy all texts » copie un texte en anglais", () => {
    const page = lire("src/pages/poster/PosterPostPage.tsx");
    expect(page).toContain("`Caption:\\n${post.hashtags}`");
    expect(page).toContain("`Sound: ${post.musique_url}`");
    expect(page).not.toContain("`Description :");
    expect(page).not.toContain("`Musique :");
  });

  it("e) les flèches ↑↓ des slides : admin seulement", () => {
    expect(lire("src/pages/poster/PosterPostPage.tsx")).toMatch(/\{!publie && estAdmin && \(\s*<div className="flex gap-1">\s*<Button[\s\S]{0,120}posts\.monterSlide/);
  });
});
