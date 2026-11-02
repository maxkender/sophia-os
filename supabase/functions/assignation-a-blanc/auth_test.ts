import { assertEquals } from "jsr:@std/assert@1";
import { empreinteSha256, estSecretCronParEmpreinte } from "./auth.ts";

Deno.test("empreinteSha256 : valeur connue", async () => {
  assertEquals(
    await empreinteSha256("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

Deno.test("estSecretCronParEmpreinte : le bon secret passe, le reste non", async () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const attendue = await empreinteSha256(secret);
  const lire = () => Promise.resolve(attendue);
  assertEquals(await estSecretCronParEmpreinte(secret, lire), true);
  assertEquals(await estSecretCronParEmpreinte(secret + "x", lire), false);
  assertEquals(await estSecretCronParEmpreinte(null, lire), false);
  assertEquals(await estSecretCronParEmpreinte("court", lire), false);
});

Deno.test("estSecretCronParEmpreinte : empreinte illisible ou lecture en panne = refus", async () => {
  const secret = "0123456789abcdef0123456789abcdef";
  assertEquals(await estSecretCronParEmpreinte(secret, () => Promise.resolve(null)), false);
  assertEquals(await estSecretCronParEmpreinte(secret, () => Promise.resolve("pas-une-empreinte")), false);
  assertEquals(await estSecretCronParEmpreinte(secret, () => Promise.reject(new Error("panne"))), false);
});
