import i18next from "i18next";
import { beforeAll, describe, expect, it } from "vitest";

import { fr } from "@/locales/fr";

import { joursCourts, lignesDiagnostic, type DiagnosticCkd } from "./diagnostic";

/** Les nombres français prennent une espace fine insécable. */
const esp = (s: string) => s.replace(/\s/g, " ");

const base: DiagnosticCkd = {
  badge: "shadowban",
  attendus: 10,
  publies: 4,
  liens_manquants: ["2026-10-17", "2026-10-18", "2026-10-20", "2026-10-21"],
  mediane: 0,
  mediane_ref: 1353,
  morts: 4,
  seuil_mort: 50,
  shadowban: true,
};

describe("diagnostic en 3 lignes", () => {
  beforeAll(async () => {
    await i18next.init({ lng: "fr", resources: { fr: { translation: fr.translation } } });
  });

  it("l'exemple de Max, mot pour mot", () => {
    const l = lignesDiagnostic(base, i18next.t, "fr");
    expect(l.badge).toBe("shadowban");
    expect(l.posts).toBe("Posts : 4 publiés sur 10 attendus, 6 liens manquants (17, 18, 20, 21 oct.)");
    expect(esp(l.vues)).toBe("Vues : médiane 0 (pays : 1 353), 4 posts morts (< 50 vues)");
    expect(l.verdict).toBe("Verdict : shadowban probable → nouveau compte");
  });

  it("compte à jour : pas de liens manquants ni de posts morts", () => {
    const l = lignesDiagnostic(
      { ...base, badge: "ok", publies: 10, liens_manquants: [], mediane: 1500, morts: 0, shadowban: false },
      i18next.t,
      "fr",
    );
    expect(l.posts).toBe("Posts : 10 publiés sur 10 attendus");
    expect(esp(l.vues)).toBe("Vues : médiane 1 500 (pays : 1 353)");
    expect(l.verdict).toBe("Verdict : OK");
  });

  it("singulier : 1 lien manquant, 1 post mort", () => {
    const l = lignesDiagnostic({ ...base, badge: "posts_manquants", publies: 9, liens_manquants: ["2026-10-21"], morts: 1 }, i18next.t, "fr");
    expect(l.posts).toBe("Posts : 9 publiés sur 10 attendus, 1 lien manquant (21 oct.)");
    expect(l.vues).toContain("1 post mort (< 50 vues)");
  });

  it("jours courts", () => {
    expect(joursCourts([], "fr")).toBe("");
    expect(joursCourts(["2026-10-30", "2026-11-02"], "en")).toBe("30, 2 Nov");
  });
});
