import { assertEquals } from "jsr:@std/assert@1";

import { descriptionLigne, descriptionLot, onboardingDe, signatureRuulValide } from "./ruul_api.ts";

Deno.test("onboarding : le même ordre que Ruul", () => {
  assertEquals(onboardingDe("NOT_REGISTERED", null, false), "NOT_REGISTERED");
  assertEquals(onboardingDe(null, "APPROVED", true), "NOT_REGISTERED");
  assertEquals(onboardingDe("ACTIVE", "PENDING", true), "PENDING_KYC");
  assertEquals(onboardingDe("ACTIVE", "DECLINED", true), "PENDING_KYC");
  assertEquals(onboardingDe("ACTIVE", "APPROVED", false), "PENDING_COLLECTION_ACCOUNT");
  assertEquals(onboardingDe("ACTIVE", "approved", true), "READY");
});

async function signer(secret: string, t: number, corps: string): Promise<string> {
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(`${t}.${corps}`)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("webhook : signature juste, fausse, trop vieille, corps modifié", async () => {
  const corps = JSON.stringify({ id: "evt_1", type: "payout.paid" });
  const t = 1_800_000_000;
  const v1 = await signer("whsec_test", t, corps);
  assertEquals(await signatureRuulValide(corps, `t=${t},v1=${v1}`, "whsec_test", t + 10), true);
  assertEquals(await signatureRuulValide(corps, `t=${t},v1=${v1}`, "autre", t + 10), false);
  assertEquals(await signatureRuulValide(corps, `t=${t},v1=${v1}`, "whsec_test", t + 301), false);
  assertEquals(await signatureRuulValide(corps + " ", `t=${t},v1=${v1}`, "whsec_test", t + 10), false);
  assertEquals(await signatureRuulValide(corps, null, "whsec_test", t), false);
});

Deno.test("libellés de paie : Vik Studios, jamais d'autre nom", () => {
  assertEquals(descriptionLot("2026-11-16"), "Vik Studios — week of Nov 16");
  assertEquals(descriptionLigne("2026-11-16", 14, 0), "Vik Studios — week of Nov 16 : 14 posts");
  assertEquals(descriptionLigne("2026-11-16", 1, 10), "Vik Studios — week of Nov 16 : 1 post + 10 $ bonus");
  for (const s of [descriptionLot("2026-11-16"), descriptionLigne("2026-11-16", 3, 10)]) {
    assertEquals(/bot|sophia|\bai\b/i.test(s), false);
  }
});
