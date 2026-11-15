import { assertEquals } from "jsr:@std/assert@1";
import { capturesValides, nettoyerReponses, texteCourt } from "./questionnaire.ts";

Deno.test("questionnaire : réponses nettoyées (clés simples, textes, listes)", () => {
  const r = nettoyerReponses({ genre: "Woman", warmup_actions: ["Like", "", 3, "Follow"], "bad key": "x", vide: "  ", obj: { a: 1 } });
  assertEquals(r, { genre: "Woman", warmup_actions: ["Like", "Follow"] });
  assertEquals(nettoyerReponses(["x"]), {});
  assertEquals(texteCourt("  Ana   T. ", 120), "Ana T.");
  assertEquals(texteCourt(42, 10), null);
});

Deno.test("questionnaire : captures seulement sous le dossier du jeton, 3 au plus, questions connues", () => {
  const p = "top-posters/abc-123-xyz-000000000000/";
  const c = capturesValides({
    capture_temps: [`${p}capture_temps-1.png`, `${p}capture_temps-2.png`, `${p}x.png`, `${p}y.png`],
    capture_audience: ["autre/dossier/a.png", `${p}../b.png`],
    inconnue: [`${p}z.png`],
  }, p);
  assertEquals(c, { capture_temps: [`${p}capture_temps-1.png`, `${p}capture_temps-2.png`, `${p}x.png`] });
});
