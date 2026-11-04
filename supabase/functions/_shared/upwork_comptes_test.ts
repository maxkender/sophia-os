import { assertEquals } from "jsr:@std/assert@1";

import { choisirCompte, type CompteDuJour, estCompteDeMax, UPWORK_USER_MAX } from "./upwork_comptes.ts";

const c = (compte: string, x: Partial<CompteDuJour> = {}): CompteDuJour => ({ compte, connecte: true, conversations: 0, limite: false, deja: false, ...x });
const o = { max: 45, reserve: 5, prioritaire: false };

Deno.test("3/11 : les messages automatiques ne partent que du compte de Max, jamais de celui d'Adrien", () => {
  assertEquals(choisirCompte([c("principal"), c("secours")], o).compte, "principal");
  assertEquals(choisirCompte([c("secours"), c("principal", { conversations: 10 })], o).compte, "principal");
  // Adrien déjà utilisé aujourd'hui pour cette personne : toujours Max.
  assertEquals(choisirCompte([c("principal"), c("secours", { deja: true })], o).compte, "principal");
  // Max pas connecté : rien ne part (pas de repli sur Adrien).
  const r = choisirCompte([c("principal", { connecte: false }), c("secours")], o);
  assertEquals(r.compte, null);
  assertEquals(r.raison, "le compte Upwork de Max n'est pas connecté");
});

Deno.test("plafond du jour : la réserve pour la bienvenue, le Kill et l'arrêt", () => {
  assertEquals(choisirCompte([c("principal", { conversations: 39 })], o).compte, "principal");
  assertEquals(choisirCompte([c("principal", { conversations: 40 })], o).compte, null);
  assertEquals(choisirCompte([c("principal", { conversations: 40 })], { ...o, prioritaire: true }).compte, "principal");
  assertEquals(choisirCompte([c("principal", { conversations: 45 })], { ...o, prioritaire: true }).compte, null);
});

Deno.test("limite d'Upwork reçue : plus rien jusqu'à demain ; même personne : ne compte pas deux fois", () => {
  const r = choisirCompte([c("principal", { limite: true })], o);
  assertEquals(r.compte, null);
  assertEquals(r.raison, "limite Upwork du jour atteinte : plus rien jusqu'à demain");
  assertEquals(choisirCompte([c("principal", { conversations: 45, deja: true })], o), { compte: "principal", nouvelle: false, raison: null });
});

Deno.test("le compte connecté doit être celui de Max (1908160914854122443)", () => {
  assertEquals(estCompteDeMax({ id: UPWORK_USER_MAX, name: "Maximilien K." }), true);
  assertEquals(estCompteDeMax({ id: "1990051114607612378", name: "Adrien M." }), false);
  assertEquals(estCompteDeMax(null), false);
});
