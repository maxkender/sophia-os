import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  aFaire,
  type EtapeInactif,
  etapesEnEchec,
  ligneRapportInactifs,
  prevenirMax,
  statutInactif,
  TEXTE_FIN_INACTIF,
  texteFinInactif,
} from "./inactifs.ts";

const e = (action: EtapeInactif["action"], statut: EtapeInactif["statut"]): EtapeInactif => ({ action, statut, detail: null, at: "2026-11-21T18:07:00Z" });

Deno.test("texte de fin : prénom, sans paie ni raison", () => {
  assertEquals(texteFinInactif(TEXTE_FIN_INACTIF, "Alex Martin"), "Hi Alex, we're ending our collaboration today. Thank you for your understanding.");
  assert(!/paid|pay|because|reason/i.test(TEXTE_FIN_INACTIF));
});

Deno.test("texte de fin : sans prénom, jamais de {prenom} laissé", () => {
  assertEquals(texteFinInactif(TEXTE_FIN_INACTIF, null), "Hi, we're ending our collaboration today. Thank you for your understanding.");
  assertEquals(texteFinInactif("Merhaba {prenom}, bugün iş birliğimizi sonlandırıyoruz.", ""), "Merhaba, bugün iş birliğimizi sonlandırıyoruz.");
});

Deno.test("étapes : à refaire seulement si jamais tentée ou en échec", () => {
  const etapes = [e("message", "fait"), e("upwork", "erreur"), e("ruul", "sans_objet"), e("upwork", "fait")];
  assert(!aFaire(etapes, "message"));
  assert(!aFaire(etapes, "upwork"));
  assert(aFaire(etapes, "os"));
  assert(!aFaire([e("ruul", "a_la_main")], "ruul"));
});

Deno.test("statut : fait quand toutes les étapes sont faites ou sans objet", () => {
  const tout = (["message", "upwork", "ruul", "os", "slack", "tickets"] as const).map((a) => e(a, a === "ruul" ? "sans_objet" : "fait"));
  assertEquals(statutInactif(tout), "fait");
  assertEquals(statutInactif([...tout, e("slack", "erreur")]), "erreur");
  assertEquals(etapesEnEchec([...tout, e("slack", "erreur")]).map((x) => x.action), ["slack"]);
});

Deno.test("Max prévenu seulement au 2e échec", () => {
  const ko = [e("upwork", "erreur")];
  assert(!prevenirMax(1, ko));
  assert(prevenirMax(2, ko));
  assert(!prevenirMax(2, [e("upwork", "fait")]));
});

Deno.test("ligne du rapport du samedi", () => {
  assertEquals(
    ligneRapportInactifs({ arretes: 12, jamais_connectes: 8, jamais_postes: 4, en_cours: 0, alertes: 2 }),
    "Inactifs arrêtés automatiquement : 12 (8 jamais connectés, 4 jamais postés) · 2 alertes bug d'assignation",
  );
  assertEquals(
    ligneRapportInactifs({ arretes: 1, jamais_connectes: 0, jamais_postes: 1, en_cours: 1, alertes: 0 }),
    "Inactifs arrêtés automatiquement : 1 (0 jamais connecté, 1 jamais posté) · 1 en cours (reprise demain) · 0 alerte bug d'assignation",
  );
});
