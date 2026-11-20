import { describe, expect, it } from "vitest";

import { appliquerResolution, fusionner, handleDe, lienCompte, lireLigne, lireLignes, nomLabelValide } from "./parse";
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

  it("« runvik », l'ancien nom de travail, désigne Atala dès qu'elle existe dans l'OS", () => {
    const apps = [...APPS, { id: "a-atala", slug: "atala", nom: "Atala" }];
    const l = lireLigne("Sophia clean_girl + runvik clean_girl_run https://www.tiktok.com/@crushed.ethereal", apps, LABELS);
    expect(l.appIds).toEqual(["a-sophia", "a-atala"]);
    expect(l.appsAttente).toEqual([]);
    expect(l.autres).toEqual([{ sujet: "Atala", app: "Atala", label: "clean_girl_run" }]);
    expect(lireLigne("atala male_run https://www.tiktok.com/@un", apps, LABELS)).toMatchObject({ appIds: ["a-atala"], labelPropose: "male_run" });
  });

  it("le label donne l'app quand elle n'est pas écrite ; une ligne sans lien est signalée", () => {
    expect(lireLigne("clean_study https://www.tiktok.com/@sally.htg", APPS, LABELS).appIds).toEqual(["a-micabo"]);
    expect(lireLigne("juste du texte", APPS, LABELS)).toMatchObject({ ignoree: true, handle: null });
    expect(handleDe("@Sally.HTG")).toBe("sally.htg");
    expect(nomLabelValide("anxiety_run")).toBe(true);
    expect(nomLabelValide("Anxiety Run")).toBe(false);
  });

  it("une liste de liens sans consigne : à trier ; liens courts résolus ; posts rattachés ; le reste ignoré", () => {
    const lues = lireLignes(
      [
        "https://vm.tiktok.com/ZNdAbC123/",
        "https://www.tiktok.com/@remistudy",
        "https://www.tiktok.com/@remistudy/photo/7512345678901234567",
        "https://www.instagram.com/someone/",
        "une idée en vrac",
      ].join("\n"),
      APPS,
      LABELS,
    );
    expect(lues.filter((l) => l.ignoree)).toHaveLength(2);
    const resolues = lues.filter((l) => !l.ignoree).map((l) => appliquerResolution(l, { "https://vm.tiktok.com/ZNdAbC123/": "https://www.tiktok.com/@melih.diane/video/7600000000000000001" }));
    const fiches = fusionner(resolues);
    expect(fiches.map((f) => [f.handle, f.posts.length, f.appIds.length, f.labelId, f.labelPropose])).toEqual([
      ["melih.diane", 1, 0, null, null],
      ["remistudy", 1, 0, null, null],
    ]);
  });
});

describe("20/11 : un lien de TikTok devient le lien du compte", () => {
  it("coupe au handle (vidéo, photo, paramètres), garde les liens courts et le reste du texte", () => {
    const t = lienCompte(
      "https://www.tiktok.com/@Crushed.Ethereal/video/7571234567890123456?is_from_webapp=1&sender_device=pc\n" +
        "https://m.tiktok.com/@abc_1/photo/7570000000000000000\nhttps://www.tiktok.com/@deja?lang=fr\nhttps://vm.tiktok.com/ZMabc123/ @handle",
    );
    expect(t).toBe("https://www.tiktok.com/@crushed.ethereal\nhttps://www.tiktok.com/@abc_1\nhttps://www.tiktok.com/@deja\nhttps://vm.tiktok.com/ZMabc123/ @handle");
  });

  it("l'ajout en masse enregistre le lien du compte, jamais celui de la vidéo", () => {
    const l = lireLigne("https://www.tiktok.com/@x.y/video/7571234567890123456?lang=fr", [], []);
    expect(l.profilUrl).toBe("https://www.tiktok.com/@x.y");
    expect(l.posts).toEqual(["https://www.tiktok.com/@x.y/video/7571234567890123456?lang=fr"]);
  });
});
