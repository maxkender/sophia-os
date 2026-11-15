import { assertEquals } from "jsr:@std/assert@1";
import { brideParControle } from "./faq_moteur.ts";
import { appliquerControle, canalActif, canalDeSource, lireValeurControle, modeAction, modeAgent } from "./controle.ts";

const base = {
  stop: false,
  agents: { cerveau_support: "agir", pay_bot: "proposer" },
  canaux: { help: true, slack: true, email: false, upwork: true },
  actions: { lien_mot_de_passe: "agir", pseudo_tiktok: "proposer", arret: "eteint" },
  pay: { plafond_milestone: 30, plafond_jour: 300 },
};
const dec = (o: Record<string, unknown> = {}) => ({ niveau: "bot", reponse: "Here is your link.", action: null as string | null, action_valeur: null as string | null, raison: "r", ...o });

Deno.test("lecture : modes, défauts, STOP", () => {
  const c = lireValeurControle(base);
  assertEquals(modeAgent(c, "pay_bot"), "proposer");
  assertEquals(modeAgent(c, "ruul_bot"), "proposer");
  assertEquals(modeAction(c, "nouvelle_action"), "proposer");
  assertEquals(canalActif(c, "email"), false);
  assertEquals(canalDeSource("slack_salon"), "slack");
  const stop = lireValeurControle({ ...base, stop: true });
  assertEquals([modeAgent(stop, "cerveau_support"), modeAction(stop, "lien_mot_de_passe"), canalActif(stop, "help")], ["eteint", "eteint", false]);
  assertEquals(modeAgent(lireValeurControle(null), "cerveau_support"), "agir");
});

Deno.test("décision : agir passe, proposer garde le brouillon et propose l'action, canal coupé = muet", () => {
  const c = lireValeurControle(base);
  const d1 = dec({ action: "lien_mot_de_passe" });
  assertEquals(appliquerControle(c, d1, "help", "WAIT").brouillon, null);
  assertEquals(d1.niveau, "bot");
  const d2 = dec({ action: "pseudo_tiktok", action_valeur: "gina.x" });
  const r2 = appliquerControle(c, d2, "help", "WAIT");
  assertEquals([d2.niveau, d2.reponse, d2.action, r2.brouillon], ["max", "WAIT", null, "Here is your link."]);
  assertEquals(r2.action_proposee, { action: "pseudo_tiktok", valeur: "gina.x" });
  const d3 = dec({ action: "arret" });
  assertEquals(appliquerControle(c, d3, "help", "WAIT").action_proposee, null);
  const d4 = dec();
  const r4 = appliquerControle(c, d4, "email", "WAIT");
  assertEquals([d4.niveau, r4.muet, r4.brouillon], ["max", true, "Here is your link."]);
  const d5 = dec({ niveau: "adrien", reponse: "WAIT" });
  assertEquals(appliquerControle(c, d5, "help", "WAIT").brouillon, null);
});

Deno.test("ancien bot FAQ : STOP et cerveau en proposer le font taire", () => {
  const r = { mode_slack: "actif" as const, mode_os: "actif" as const, canaux_slack: ["C1"], message_attente: true };
  assertEquals(brideParControle(r, lireValeurControle(base)).mode_slack, "actif");
  assertEquals(brideParControle(r, lireValeurControle({ ...base, stop: true })).mode_slack, "eteint");
  const p = brideParControle(r, lireValeurControle({ ...base, agents: { cerveau_support: "proposer" } }));
  assertEquals([p.mode_slack, p.mode_os], ["test", "test"]);
});
