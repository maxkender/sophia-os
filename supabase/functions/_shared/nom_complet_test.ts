import { assertEquals } from "jsr:@std/assert@1";
import { separerNomComplet } from "./nom_complet.ts";

Deno.test("nom complet : premier mot = prénom, le reste = nom", () => {
  assertEquals(separerNomComplet("Ana Carolina  Silva Tavares "), { prenom: "Ana", nom: "Carolina Silva Tavares" });
  assertEquals(separerNomComplet("Kinga"), { prenom: "Kinga", nom: "" });
  assertEquals(separerNomComplet("   "), { prenom: "", nom: "" });
  assertEquals(separerNomComplet(undefined), { prenom: "", nom: "" });
});
