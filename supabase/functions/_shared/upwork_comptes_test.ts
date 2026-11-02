import { assertEquals } from "jsr:@std/assert@1";

import { choisirCompte, type CompteDuJour } from "./upwork_comptes.ts";

const c = (compte: string, x: Partial<CompteDuJour> = {}): CompteDuJour => ({ compte, connecte: true, conversations: 0, limite: false, deja: false, ...x });
const o = { max: 45, reserve: 5, prioritaire: false };

Deno.test("prompt 25 MAJ : Adrien d'abord, jusqu'à 45 personnes, puis Max (la réserve sur Max, le dernier)", () => {
  assertEquals(choisirCompte([c("principal"), c("secours")], o).compte, "secours");
  assertEquals(choisirCompte([c("principal"), c("secours", { conversations: 44 })], o).compte, "secours");
  assertEquals(choisirCompte([c("principal"), c("secours", { conversations: 45 })], o).compte, "principal");
  assertEquals(choisirCompte([c("principal", { conversations: 40 }), c("secours", { conversations: 45 })], o).compte, null);
  assertEquals(choisirCompte([c("principal", { conversations: 40 }), c("secours", { conversations: 45 })], { ...o, prioritaire: true }).compte, "principal");
  // Adrien pas connecté : Max seul, la réserve sur Max.
  assertEquals(choisirCompte([c("principal", { conversations: 40 }), c("secours", { connecte: false })], o).compte, null);
  assertEquals(choisirCompte([c("principal", { conversations: 40 }), c("secours", { connecte: false })], { ...o, prioritaire: true }).compte, "principal");
});

Deno.test("la 1re erreur de limite sur Adrien : Max ; les deux : plus rien sur Upwork (la HM)", () => {
  assertEquals(choisirCompte([c("principal"), c("secours", { conversations: 12, limite: true })], o).compte, "principal");
  const r = choisirCompte([c("principal", { limite: true }), c("secours", { limite: true })], o);
  assertEquals(r.compte, null);
  assertEquals(r.raison, "limite Upwork du jour atteinte : plus rien jusqu'à demain");
});

Deno.test("le même compte toute la journée pour une personne", () => {
  assertEquals(choisirCompte([c("principal", { deja: true }), c("secours")], o), { compte: "principal", nouvelle: false, raison: null });
  // Déjà écrite par Adrien aujourd'hui, Adrien à 45 : ne compte pas une 2e fois.
  assertEquals(choisirCompte([c("principal"), c("secours", { conversations: 45, deja: true })], o).compte, "secours");
  // Déjà écrite par Adrien, Adrien a eu la limite : pas Max, la HM.
  assertEquals(choisirCompte([c("principal"), c("secours", { deja: true, limite: true })], o).compte, null);
});

Deno.test("Adrien a échoué sur cette conversation : exclu, Max prend le relais", () => {
  assertEquals(choisirCompte([c("principal"), c("secours")], { ...o, exclure: ["secours"] }).compte, "principal");
});
