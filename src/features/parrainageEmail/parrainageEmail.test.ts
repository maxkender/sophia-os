import { describe, expect, it } from "vitest";

import { langueEmail, lienCreators, prochaineEtape, rendreEmail, TEXTES_PARRAINAGE } from "../../../supabase/functions/_shared/parrainage_email";

const base = { prenom: "Maria", referrer: "Nikos", tarif: 10, lien: "https://vik-studios-creators.com/en/creators/slideshow?ref=NIKOS7", lienDesinscription: "https://x/unsub" };

describe("8/11 : emails de parrainage", () => {
  it("J0 anglais : le texte de Max, le tarif, le lien et la désinscription", () => {
    const r = rendreEmail({ ...base, etape: 0, langue: "en" });
    expect(r.objet).toBe("Nikos thinks you'd be great for this 🙂");
    expect(r.texte).toContain("Nikos recommended you for a paid side job with Sophia, a learning app.");
    expect(r.texte).toContain("💰 $10/week · ⏱ under 10 minutes a day · 💸 paid every Monday");
    expect(r.html).toContain('href="https://vik-studios-creators.com/en/creators/slideshow?ref=NIKOS7"');
    expect(r.html).toContain("Unsubscribe");
  });

  it("la langue du pays (grec, es-419 → es), anglais sinon", () => {
    expect(langueEmail("el")).toBe("el");
    expect(langueEmail("es-419")).toBe("es");
    expect(langueEmail("pt-BR")).toBe("pt");
    expect(langueEmail("ko")).toBe("en");
    expect(rendreEmail({ ...base, etape: 2, langue: "de" }).objet).toBe("Kurze Erinnerung: Nikos hat dich empfohlen 🙂");
    // 10/11 : vik-studios-creators.com, la page de la langue du filleul.
    expect(lienCreators("es-419", "AB12")).toBe("https://vik-studios-creators.com/es/creators/slideshow?ref=AB12");
    expect(lienCreators("el", "AB12")).toBe("https://vik-studios-creators.com/el/creators/slideshow?ref=AB12");
    expect(lienCreators("pt-BR", "AB12")).toBe("https://vik-studios-creators.com/pt/creators/slideshow?ref=AB12");
  });

  it("3 emails au plus : J0, J+2, J+5", () => {
    expect([0, 1, 2, 3].map(prochaineEtape)).toEqual([0, 2, 5, null]);
  });

  it("chaque langue a les 3 emails complets", () => {
    for (const [l, t] of Object.entries(TEXTES_PARRAINAGE)) {
      for (const e of [0, 2, 5] as const) {
        expect(t.objet[e], `${l} objet ${e}`).toContain("{referrer}".replace("{referrer}", "") || "");
        expect(t.corps[e].length, `${l} corps ${e}`).toBeGreaterThan(1);
      }
      expect(t.corps[0].join(" "), l).toContain("{tarif}");
    }
  });
});
