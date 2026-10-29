import { assertEquals } from "jsr:@std/assert@1";

import { choisirCompte, type CompteDuJour } from "./upwork_comptes.ts";

const c = (compte: string, x: Partial<CompteDuJour> = {}): CompteDuJour => ({ compte, connecte: true, conversations: 0, limite: false, deja: false, ...x });
const o = { max: 45, reserve: 5, prioritaire: false };

Deno.test("Max d'abord, jusqu'à 45 personnes, puis Adrien (la réserve sur le dernier compte)", () => {
  assertEquals(choisirCompte([c("principal"), c("secours")], o).compte, "principal");
  assertEquals(choisirCompte([c("principal", { conversations: 44 }), c("secours")], o).compte, "principal");
  assertEquals(choisirCompte([c("principal", { conversations: 45 }), c("secours")], o).compte, "secours");
  assertEquals(choisirCompte([c("principal", { conversations: 45 }), c("secours", { conversations: 40 })], o).compte, null);
  assertEquals(choisirCompte([c("principal", { conversations: 45 }), c("secours", { conversations: 40 })], { ...o, prioritaire: true }).compte, "secours");
  // Adrien pas connecté : comme avant, la réserve sur Max.
  assertEquals(choisirCompte([c("principal", { conversations: 40 }), c("secours", { connecte: false })], o).compte, null);
  assertEquals(choisirCompte([c("principal", { conversations: 40 }), c("secours", { connecte: false })], { ...o, prioritaire: true }).compte, "principal");
});

Deno.test("la 1re erreur de limite sur Max : Adrien ; les deux : plus rien jusqu'à demain", () => {
  assertEquals(choisirCompte([c("principal", { conversations: 12, limite: true }), c("secours")], o).compte, "secours");
  const r = choisirCompte([c("principal", { limite: true }), c("secours", { limite: true })], o);
  assertEquals(r.compte, null);
  assertEquals(r.raison, "limite Upwork du jour atteinte : plus rien jusqu'à demain");
});

Deno.test("le même compte toute la journée pour une personne", () => {
  assertEquals(choisirCompte([c("principal", { conversations: 45 }), c("secours", { deja: true })], o), { compte: "secours", nouvelle: false, raison: null });
  // Déjà écrite par Max aujourd'hui, Max à 45 : ne compte pas une 2e fois.
  assertEquals(choisirCompte([c("principal", { conversations: 45, deja: true }), c("secours")], o).compte, "principal");
  // Déjà écrite par Max, Max a eu la limite : pas Adrien, demain.
  assertEquals(choisirCompte([c("principal", { deja: true, limite: true }), c("secours")], o).compte, null);
});

Deno.test("Adrien a échoué sur cette conversation : exclu, demain avec Max", () => {
  assertEquals(choisirCompte([c("principal", { conversations: 45 }), c("secours")], { ...o, exclure: ["secours"] }).compte, null);
});
