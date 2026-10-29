/** 0444 : le @ TikTok qui ne correspond pas (extraction, étape du message, textes). */
import { assertEquals } from "jsr:@std/assert@1";

import { etapeHandle, extraireHandle, type HandleIntrouvable, normaliserHandle, texteHandle, TEXTES_HANDLE_DEFAUT } from "./handle_tiktok.ts";

Deno.test("normaliserHandle : @, lien, majuscules, ponctuation ; forme invalide → null", () => {
  assertEquals(normaliserHandle("@Sara.Studio746"), "sara.studio746");
  assertEquals(normaliserHandle("https://www.tiktok.com/@sara.studio746?lang=en"), "sara.studio746");
  assertEquals(normaliserHandle("sara.studio746."), "sara.studio746");
  assertEquals(normaliserHandle("a"), null);
  assertEquals(normaliserHandle("sara studio"), null);
  assertEquals(normaliserHandle(""), null);
});

Deno.test("extraireHandle : le @ d'une réponse, jamais une adresse e-mail", () => {
  assertEquals(extraireHandle("Hi, my account is @sara.studio746 sorry"), "sara.studio746");
  assertEquals(extraireHandle("here: tiktok.com/@sara.studio746"), "sara.studio746");
  assertEquals(extraireHandle("my email is sara@gmail.com"), null);
  assertEquals(extraireHandle("I created it yesterday"), null);
});

const h = (o: Partial<HandleIntrouvable>): HandleIntrouvable => ({
  compte_id: "c", poster_id: "p", handle: "sara.studie746", warmup_at: "2026-10-27T10:00:00Z", introuvable_at: "2026-10-28T08:00:00Z",
  message_at: null, message_canaux: null, upwork_at: null, reaction_at: null, propose: null, propose_statut: null, propose_at: null, ...o,
});
const MAINTENANT = new Date("2026-10-30T12:00:00Z");

Deno.test("etapeHandle : le 1er message, puis Upwork 24 h après s'il est parti sur Slack seulement, sans réaction", () => {
  assertEquals(etapeHandle(h({}), { slack: true, contrat: true }, MAINTENANT), "handle");
  assertEquals(etapeHandle(h({}), { slack: false, contrat: false }, MAINTENANT), null);
  const slack = { message_at: "2026-10-29T10:00:00Z", message_canaux: ["slack"] };
  assertEquals(etapeHandle(h(slack), { slack: true, contrat: true }, MAINTENANT), "handle_upwork");
  assertEquals(etapeHandle(h({ ...slack, message_at: "2026-10-30T00:00:00Z" }), { slack: true, contrat: true }, MAINTENANT), null);
  assertEquals(etapeHandle(h({ ...slack, reaction_at: "2026-10-29T18:00:00Z" }), { slack: true, contrat: true }, MAINTENANT), null);
  assertEquals(etapeHandle(h({ ...slack, upwork_at: "2026-10-30T10:00:00Z" }), { slack: true, contrat: true }, MAINTENANT), null);
  assertEquals(etapeHandle(h({ ...slack, message_canaux: ["upwork"] }), { slack: false, contrat: true }, MAINTENANT), null);
  assertEquals(etapeHandle(h(slack), { slack: true, contrat: false }, MAINTENANT), null);
});

Deno.test("les textes : jamais « create your account »", () => {
  const t = texteHandle(TEXTES_HANDLE_DEFAUT.introuvable, { prenom: "Hamidullah", handle: "@sara.studie746" });
  assertEquals(
    t,
    "Hi Hamidullah, we can't find your TikTok account @sara.studie746. If your account has a different name, update it on your dashboard (My TikTok account), or reply here with your exact @.",
  );
  for (const x of Object.values(TEXTES_HANDLE_DEFAUT)) assertEquals(/create your/i.test(x), false);
  assertEquals(texteHandle(TEXTES_HANDLE_DEFAUT.trouve, { handle: "sara.studio746" }), "Thanks, we found @sara.studio746.");
});
