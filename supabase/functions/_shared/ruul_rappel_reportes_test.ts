import { assert, assertEquals } from "jsr:@std/assert@1";

import { casReporte, montantClair, salutation, texteRappelReporte } from "./ruul_rappel_reportes.ts";

Deno.test("cas : statut actuel d'abord, sinon la raison du report", () => {
  assertEquals(casReporte("PENDING_KYC", null), "PENDING_KYC");
  assertEquals(casReporte("ACTIVE", "en attente : pas encore READY chez Ruul (PENDING_COLLECTION_ACCOUNT)"), "PENDING_COLLECTION_ACCOUNT");
  assertEquals(casReporte(null, "en attente : pas encore READY chez Ruul (NOT_REGISTERED)"), "NOT_REGISTERED");
  assertEquals(casReporte("READY", "autre"), null);
});

Deno.test("prénom, montant, objet et corps", () => {
  assertEquals(salutation("gökhan"), "Hi Gökhan,");
  assertEquals(salutation(""), "Hi there,");
  assertEquals(montantClair(7), "7");
  assertEquals(montantClair(10.5), "10.5");
  const k = texteRappelReporte("PENDING_KYC", "Elif", 14, "a@b.co");
  assertEquals(k.objet, "Your payment of $14 is waiting – one step left on Ruul");
  assert(k.corps.startsWith("Hi Elif,\n\nGreat job posting last week! Your payment of $14 is ready, but we can't send it yet"));
  const c = texteRappelReporte("PENDING_COLLECTION_ACCOUNT", null, 7, "a@b.co");
  assertEquals(c.objet, "Add your payout method on Ruul to receive $7");
  assert(c.corps.startsWith("Hi there,"));
  const n = texteRappelReporte("NOT_REGISTERED", "Tiril", 10, "tiril@example.com");
  assertEquals(n.objet, "Create your Ruul account to get paid ($10 waiting)");
  assert(n.corps.includes("Open the Ruul invitation we sent to tiril@example.com"));
  for (const t of [k, c, n]) assert(!/\b(bot|AI|automat)/i.test(t.corps + t.objet), "jamais bot ni IA");
});
