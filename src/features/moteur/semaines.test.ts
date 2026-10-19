import { describe, expect, it } from "vitest";

import { debutParDefaut, joursFenetre, lundiDe } from "./semaines";
import { miniatureStorage } from "./miniature";

describe("fenêtre de 2 semaines", () => {
  it("semaine passée + semaine en cours, du lundi au dimanche (Paris)", () => {
    expect(lundiDe("2026-10-19")).toBe("2026-10-19");
    expect(lundiDe("2026-10-25")).toBe("2026-10-19");
    // Lundi 19/10 à 10:00 Paris : du 12 au 25.
    const debut = debutParDefaut(new Date("2026-10-19T08:00:00Z"));
    expect(debut).toBe("2026-10-12");
    const jours = joursFenetre(debut);
    expect(jours).toHaveLength(14);
    expect(jours[13]).toBe("2026-10-25");
  });

  it("bascule le dimanche à minuit, heure de Paris", () => {
    // Dimanche 25/10 23:30 Paris (heure d'hiver, UTC+1) : encore la fenêtre du 12.
    expect(debutParDefaut(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-12");
    // Lundi 26/10 00:30 Paris : fenêtre du 19.
    expect(debutParDefaut(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-19");
  });
});

describe("miniature Storage", () => {
  it("passe par le rendu redimensionné, sans les paramètres d'origine", () => {
    expect(
      miniatureStorage("https://x.supabase.co/storage/v1/object/public/medias/a/1.png?v=123"),
    ).toBe("https://x.supabase.co/storage/v1/render/image/public/medias/a/1.png?width=96&quality=50");
    expect(miniatureStorage("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
    expect(miniatureStorage(null)).toBeNull();
  });
});
