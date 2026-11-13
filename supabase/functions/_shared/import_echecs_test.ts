// Plafond et attente des échecs de suite d'un contenu dans la file d'import.
import { assertEquals } from "jsr:@std/assert@1";
import { bailApresPassage, MAX_ECHECS_CONTENU } from "./import_contenu.ts";

const T0 = Date.UTC(2026, 10, 13, 17, 0, 0);
const minutesApres = (iso: string | null) => (iso === null ? null : (Date.parse(iso) - T0) / 60_000);

Deno.test("bailApresPassage : aucun bail quand le pas a avancé", () => {
  assertEquals(bailApresPassage(0, true, T0), null);
  assertEquals(bailApresPassage(3, true, T0), null);
  assertEquals(bailApresPassage(0, false, T0), null);
});

Deno.test("bailApresPassage : l'attente double à chaque échec de suite, 60 min au plus", () => {
  assertEquals([1, 2, 3, 4, 5, 6, 7, 8, 20].map((n) => minutesApres(bailApresPassage(n, false, T0))), [
    1, 2, 4, 8, 16, 32, 60, 60, 60,
  ]);
});

Deno.test("MAX_ECHECS_CONTENU : les essais couvrent une panne passagère d'environ 2 h", () => {
  let total = 0;
  for (let n = 1; n < MAX_ECHECS_CONTENU; n++) total += minutesApres(bailApresPassage(n, false, T0)) ?? 0;
  assertEquals(MAX_ECHECS_CONTENU, 8);
  assertEquals(total, 123);
});
