import { assertEquals } from "jsr:@std/assert@1";

import {
  canalUnique,
  canauxMessage,
  canauxRestants,
  cleServi,
  clesPersonne,
  decisionRattrapage,
  estLimiteUpwork,
  postsMinParCompte,
  prioriteUpwork,
  trierFile,
  upworkAccorde,
} from "./garde_fous.ts";

const t = (iso: string) => new Date(iso);

Deno.test("pas de rattrapage : dû avant le passage sur « on » → ne part jamais (prompt 25 MAJ)", () => {
  const base = { onDepuis: t("2026-10-29T14:53:00Z"), valide: false, partisCeTour: 0, cap: 2 };
  // Dû après le passage sur « on » : part normalement.
  assertEquals(decisionRattrapage({ ...base, du: t("2026-10-29T15:30:00Z") }), "envoyer");
  // Dû avant : ignoré, même « validé » (l'OS repart du moment présent).
  assertEquals(decisionRattrapage({ ...base, du: t("2026-10-29T12:00:00Z") }), "ignorer");
  assertEquals(decisionRattrapage({ ...base, du: t("2026-10-29T12:00:00Z"), valide: true }), "ignorer");
  // Pas de date « on » connue : rien n'est retenu.
  assertEquals(decisionRattrapage({ ...base, onDepuis: null, du: t("2026-10-29T12:00:00Z") }), "envoyer");
});

Deno.test("le jeudi : toujours la liste validée d'abord", () => {
  const o = { du: t("2026-11-05T12:00:00Z"), onDepuis: null, toujoursValider: true, partisCeTour: 0, cap: 20 };
  assertEquals(decisionRattrapage({ ...o, valide: false }), "attendre");
  assertEquals(decisionRattrapage({ ...o, valide: true }), "envoyer");
});

Deno.test("un seul message par personne : même contrat ou même Slack", () => {
  const servis = new Set([cleServi("jeudi", "2026-10-26", "upwork", "44768306")]);
  // Zita (2 profils, même contrat) : le 2e profil n'a plus que Slack (s'il en a un).
  assertEquals(canauxRestants({ slack_user_id: null, contrat_id: "44768306" }, "jeudi", "2026-10-26", servis), []);
  assertEquals(canauxRestants({ slack_user_id: "U1", contrat_id: "44768306" }, "jeudi", "2026-10-26", servis), ["slack"]);
  // Autre type ou autre semaine : rien de bloqué.
  assertEquals(canauxRestants({ slack_user_id: "U1", contrat_id: "44768306" }, "lundi", "2026-10-26", servis), ["slack", "upwork"]);
});

Deno.test("jeudi : compté compte par compte, le plus bas", () => {
  assertEquals(postsMinParCompte([]), null);
  assertEquals(postsMinParCompte([{ posts_lien: 8 }, { posts_lien: 4 }]), 4);
  assertEquals(postsMinParCompte([{ posts_lien: 23 }]), 23);
});

Deno.test("canalUnique : Slack d'abord, Upwork sans Slack, jamais les deux ; doublon par Slack ou par contrat", () => {
  assertEquals(canalUnique({ slack_user_id: "U1", contrat_id: "C1" }, "relance", "2026-10-30", new Set()), { canal: "slack", doublon: false });
  assertEquals(canalUnique({ slack_user_id: null, contrat_id: "C1" }, "relance", "2026-10-30", new Set()), { canal: "upwork", doublon: false });
  assertEquals(canalUnique({ slack_user_id: null, contrat_id: null }, "relance", "2026-10-30", new Set()), { canal: null, doublon: false });
  // L'autre profil a reçu le message sur Slack : celui-ci ne le reçoit pas sur Upwork.
  const servis = new Set(clesPersonne({ slack_user_id: "U1", contrat_id: "C1" }, "relance", "2026-10-30"));
  assertEquals(canalUnique({ slack_user_id: null, contrat_id: "C1" }, "relance", "2026-10-30", servis), { canal: null, doublon: true });
  assertEquals(canalUnique({ slack_user_id: null, contrat_id: "C1" }, "relance", "2026-10-31", servis).doublon, false);
});

Deno.test("v4 : Slack ET Upwork, le même message ; Upwork exclu au plafond ; doublon si déjà servi", () => {
  const p = { slack_user_id: "U1", contrat_id: "C1" };
  assertEquals(canauxMessage(p, "relance", "2026-10-29", new Set(), { upwork: true }), { canaux: ["slack", "upwork"], doublon: false });
  assertEquals(canauxMessage(p, "relance", "2026-10-29", new Set(), { upwork: false }), { canaux: ["slack"], doublon: false });
  assertEquals(canauxMessage({ slack_user_id: null, contrat_id: "C1" }, "relance", "2026-10-29", new Set(), { upwork: false }).canaux, []);
  const servis = new Set([cleServi("relance", "2026-10-29", "upwork", "C1")]);
  assertEquals(canauxMessage(p, "relance", "2026-10-29", servis, { upwork: true }), { canaux: [], doublon: true });
});

Deno.test("v4 : l'ordre d'Upwork, ce qui reste d'hier d'abord", () => {
  assertEquals(prioriteUpwork("accueil", false), 0);
  assertEquals(prioriteUpwork("relance", false), 1);
  assertEquals(prioriteUpwork("relance", true), 2);
  assertEquals(prioriteUpwork("lundi_soir", false), 4);
  const l = (type: string, periode: string, surSlack: boolean, premier_at = "2026-10-29T10:00:00Z") => ({ type, periode, surSlack, premier_at });
  const tri = trierFile([
    l("lundi_soir", "2026-10-29", false),
    l("relance", "2026-10-29", true),
    l("relance", "2026-10-29", false),
    l("accueil", "2026-10-29", false),
    l("relance", "2026-10-28", true),
  ], "2026-10-29");
  assertEquals(tri.map((x) => `${x.type}/${x.periode}/${x.surSlack}`), [
    "relance/2026-10-28/true",
    "accueil/2026-10-29/false",
    "relance/2026-10-29/false",
    "relance/2026-10-29/true",
    "lundi_soir/2026-10-29/false",
  ]);
});

Deno.test("v4 : le budget Upwork, la bienvenue prend la réserve, ceux sur Slack laissent la place", () => {
  const b = { deja: false, limite: false, restant: 2, restantPrioritaire: 7, attentePrioritaire: 0 };
  assertEquals(upworkAccorde({ ...b, priorite: 0, restant: 0 }), true);
  assertEquals(upworkAccorde({ ...b, priorite: 1, restant: 0 }), false);
  assertEquals(upworkAccorde({ ...b, priorite: 2, attentePrioritaire: 2 }), false);
  assertEquals(upworkAccorde({ ...b, priorite: 2, attentePrioritaire: 1 }), true);
  // Déjà écrit aujourd'hui : ne compte pas une 2e fois ; la limite d'Upwork : plus rien.
  assertEquals(upworkAccorde({ ...b, priorite: 4, restant: 0, deja: true }), true);
  assertEquals(upworkAccorde({ ...b, priorite: 0, limite: true, deja: true }), false);
  assertEquals(estLimiteUpwork("You exceeded the maximum number of rooms that you can post stories to in one day"), true);
});
