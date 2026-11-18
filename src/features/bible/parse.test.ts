import { describe, expect, it } from "vitest";

import { handleDe, lireLigne, lireLignes, nomLabelValide } from "./parse";
import type { AppBible, LabelBible } from "./types";

const APPS: AppBible[] = [
  { id: "a-sophia", slug: "sophia", nom: "Sophia" },
  { id: "a-micabo", slug: "micabo", nom: "micabo" },
];
const LABELS: LabelBible[] = [
  { id: "l-alpha", nom: "alpha_male", style_theme: null, application_id: "a-sophia", apps: ["a-sophia"] },
  { id: "l-study", nom: "clean_study", style_theme: null, application_id: "a-sophia", apps: ["a-micabo"] },
];

describe("Bible : ajout en masse", () => {
  it("les 3 lignes de Max", () => {
    const [a, b, c] = lireLignes(
      [
        "pour sophia clean_girl : https://www.tiktok.com/@crushedethereal",
        "alpha_male, mettre running dessus : https://www.tiktok.com/@trusttheprocces1",
        "nouveau label anxiety_run : https://www.tiktok.com/@sydneysynced",
      ].join("\n"),
      APPS,
      LABELS,
    );
    expect(a).toMatchObject({ handle: "crushedethereal", appIds: ["a-sophia"], labelId: null, labelPropose: "clean_girl", note: "", erreur: null });
    expect(b).toMatchObject({ handle: "trusttheprocces1", appIds: ["a-sophia"], labelId: "l-alpha", labelPropose: null, note: "mettre running dessus" });
    expect(c).toMatchObject({ handle: "sydneysynced", appIds: [], labelPropose: "anxiety_run", note: "" });
  });

  it("liens de posts, app en attente, deux labels (polyvalent)", () => {
    const l = lireLigne(
      "Sophia clean_girl + runvik clean_girl_run https://www.tiktok.com/@Crushed.Ethereal/photo/7512345678901234567 refaire avec d'autres photos",
      APPS,
      LABELS,
      ["Runvik – running"],
    );
    expect(l.handle).toBe("crushed.ethereal");
    expect(l.posts).toEqual(["https://www.tiktok.com/@Crushed.Ethereal/photo/7512345678901234567"]);
    expect(l.appIds).toEqual(["a-sophia"]);
    expect(l.appsAttente).toEqual(["Runvik – running"]);
    expect(l.labelPropose).toBe("clean_girl");
    expect(l.autres).toEqual([{ sujet: "Runvik – running", app: "Runvik – running", label: "clean_girl_run" }]);
    expect(l.note).toBe("refaire avec d'autres photos");
  });

  it("le label donne l'app quand elle n'est pas écrite ; une ligne sans lien est signalée", () => {
    expect(lireLigne("clean_study https://www.tiktok.com/@sally.htg", APPS, LABELS).appIds).toEqual(["a-micabo"]);
    expect(lireLigne("juste du texte", APPS, LABELS).erreur).toMatch(/aucun lien/);
    expect(handleDe("@Sally.HTG")).toBe("sally.htg");
    expect(nomLabelValide("anxiety_run")).toBe(true);
    expect(nomLabelValide("Anxiety Run")).toBe(false);
  });
});
