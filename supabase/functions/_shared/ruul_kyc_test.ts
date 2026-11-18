import { assert, assertStringIncludes } from "jsr:@std/assert@1";

import { estManque, texteKyc } from "./ruul_kyc.ts";

Deno.test("relance KYC : adaptée à ce qui manque, avec l'email exact", () => {
  const i = texteKyc("inscription", "ana@exemple.zz");
  assertStringIncludes(i, "create your account on app.ruul.io with ana@exemple.zz");
  assertStringIncludes(texteKyc("identite", "ana@exemple.zz"), "verify your identity and add your withdrawal method on app.ruul.io (use ana@exemple.zz)");
  assertStringIncludes(texteKyc("banque", "a@b.zz"), "now add your withdrawal method");
  assertStringIncludes(texteKyc("identite_refusee", "a@b.zz"), "was declined");
  for (const m of ["inscription", "identite", "banque", "identite_refusee"] as const) {
    const t = texteKyc(m, "a@b.zz");
    assertStringIncludes(t, "\"It's done\"");
    assertStringIncludes(t, "this week can't be paid");
    assert(!/\b(bot|automatic|AI)\b/i.test(t));
  }
  assert(estManque("banque") && !estManque("autre"));
});
