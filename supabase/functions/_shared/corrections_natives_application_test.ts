import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import { blocRetoursApplication } from "./corrections_natives.ts";

Deno.test("blocRetoursApplication : rien à dire, pas de bloc (le prompt du placement reste celui d'avant)", () => {
  assertEquals(blocRetoursApplication("it", []), null);
  assertEquals(blocRetoursApplication("it", [{ fautif: "  ", corrige: null, explication: null }]), null);
});

Deno.test("blocRetoursApplication : « au lieu de / écris », « évite », l'explication, sans doublon", () => {
  const bloc = blocRetoursApplication("it", [
    { fautif: "Sophia app", corrige: "Sophia", explication: "répétition" },
    { fautif: "sophia APP", corrige: "Sophia", explication: null },
    { fautif: "Leggo un corso su un'app come Sophia", corrige: null, explication: null },
  ])!;
  assertStringIncludes(bloc, "SUR LA SLIDE DE L'APPLI (IT)");
  assertStringIncludes(bloc, "- au lieu de « Sophia app », écris « Sophia » (répétition)");
  assertStringIncludes(bloc, "- évite « Leggo un corso su un'app come Sophia »");
  assertEquals(bloc.split("\n").filter((l) => l.startsWith("- ")).length, 2);
});
