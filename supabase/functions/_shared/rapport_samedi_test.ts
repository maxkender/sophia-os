import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import { type RapportSamedi, samediDe, texteRapportSamedi } from "./rapport_samedi.ts";

const r: RapportSamedi = {
  samedi: "2026-11-21", complets: 2, comptes_partiels: 1,
  par_hm: [{ hm: "Hm Test", complets: 2, partiels: 1 }], par_pays: [{ pays: "FR", complets: 2, partiels: 1 }],
  etapes_complets: [
    { etape: "a", libelle: "Comptes désactivés", ok: 2, echec: 0, a_faire: 0, noms: [] },
    { etape: "f", libelle: "Désactivé du Slack", ok: 1, echec: 0, a_faire: 1, noms: [{ nom: "Posteur Un", statut: "main", detail: null }] },
  ],
  etapes_partiels: [], milestones_a_corriger: [{ nom: "Posteur Deux", detail: "Week 47 : 28 $ (attendu 14 $)" }],
  controle: [{ type: "slack", libelle: "Killé mais encore dans Slack", nb: 1, lignes: [{ nom: "Posteur Trois", detail: null }] }],
};

Deno.test("rapport du samedi : comptes, étapes en échec nommées, milestones, contrôle", () => {
  const t = texteRapportSamedi(r, "https://os.test/rapport");
  assertStringIncludes(t, "2 posteurs killés (complets), 1 compte killé");
  assertStringIncludes(t, "✅ a) Comptes désactivés : 2 OK");
  assertStringIncludes(t, "⚠️ f) Désactivé du Slack : 1 OK, 1 à faire\n      Posteur Un");
  assertStringIncludes(t, "Posteur Deux (Week 47 : 28 $ (attendu 14 $))");
  assertStringIncludes(t, "⚠️ Killé mais encore dans Slack : 1");
});

Deno.test("le samedi d'une date", () => {
  assertEquals(samediDe("2026-11-21"), "2026-11-21");
  assertEquals(samediDe("2026-11-22"), "2026-11-21");
  assertEquals(samediDe("2026-11-23"), "2026-11-21");
  assertEquals(samediDe("2026-11-20"), "2026-11-14");
});
