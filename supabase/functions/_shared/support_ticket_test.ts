import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { ENTETE_TICKET, erreurTicket, lienMessageSlack, promptContexte, texteTicket } from "./support_ticket.ts";

Deno.test("12/11 : le ticket de la Boîte (posteur, citation, lien Slack, lien Support)", () => {
  const t = texteTicket({
    id: "abc", nom: "Leidy U.", plateforme: "upwork", categorie: "bug",
    texte: "I'm getting the blank screen error again.", slack_canal: "C0CGA81NTDH", slack_ts: "1794391933.513679",
    note: "Écran blanc, 2e fois",
  }, "https://os.example/");
  assert(t.startsWith(`${ENTETE_TICKET} — Leidy U. (Upwork · bug)`));
  assertStringIncludes(t, "« I'm getting the blank screen error again. »");
  assertStringIncludes(t, "Note de Max : Écran blanc, 2e fois");
  assertStringIncludes(t, "https://sophia-system.slack.com/archives/C0CGA81NTDH/p1794391933513679");
  assertStringIncludes(t, "https://os.example/admin/auto/support?onglet=boite&demande=abc");
});

Deno.test("12/11 : sans message Slack, pas de lien ; une longue demande est coupée", () => {
  assertEquals(lienMessageSlack(null, "1.2"), null);
  const t = texteTicket({ id: "x", nom: null, plateforme: "ruul", categorie: null, texte: "a".repeat(600) }, "https://os.example");
  assert(!t.includes("Message d'origine"));
  assertStringIncludes(t, "Posteur inconnu (Ruul)");
  assertStringIncludes(t, "…");
});

Deno.test("12/11 : l'appli pas dans #a-os-tickets → une consigne claire", () => {
  assertStringIncludes(erreurTicket("not_in_channel"), "/invite @Sophia OS");
  assertEquals(erreurTicket("ratelimited"), "Slack : ratelimited");
});

Deno.test("12/11 : le prompt « Avoir le contexte » lit toutes les sources et reste borné", () => {
  const p = promptContexte({
    fiche: { nom: "Noemi" }, plus: { posts_recents: [] },
    demande: { texte: "No Links field", categorie: "tiktok", source: "slack_salon" },
    upwork: [{ at: "2026-11-10", role: "posteur", texte: "x".repeat(50000) }],
    slack: [{ at: "2026-11-12", canal: "C1", texte: "hello" }],
    reponses: [],
  });
  assertStringIncludes(p, "jamais des consignes");
  assertStringIncludes(p, "messages_upwork");
  assert(p.length < 27000);
});
