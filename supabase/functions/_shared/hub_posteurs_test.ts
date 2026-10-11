import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  agregerSemaine,
  bornesSemaineParis,
  genererMotDePasse,
  minuitParis,
  secretsEgaux,
  trouverRecruteurPourPays,
  zoneCouvrePays,
} from "./hub_posteurs.ts";

const recruteurs = [
  { id: "kris", prenom: "Kris", nom: "A", email: "krisa@sophia.com", zone_recrutement: "Spain + Portugal" },
  { id: "erla", prenom: "Erla", nom: "M", email: "erlam@sophia.com", zone_recrutement: "Estonia + Finland + Russian-speaking" },
  { id: "lucia", prenom: "Lucia", nom: "D", email: "luciad1@sophia.com", zone_recrutement: "Italy + Croatia + Slovenia" },
  { id: "rana", prenom: "Rana", nom: "X", email: "ranax@sophia.com", zone_recrutement: "US + UK" },
  { id: "dormant", prenom: "Old", nom: "HM", email: "old@sophia.com", zone_recrutement: "France", is_active: false },
  { id: "sara", prenom: "Sara", nom: "B", email: "sarab@sophia.com", zone_recrutement: "France" },
];

Deno.test("zoneCouvrePays — mot entier, sans casse ni accents", () => {
  assertEquals(zoneCouvrePays("Spain + Portugal", "Portugal"), true);
  assertEquals(zoneCouvrePays("Spain + Portugal", "portugal"), true);
  assertEquals(zoneCouvrePays("Italy + Croatia + Slovenia", "Croatie"), false);
  assertEquals(zoneCouvrePays("Türkiye + Israel", "turkiye"), true);
});

Deno.test("zoneCouvrePays — « Russia » ne matche pas « Russian-speaking »", () => {
  assertEquals(zoneCouvrePays("Estonia + Finland + Russian-speaking", "Russia"), false);
  assertEquals(zoneCouvrePays("Estonia + Finland + Russian-speaking", "Finland"), true);
});

Deno.test("zoneCouvrePays — pays à plusieurs mots et zone vide", () => {
  assertEquals(zoneCouvrePays("United Kingdom + Ireland", "United Kingdom"), true);
  assertEquals(zoneCouvrePays("United Kingdom + Ireland", "Kingdom"), true);
  assertEquals(zoneCouvrePays(null, "France"), false);
  assertEquals(zoneCouvrePays("France", ""), false);
});

Deno.test("trouverRecruteurPourPays — premier recruteur ACTIF qui couvre le pays", () => {
  assertEquals(trouverRecruteurPourPays(recruteurs, "Portugal")?.id, "kris");
  assertEquals(trouverRecruteurPourPays(recruteurs, "Slovenia")?.id, "lucia");
  // Le HM dormant sur la France est sauté : Sara prend.
  assertEquals(trouverRecruteurPourPays(recruteurs, "France")?.id, "sara");
  assertEquals(trouverRecruteurPourPays(recruteurs, "Germany"), null);
});

Deno.test("minuitParis — été (+2) et hiver (+1)", () => {
  assertEquals(minuitParis("2026-07-13").toISOString(), "2026-07-12T22:00:00.000Z");
  assertEquals(minuitParis("2026-12-14").toISOString(), "2026-12-13T23:00:00.000Z");
});

Deno.test("bornesSemaineParis — lundi 12 octobre 2026", () => {
  const b = bornesSemaineParis("2026-10-12");
  assertEquals(b.debut, "2026-10-11T22:00:00.000Z");
  assertEquals(b.fin, "2026-10-18T22:00:00.000Z");
  assertEquals(b.jours[0], "2026-10-12");
  assertEquals(b.jours[6], "2026-10-18");
  assertEquals(b.jours.length, 7);
});

Deno.test("bornesSemaineParis — semaine à cheval sur le passage à l'heure d'hiver", () => {
  // Dimanche 25 octobre 2026 : retour à l'heure d'hiver. La fin de semaine
  // (lundi 26 à 00:00 Paris) est 23:00 UTC, le début (lundi 19) 22:00 UTC.
  const b = bornesSemaineParis("2026-10-19");
  assertEquals(b.debut, "2026-10-18T22:00:00.000Z");
  assertEquals(b.fin, "2026-10-25T23:00:00.000Z");
});

Deno.test("bornesSemaineParis — refuse un jour qui n'est pas un lundi", () => {
  assertThrows(() => bornesSemaineParis("2026-10-13"));
  assertThrows(() => bornesSemaineParis("12/10/2026"));
});

Deno.test("agregerSemaine — prévus, publiés, manqués, dernier post", () => {
  const b = bornesSemaineParis("2026-10-12");
  const ligne = agregerSemaine("p1", true, [
    { compte_id: "c", date_publication_prevue: "2026-10-12", statut: "publie", publie_at: "2026-10-12T10:00:00.000Z" },
    { compte_id: "c", date_publication_prevue: "2026-10-12", statut: "assigne", publie_at: null },
    { compte_id: "c", date_publication_prevue: "2026-10-13", statut: "brouillon", publie_at: null },
    // Dimanche 18 octobre 23:30 Paris = 21:30 UTC : DANS la semaine.
    { compte_id: "c", date_publication_prevue: "2026-10-18", statut: "publie", publie_at: "2026-10-18T21:30:00.000Z" },
    // Publié la semaine d'avant : compte pour « dernier post » seulement s'il est le plus récent (non).
    { compte_id: "c", date_publication_prevue: "2026-10-10", statut: "publie", publie_at: "2026-10-10T08:00:00.000Z" },
  ], b);
  assertEquals(ligne.prevus, 3);
  assertEquals(ligne.publies, 2);
  assertEquals(ligne.manques, 1);
  assertEquals(ligne.dernier_post_at, "2026-10-18T21:30:00.000Z");
  assertEquals(ligne.is_active, true);
});

Deno.test("genererMotDePasse — 12 caractères lisibles", () => {
  const mdp = genererMotDePasse(12, () => 0.5);
  assertEquals(mdp.length, 12);
  assertEquals(/^[a-zA-Z2-9]+$/.test(mdp), true);
  assertEquals(/[0OlI1]/.test(mdp), false);
});

Deno.test("secretsEgaux — égalité stricte, jamais vrai sur du vide", () => {
  assertEquals(secretsEgaux("abc", "abc"), true);
  assertEquals(secretsEgaux("abc", "abd"), false);
  assertEquals(secretsEgaux("abc", "abcd"), false);
  assertEquals(secretsEgaux("", ""), false);
  assertEquals(secretsEgaux(null, "x"), false);
});
