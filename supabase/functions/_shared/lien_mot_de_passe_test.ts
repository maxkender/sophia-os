import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  apercuLienMotDePasse,
  avecLienMotDePasse,
  lienMotDePasse,
  PHRASE_PAIEMENT,
  refusMotDePasseUpwork,
  refusPaiementUpwork,
} from "./lien_mot_de_passe.ts";

Deno.test("le lien « Set my password »", () => {
  assertEquals(lienMotDePasse("https://os/", "ab12"), "https://os/set-password?t=ab12");
});

Deno.test("le lien est créé à l'envoi, seulement si le texte le demande", async () => {
  const appels: unknown[] = [];
  const client = {
    rpc: (fn: string, args?: Record<string, unknown>) => {
      appels.push([fn, args]);
      return Promise.resolve({ data: "jeton", error: null });
    },
  };
  assertEquals(await avecLienMotDePasse(client, "p1", "Hi", "https://os", "test"), { texte: "Hi", erreur: null });
  assertEquals(appels.length, 0);
  const r = await avecLienMotDePasse(client, "p1", "Set: {lien_mot_de_passe}", "https://os", "test");
  assertEquals(r, { texte: "Set: https://os/set-password?t=jeton", erreur: null });
  assertEquals(appels, [["mot_de_passe_lien_creer", { p_poster: "p1", p_par: "test" }]]);
  const ko = { rpc: () => Promise.resolve({ data: null, error: { message: "boom" } }) };
  const e = await avecLienMotDePasse(ko, "p1", "Set: {lien_mot_de_passe}", "https://os", "test");
  assertStringIncludes(e.erreur ?? "", "boom");
  assertStringIncludes(apercuLienMotDePasse("Set: {lien_mot_de_passe}"), "Set my password");
});

Deno.test("garde-fou Upwork : jamais de mot de passe", () => {
  assertEquals(refusMotDePasseUpwork("Login: a@sophia.com · Password: kava2345") !== null, true);
  assertEquals(refusMotDePasseUpwork("your password is: abc") !== null, true);
  assertEquals(refusMotDePasseUpwork("Use 12345678 to log in") !== null, true);
  assertEquals(refusMotDePasseUpwork("Password: the one your hiring manager gave you") !== null, true);
  assertEquals(refusMotDePasseUpwork("Set: {lien_mot_de_passe}") !== null, true);
  // Le lien est admis.
  assertEquals(refusMotDePasseUpwork("• Set your password here (first time only): https://os/set-password?t=ab"), null);
  assertEquals(refusMotDePasseUpwork("Password: https://os/set-password?t=ab"), null);
  assertEquals(refusMotDePasseUpwork("set your password with your personal link https://os/set-password?t=ab"), null);
});

Deno.test("welcome et relances : aucune mention de paiement, sauf la phrase admise", () => {
  assertEquals(refusPaiementUpwork(`The job in short. ${PHRASE_PAIEMENT}.`), null);
  assertEquals(refusPaiementUpwork("you get paid every week") !== null, true);
  assertEquals(refusPaiementUpwork("Payment by PayPal") !== null, true);
  assertEquals(refusPaiementUpwork("$50 a week") !== null, true);
  assertEquals(refusPaiementUpwork("Your TikTok account to create: @ana (use exactly this name)"), null);
});
