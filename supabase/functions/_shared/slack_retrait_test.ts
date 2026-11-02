/** Prompt 21, partie T : retirer un posteur de ses canaux Slack (réponses Slack simulées). */
import { assertEquals } from "jsr:@std/assert@1";

import { canauxARetirer, decrireRetrait, retirerDesCanaux } from "./slack_retrait.ts";

const canaux = [
  { id: "C1", name: "general", is_general: true, is_private: false, is_archived: false },
  { id: "C2", name: "cohort-nov-2", is_general: false, is_private: false, is_archived: false },
  { id: "G3", name: "pod-alpha", is_general: false, is_private: true, is_archived: false },
];

function faux(reponses: Record<string, { ok: boolean; error?: string }>) {
  const appels: string[] = [];
  const appel = (methode: string, params: Record<string, string>) => {
    appels.push(`${methode}:${params.channel ?? params.user}`);
    if (methode === "users.conversations") return Promise.resolve({ ok: true, channels: canaux });
    return Promise.resolve(reponses[`${methode}:${params.channel}`] ?? { ok: true });
  };
  return { appel, appels };
}

Deno.test("T : #general reste, les autres canaux sont quittés", () => {
  assertEquals(canauxARetirer(canaux).map((c) => c.name), ["cohort-nov-2", "pod-alpha"]);
});

Deno.test("T : Kill → retiré de chaque canal ; le bot rejoint un canal public avant d'en retirer", async () => {
  const { appel, appels } = faux({ "conversations.kick:C2": { ok: false, error: "not_in_channel" } });
  let premier = true;
  const appelUneFois = (m: string, p: Record<string, string>) => {
    if (m === "conversations.kick" && p.channel === "C2" && !premier) return Promise.resolve({ ok: true });
    if (m === "conversations.kick" && p.channel === "C2") premier = false;
    return appel(m, p);
  };
  const b = await retirerDesCanaux(appelUneFois, "U1", true);
  assertEquals(b.retires, ["#cohort-nov-2", "#pod-alpha"]);
  assertEquals(b.echecs, []);
  assertEquals(appels.includes("conversations.join:C2"), true);
  assertEquals(appels.some((a) => a.endsWith(":C1") && a.startsWith("conversations.kick")), false);
});

Deno.test("T : en test, rien n'est fait ; un échec reste visible", async () => {
  const { appel, appels } = faux({});
  const simule = await retirerDesCanaux(appel, "U1", false);
  assertEquals(simule.simules, ["#cohort-nov-2", "#pod-alpha"]);
  assertEquals(appels.filter((a) => a.startsWith("conversations.kick")), []);
  const refus = await retirerDesCanaux(faux({ "conversations.kick:G3": { ok: false, error: "missing_scope" } }).appel, "U1", true);
  assertEquals(refus.echecs, ["#pod-alpha : missing_scope"]);
  assertEquals(decrireRetrait(refus).includes("compte à désactiver"), true);
});
