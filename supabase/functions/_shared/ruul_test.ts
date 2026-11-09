import { assertEquals } from "jsr:@std/assert@1";

import { prochaineEtapeRuul, remplirRuul, rendreEmailRuul, semaineCourte } from "./ruul.ts";

Deno.test("Ruul : invitation, relances J+1 et J+3, Problems à J+5, rien après STOP ou prêt", () => {
  const ajoute = "2026-11-09T10:00:00Z";
  const a = (h: number) => new Date(new Date(ajoute).getTime() + h * 3_600_000);
  const e = (relances: number, o: Record<string, unknown> = {}) => ({ statut: "invite", ajoute_at: ajoute, relances, stop_at: null, ...o });
  assertEquals(prochaineEtapeRuul(e(0), a(0)), "invite");
  assertEquals(prochaineEtapeRuul(e(1), a(23)), null);
  assertEquals(prochaineEtapeRuul(e(1), a(24)), "relance1");
  assertEquals(prochaineEtapeRuul(e(2), a(71)), null);
  assertEquals(prochaineEtapeRuul(e(2), a(72)), "relance3");
  assertEquals(prochaineEtapeRuul(e(3), a(120)), "problems");
  assertEquals(prochaineEtapeRuul(e(4), a(500)), null);
  assertEquals(prochaineEtapeRuul(e(0, { stop_at: ajoute }), a(1)), null);
  assertEquals(prochaineEtapeRuul(e(0, { statut: "pret" }), a(1)), null);
});

Deno.test("Ruul : textes, email (bouton, Unsubscribe), semaine", () => {
  assertEquals(remplirRuul("Hi {prenom}, ${montant} for {semaine} {x}", { prenom: "Ana", montant: 14, semaine: "26 Oct" }), "Hi Ana, $14 for 26 Oct {x}");
  const r = rendreEmailRuul({ objet: "O", corps: "A\n\nB", bouton: { texte: "It's done", lien: "https://x/?pret=1" }, lienStop: "https://x/?stop=1" });
  assertEquals(r.texte.includes("It's done: https://x/?pret=1"), true);
  assertEquals(r.html.includes("Unsubscribe"), true);
  assertEquals(/\bbots?\b|automat/i.test(r.html + r.texte), false);
  assertEquals(semaineCourte("2026-10-26"), "26 Oct");
});
