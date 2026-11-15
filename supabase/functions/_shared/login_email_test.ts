import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { baseLogin, normaliserLogin } from "./login_email.ts";

Deno.test("12/11 : un nom grec ou cyrillique donne un login latin valide", () => {
  assertEquals(baseLogin("ΚΩΝΣΤΑΝΤΙΝΑ", "ΧΑΡΑΛΑΜΠΙΔΟΥ"), "konstantinac");
  assertEquals(baseLogin("Χριστιάνα", "Πρεβαζι"), "christianap");
  assertEquals(baseLogin("Ελένη", "μαστραγγελοπουλου"), "elenim");
  assertEquals(baseLogin("Кирилл", "Шамонин"), "kirills");
  assertEquals(normaliserLogin("Андрей Ёлкин"), "andreyelkin");
  for (const [p, n] of [["ΚΩΝΣΤΑΝΤΙΝΑ", "ΧΑΡΑΛΑΜΠΙΔΟΥ"], ["Кирилл", "Шамонин"]]) {
    assertMatch(`${baseLogin(p, n)}@sophia.com`, /^[a-z0-9]+@sophia\.com$/);
  }
});

Deno.test("12/11 : les noms latins ne changent pas ; rien de lisible → « poster »", () => {
  assertEquals(baseLogin("Noémie", "Dürr"), "noemied");
  assertEquals(baseLogin("María José", "Núñez"), "mariajosen");
  assertEquals(baseLogin("李", "王"), "poster");
  assertEquals(baseLogin("", ""), "poster");
});
