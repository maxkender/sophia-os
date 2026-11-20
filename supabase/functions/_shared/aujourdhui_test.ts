import { assert, assertEquals } from "jsr:@std/assert@1";

import { type Aujourdhui, depuisEnClair, dureeEnClair, texteAlertesUrgentes, texteQualite, texteResumeJour } from "./aujourdhui.ts";

const MAINTENANT = new Date("2026-11-21T17:00:00Z");

Deno.test("depuis et durées en clair", () => {
  assertEquals(depuisEnClair(null, MAINTENANT), "");
  assertEquals(depuisEnClair("2026-11-21T16:40:00Z", MAINTENANT), "depuis 20 min");
  assertEquals(depuisEnClair("2026-11-21T12:00:00Z", MAINTENANT), "depuis 5 h");
  assertEquals(depuisEnClair("2026-11-18T17:00:00Z", MAINTENANT), "depuis 3 j");
  assertEquals(dureeEnClair(null), "—");
  assertEquals(dureeEnClair(0.4), "24 s");
  assertEquals(dureeEnClair(12.3), "12 min");
  assertEquals(dureeEnClair(210), "3,5 h");
});

Deno.test("alerte urgente : un seul message, rien sans ligne", () => {
  assertEquals(texteAlertesUrgentes([], "https://os"), null);
  const t = texteAlertesUrgentes([
    { id: "bonus_erreur", titre: "Bonus en erreur · 1 posteur(s), 6.5 $", detail: null, ton: "rouge", depuis: "2026-11-20T17:00:00Z", nb: 1 },
    { id: "tickets", titre: "Tickets #os-tickets ouverts · 2", detail: null, ton: "orange", depuis: null, nb: 2 },
  ], "https://os/admin/auto/aujourdhui", MAINTENANT)!;
  assert(t.startsWith("*Urgent sur Aujourd'hui* — 2 lignes"));
  assert(t.includes("🔴 Bonus en erreur · 1 posteur(s), 6.5 $ (depuis 24 h)"));
  assert(t.includes("🟠 Tickets #os-tickets ouverts · 2\n"));
  assert(t.endsWith("https://os/admin/auto/aujourdhui"));
});

Deno.test("résumé de 18 h : les lignes grises ne sont pas listées", () => {
  const a: Aujourdhui = {
    resume: { a_valider: 1, cas: 3, problemes: 1, reponses: 12, corrections: 4 },
    sections: [
      { cle: "valider", titre: "À valider", lignes: [{ id: "paie_ruul", titre: "Paie Ruul", detail: null, ton: "gris", depuis: null, nb: 0 }] },
      { cle: "argent", titre: "Argent", lignes: [{ id: "support:paie", titre: "Questions d'argent pour toi · 3 demande(s)", detail: null, ton: "rouge", depuis: "2026-11-21T15:00:00Z", nb: 3 }] },
    ],
    chiffres: { comptes_actifs: 700, posts_jour: 400, ruul: 200, upwork: 430, support_sans_humain: 64, demandes_24h: 80 },
  };
  const t = texteResumeJour(a, "https://os", MAINTENANT);
  assert(t.includes("1 à valider · 3 cas pour toi · 1 problème(s) · 12 réponse(s)"));
  assert(t.includes("*Argent* (1)\n  🔴 Questions d'argent pour toi · 3 demande(s) (depuis 2 h)"));
  assert(!t.includes("Paie Ruul"));
  assert(t.includes("support sans humain 64 %"));
});

Deno.test("rapport qualité du lundi", () => {
  const t = texteQualite({
    lundi: "2026-11-16", demandes: 268, sans_humain: 166, pct_sans_humain: 62, objectif: 70,
    delai_premiere_reponse_min: 0.5, delai_reponse_humaine_min: 95, rouverts: 1,
    niveau2_par_sujet: { Paie: 16, Posts: 37, Bug: 7 },
    emails: { envoyes: 571, delivres: 419, refuses: 152 }, emails_entrants_non_relies: 0,
    a_relire: [],
  }, "https://os/admin/auto/qualite");
  assert(t.startsWith("*Rapport support de la semaine du 16/11/2026*"));
  assert(t.includes("Réglé sans humain : 62 % (objectif 70 %) (166 sur 268)"));
  assert(t.includes("1re réponse (médiane) : 30 s · quand un humain répond : 1,6 h"));
  assert(t.includes("Cas pour toi par sujet : Posts 37 · Paie 16 · Bug 7"));
  assert(t.includes("419 délivrés, 152 refusés (sur 571)"));
  assert(texteQualite({
    lundi: "2026-11-16", demandes: 10, sans_humain: 8, pct_sans_humain: 80, objectif: 70, delai_premiere_reponse_min: null,
    delai_reponse_humaine_min: null, rouverts: 0, niveau2_par_sujet: {}, emails: { envoyes: 0, delivres: 0, refuses: 0 },
    emails_entrants_non_relies: 0, a_relire: [],
  }, "u").includes("80 % ✅"));
});
