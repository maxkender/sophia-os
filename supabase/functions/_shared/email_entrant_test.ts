import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { jetonValide, lireEmailsBrevo, sansCitation, texteReponseEmail } from "./email_entrant.ts";

Deno.test("12/11 : une réponse à nos emails est lue (expéditeur, sujet, texte sans la citation)", () => {
  const e = lireEmailsBrevo({
    items: [{
      MessageId: "<abc@mail.gmail.com>", From: { Address: "Jane@Gmail.com", Name: "Jane" }, Subject: "Re: Your Ruul invitation is in your inbox",
      RawTextBody: "I can't find the Ruul email.\n\nOn Thu, Nov 12, 2026 at 17:42, Sophia <support@vikstudios.com> wrote:\n> Hi Jane,\n> We just invited you",
    }],
  });
  assertEquals(e.length, 1);
  assertEquals(e[0].de, "jane@gmail.com");
  assertEquals(e[0].texte, "I can't find the Ruul email.");
  assertEquals(e[0].sujet, "Re: Your Ruul invitation is in your inbox");
});

Deno.test("12/11 : réponses automatiques, robots et emails vides écartés", () => {
  assertEquals(lireEmailsBrevo({ items: [{ MessageId: "1", From: { Address: "a@b.com" }, Subject: "Out of office", RawTextBody: "I'm away" }] }).length, 0);
  assertEquals(lireEmailsBrevo({ items: [{ MessageId: "2", From: { Address: "mailer-daemon@x.com" }, Subject: "Undelivered", RawTextBody: "fail" }] }).length, 0);
  assertEquals(lireEmailsBrevo({ items: [{ MessageId: "3", From: { Address: "a@b.com" }, Subject: "Hi", RawTextBody: "ok", Headers: { "Auto-Submitted": "auto-replied" } }] }).length, 0);
  assertEquals(lireEmailsBrevo({ items: [{ MessageId: "4", From: { Address: "a@b.com" }, Subject: "Hi", RawTextBody: "" }] }).length, 0);
  assertEquals(lireEmailsBrevo(null).length, 0);
});

Deno.test("12/11 : citation coupée dans plusieurs langues", () => {
  assertEquals(sansCitation("Merci !\nLe jeu. 12 nov. 2026 à 17:42, Sophia a écrit :\n> texte"), "Merci !");
  assertEquals(sansCitation("STOP\n-----Original Message-----\nFrom: x"), "STOP");
});

Deno.test("12/11 : jeton Brevo exact seulement ; la réponse finit par la phrase Help", () => {
  const j = "x".repeat(32);
  assert(jetonValide(`Bearer ${j}`, j));
  assert(!jetonValide(`Bearer ${"y".repeat(32)}`, j));
  assert(!jetonValide(null, j));
  assert(!jetonValide("Bearer court", "court"));
  assertStringIncludes(texteReponseEmail("Jane", "You're paid every Monday."), "Don't reply to this email: click Help on your dashboard");
});
