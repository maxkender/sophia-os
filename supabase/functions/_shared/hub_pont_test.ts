import { assertEquals } from "jsr:@std/assert@1";

import { actionPourJournal, type AppelPont, appelReussi, erreurPourJournal, pannesPont } from "./hub_pont.ts";

const MAINTENANT = new Date("2026-11-24T08:00:00Z");
const appel = (action: string, cree_at: string, code: number, erreur: string | null = null): AppelPont => ({
  action,
  ok: appelReussi(code),
  code,
  erreur,
  cree_at,
});

Deno.test("un 4xx est un refus, pas une panne ; un 5xx est un échec", () => {
  assertEquals(appelReussi(200), true);
  assertEquals(appelReussi(422), true);
  assertEquals(appelReussi(500), false);
  assertEquals(appelReussi(502), false);
});

Deno.test("échecs sans interruption depuis plus de 15 min : en panne", () => {
  const pannes = pannesPont([
    appel("zones", "2026-11-24T01:10:00Z", 200),
    appel("zones", "2026-11-24T01:17:00Z", 500, "lecture tronquée"),
    appel("zones", "2026-11-24T07:59:00Z", 500, "toujours tronquée"),
  ], MAINTENANT);
  assertEquals(pannes, [{
    action: "zones",
    depuis: "2026-11-24T01:17:00Z",
    dernier_echec_at: "2026-11-24T07:59:00Z",
    derniere_erreur: "toujours tronquée",
    echecs: 2,
  }]);
});

Deno.test("premier échec il y a moins de 15 min : pas encore de panne", () => {
  assertEquals(pannesPont([appel("zones", "2026-11-24T07:50:00Z", 500)], MAINTENANT), []);
  // Juste 15 min : en panne (« il y a au moins 15 min »).
  assertEquals(pannesPont([appel("zones", "2026-11-24T07:45:00Z", 500)], MAINTENANT).length, 1);
});

Deno.test("un succès après le premier échec interrompt la panne", () => {
  assertEquals(pannesPont([
    appel("zones", "2026-11-24T07:00:00Z", 500),
    appel("zones", "2026-11-24T07:30:00Z", 200),
  ], MAINTENANT), []);
  // Un nouvel échec après le succès repart de zéro.
  const p = pannesPont([
    appel("zones", "2026-11-24T06:00:00Z", 500),
    appel("zones", "2026-11-24T06:30:00Z", 200),
    appel("zones", "2026-11-24T07:40:00Z", 503),
  ], MAINTENANT);
  assertEquals(p.map((x) => x.depuis), ["2026-11-24T07:40:00Z"]);
});

Deno.test("chaque action a sa règle : un succès ailleurs ne cache pas la panne", () => {
  const p = pannesPont([
    appel("zones", "2026-11-24T07:00:00Z", 500),
    appel("ping", "2026-11-24T07:55:00Z", 200),
    appel("stats_pays", "2026-11-24T07:30:00Z", 500),
  ], MAINTENANT);
  assertEquals(p.map((x) => x.action), ["zones", "stats_pays"]);
  assertEquals(p[0]!.derniere_erreur, "HTTP 500");
});

Deno.test("l'ordre des appels reçus ne compte pas", () => {
  const p = pannesPont([
    appel("zones", "2026-11-24T07:30:00Z", 500, "b"),
    appel("zones", "2026-11-24T07:00:00Z", 500, "a"),
  ], MAINTENANT);
  assertEquals(p[0]!.depuis, "2026-11-24T07:00:00Z");
  assertEquals(p[0]!.derniere_erreur, "b");
});

Deno.test("journal : action courte, erreur tronquée à 300", () => {
  assertEquals(actionPourJournal(undefined), "?");
  assertEquals(actionPourJournal("  zones "), "zones");
  assertEquals(actionPourJournal("x".repeat(100)).length, 40);
  assertEquals(erreurPourJournal(null), null);
  assertEquals(erreurPourJournal("  "), null);
  assertEquals(erreurPourJournal("e".repeat(500))!.length, 300);
});
