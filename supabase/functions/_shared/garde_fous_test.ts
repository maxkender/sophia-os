import { assertEquals } from "jsr:@std/assert@1";

import { canauxRestants, cleServi, decisionRattrapage, postsMinParCompte } from "./garde_fous.ts";

const t = (iso: string) => new Date(iso);

Deno.test("pas de rattrapage : dû avant le passage sur « on » → en attente, puis Send, peu à peu", () => {
  const base = { onDepuis: t("2026-10-29T14:53:00Z"), valide: false, partisCeTour: 0, cap: 2 };
  // Dû après le passage sur « on » : part normalement.
  assertEquals(decisionRattrapage({ ...base, du: t("2026-10-29T15:30:00Z") }), "envoyer");
  // Dû avant : attend.
  assertEquals(decisionRattrapage({ ...base, du: t("2026-10-29T12:00:00Z") }), "attendre");
  // Validé (« Send ») : part, dans la limite du passage.
  assertEquals(decisionRattrapage({ ...base, du: t("2026-10-29T12:00:00Z"), valide: true }), "envoyer");
  assertEquals(decisionRattrapage({ ...base, du: t("2026-10-29T12:00:00Z"), valide: true, partisCeTour: 2 }), "attendre");
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
