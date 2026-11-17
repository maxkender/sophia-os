import { assertEquals } from "jsr:@std/assert@1";

import { traiter } from "./traiter.ts";

async function signer(secret: string, t: number, corps: string): Promise<string> {
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(`${t}.${corps}`)));
  return `t=${t},v1=${Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const corps = JSON.stringify({ id: "evt_1", type: "payout.paid", data: { transactionId: 1, status: "PAID" } });
const T = 1_800_000_000;

Deno.test("ruul-webhook : signé par la prod → reçu en prod", async () => {
  const recus: string[] = [];
  const r = await traiter(corps, new Headers({ "Ruul-Signature": await signer("whsec_prod", T, corps) }), { prod: "whsec_prod", sandbox: "whsec_sb" },
    (id, env, type) => {
      recus.push(`${id}:${env}:${type}`);
      return Promise.resolve({ resultat: "maj" });
    }, T + 10);
  assertEquals(r.status, 200);
  assertEquals(recus, ["evt_1:prod:payout.paid"]);
});

Deno.test("ruul-webhook : signé par la sandbox → reçu en sandbox", async () => {
  const recus: string[] = [];
  const r = await traiter(corps, new Headers({ "Ruul-Signature": await signer("whsec_sb", T, corps) }), { prod: "whsec_prod", sandbox: "whsec_sb" },
    (_id, env) => {
      recus.push(env);
      return Promise.resolve(null);
    }, T);
  assertEquals(r.status, 200);
  assertEquals(recus, ["sandbox"]);
});

Deno.test("ruul-webhook : mauvaise signature, trop vieux, corps modifié → 401 sans rien noter", async () => {
  let appels = 0;
  const rec = () => {
    appels++;
    return Promise.resolve(null);
  };
  const bonne = await signer("whsec_prod", T, corps);
  assertEquals((await traiter(corps, new Headers({ "Ruul-Signature": await signer("autre", T, corps) }), { prod: "whsec_prod" }, rec, T)).status, 401);
  assertEquals((await traiter(corps, new Headers({ "Ruul-Signature": bonne }), { prod: "whsec_prod" }, rec, T + 301)).status, 401);
  assertEquals((await traiter(corps.replace("PAID", "FAILED"), new Headers({ "Ruul-Signature": bonne }), { prod: "whsec_prod" }, rec, T)).status, 401);
  assertEquals((await traiter(corps, new Headers(), { prod: "whsec_prod" }, rec, T)).status, 401);
  assertEquals(appels, 0);
});

Deno.test("ruul-webhook : aucun secret configuré → 503 (Ruul réessaiera)", async () => {
  const r = await traiter(corps, new Headers({ "Ruul-Signature": "t=1,v1=00" }), { prod: null, sandbox: null }, () => Promise.resolve(null), T);
  assertEquals(r.status, 503);
});
