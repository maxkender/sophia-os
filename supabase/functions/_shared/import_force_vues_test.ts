import { assert, assertEquals } from "jsr:@std/assert@1";

import { motifForceImport, plancherRapportElo, rapportEloComplet } from "./import_contenu.ts";

const SEUIL = 63;

function rapport(pertinence: number, vues: number) {
  return rapportEloComplet({
    pertinence,
    vues,
    langueSource: "en",
    prior: 50,
    k: 1,
    poidsVues: 0.7,
    vuesPlafond: 80_000,
    pisteSource: 40,
    poidsSource: 0.45,
    seuil: SEUIL,
  });
}

Deno.test("motifForceImport : les vues au-delà du plancher, sinon le forçage à la main", () => {
  assertEquals(motifForceImport({ import_elo_force_seuil: true, vues_source: 10 }, 40_000), "manuel");
  assertEquals(motifForceImport({ import_elo_force_seuil: false, vues_source: 40_000 }, 40_000), "vues");
  assertEquals(motifForceImport({ import_elo_force_seuil: false, vues_source: 333_700 }, 40_000), "vues");
  assertEquals(motifForceImport({ import_elo_force_seuil: false, vues_source: 39_999 }, 40_000), null);
  assertEquals(motifForceImport({ import_elo_force_seuil: null, vues_source: null }, 40_000), null);
  // 0 coupe la règle des vues, pas le forçage manuel.
  assertEquals(motifForceImport({ import_elo_force_seuil: false, vues_source: 1_000_000 }, 0), null);
  assertEquals(motifForceImport({ import_elo_force_seuil: true, vues_source: 1_000_000 }, 0), "manuel");
  // Forcé par les vues puis mémorisé dans le drapeau : il reste « vues » aux pas suivants.
  assertEquals(motifForceImport({ import_elo_force_seuil: true, vues_source: 333_700 }, 40_000), "vues");
});

Deno.test("plancherRapportElo : la note remonte au seuil et le contenu entre (C au moins)", () => {
  // rockyjune11 le 25/10 : 333 700 vues, pertinence 35 → note sous 63.
  const base = rapport(35, 333_700);
  assert(base.elo < SEUIL, `note de base ${base.elo}`);
  assertEquals(base.tier, null);

  const force = plancherRapportElo(base, SEUIL, "FORCÉ : test");
  assertEquals(force.elo, SEUIL);
  assert(force.tier !== null, "un contenu forcé a un tier");
  assert(force.lignes.every((l) => l.elo >= SEUIL && l.retenue));
  assert(force.texte.startsWith("FORCÉ : test"));
  assert(force.texte.includes("(forcée ≥ seuil)"));
  // Pure : le rapport d'origine n'a pas bougé.
  assertEquals(base.tier, null);
  assert(base.elo < SEUIL);
});

Deno.test("plancherRapportElo : une note déjà au-dessus du seuil reste la même", () => {
  const base = rapport(90, 80_000);
  assert(base.elo >= SEUIL);
  const force = plancherRapportElo(base, SEUIL, "FORCÉ");
  assertEquals(force.elo, base.elo);
  assertEquals(force.tier, base.tier);
});
