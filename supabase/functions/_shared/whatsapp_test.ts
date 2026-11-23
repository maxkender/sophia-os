import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  champsProfil, corpsModele, coutEstime, e164, estStopWhatsApp, fenetreOuverte, heureOk, lireWebhook, numeroAutorise, paysDuNumero,
  refusRelance, signatureValide, texteFinWhatsApp,
} from "./whatsapp.ts";

Deno.test("numéros E.164", () => {
  assertEquals(e164("+33 6 12 34 56 78"), "+33612345678");
  assertEquals(e164("0033612345678"), "+33612345678");
  assertEquals(e164("33612345678"), "+33612345678");
  assertEquals(e164("06 12 34 56 78"), null);
  assertEquals(e164("+0612"), null);
  assertEquals(paysDuNumero("+381641234567"), "RS");
  assertEquals(paysDuNumero("+33612345678"), "FR");
});

Deno.test("signature X-Hub-Signature-256", async () => {
  const corps = '{"object":"whatsapp_business_account"}';
  const secret = "secret-de-test";
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hex = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(corps))), (b) => b.toString(16).padStart(2, "0")).join("");
  assert(await signatureValide(corps, `sha256=${hex}`, secret));
  assert(!await signatureValide(corps + " ", `sha256=${hex}`, secret));
  assert(!await signatureValide(corps, `sha256=${hex}`, "autre"));
  assert(!await signatureValide(corps, null, secret));
  assert(!await signatureValide(corps, `sha256=${hex}`, undefined));
});

Deno.test("lecture du webhook : messages, médias, statuts", () => {
  const p = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      messages: [
        { id: "wamid.1", from: "33612345678", timestamp: "1795300000", type: "text", text: { body: " Hello " } },
        { id: "wamid.2", from: "33612345678", timestamp: "1795300001", type: "audio", audio: { id: "media1", mime_type: "audio/ogg" }, context: { id: "wamid.0" } },
      ],
      statuses: [
        { id: "wamid.9", status: "delivered", timestamp: "1795300002", pricing: { category: "utility" } },
        { id: "wamid.8", status: "failed", timestamp: "1795300003", errors: [{ code: 131026, title: "Message undeliverable" }] },
        { id: "wamid.7", status: "deleted" },
      ],
    } }] }],
  };
  const r = lireWebhook(p);
  assertEquals(r.messages.length, 2);
  assertEquals(r.messages[0].texte, "Hello");
  assertEquals(r.messages[0].de, "+33612345678");
  assertEquals(r.messages[1].media, { id: "media1", mime: "audio/ogg", type: "audio" });
  assertEquals(r.messages[1].contexte, "wamid.0");
  assertEquals(r.statuts.map((s) => s.statut), ["livre", "echec"]);
  assertEquals(r.statuts[0].categorie, "utility");
  assertEquals(r.statuts[1].erreur, "131026 Message undeliverable");
  assertEquals(lireWebhook({ object: "page" }).messages.length, 0);
});

Deno.test("STOP : le message entier, dans plusieurs langues ; jamais au milieu d'une phrase", () => {
  for (const m of ["STOP", "stop", "Stop.", "stop working", "I want to end", "I want to stop working", "Please stop", "arrêter", "Je veux arrêter",
    "aufhören", "basta", "quiero dejarlo", "dur", "koniec", "prestani", "стоп", "ik wil stoppen", "STOP 🛑"]) {
    assert(estStopWhatsApp(m), m);
  }
  for (const m of ["the sound stops after 3 seconds", "stop motion video?", "When will I be paid?", "can I stop for one day?",
    "I want to end the week with 14 posts", "don't stop sending me reminders", ""]) {
    assert(!estStopWhatsApp(m), m);
  }
});

Deno.test("fenêtre de 24 h, heures d'envoi, garde-fous", () => {
  const maintenant = new Date("2026-11-22T12:00:00Z");
  assert(fenetreOuverte("2026-11-22T00:00:00Z", maintenant));
  assert(!fenetreOuverte("2026-11-21T11:00:00Z", maintenant));
  assert(!fenetreOuverte(null, maintenant));
  assert(heureOk("FR", new Date("2026-11-22T09:30:00Z"))); // 10 h 30 à Paris
  assert(!heureOk("FR", new Date("2026-11-22T21:30:00Z"))); // 22 h 30
  assert(!heureOk("TR", new Date("2026-11-22T05:30:00Z"))); // 8 h 30 à Istanbul
  const ok = { optin: true, optout: false, envoisJour: 0, envoisSemaine: 0, heureOk: true, absent: false, arrete: false, panne: false, modeAutorise: true };
  assertEquals(refusRelance(ok), null);
  assertEquals(refusRelance({ ...ok, optin: false }), "pas d'accord WhatsApp");
  assertEquals(refusRelance({ ...ok, optout: true }), "pas d'accord WhatsApp");
  assertEquals(refusRelance({ ...ok, envoisJour: 1 }), "déjà 1 message WhatsApp aujourd'hui");
  assertEquals(refusRelance({ ...ok, envoisSemaine: 4 }), "déjà 4 messages WhatsApp cette semaine");
  assertEquals(refusRelance({ ...ok, absent: true }), "absence déclarée");
  assertEquals(refusRelance({ ...ok, arrete: true }), "posteur arrêté ou killé");
  assertEquals(refusRelance({ ...ok, panne: true }), "jour de panne de notre côté");
  assertEquals(refusRelance({ ...ok, heureOk: false }), "hors 9 h – 21 h (heure du posteur)");
  assertEquals(refusRelance({ ...ok, modeAutorise: false }), "mode test : numéro non autorisé");
});

Deno.test("mode test, coût, modèle, texte de fin", () => {
  const test = { mode: "test", numeros_autorises: ["+33600000000"] };
  assert(numeroAutorise(test, "+33600000000"));
  assert(!numeroAutorise(test, "+33611111111"));
  assert(numeroAutorise({ mode: "live" }, "+33611111111"));
  assert(!numeroAutorise(null, "+33611111111"));
  assertEquals(coutEstime("FR", "texte"), 0);
  assert(coutEstime("FR", "modele") > 0);
  const c = corpsModele("+33600000000", "account_ready", "en", ["Ana", "https://x"]);
  assertEquals(c.to, "33600000000");
  assertEquals(c.template.components?.[0].parameters.map((p) => p.text), ["Ana", "https://x"]);
  assert(texteFinWhatsApp(true).includes("Your last week will be paid."));
  assert(!texteFinWhatsApp(false).includes("paid"));
  assert(texteFinWhatsApp(false).endsWith("reply here within 24h."));
});

Deno.test("profil : champs gardés, limites de Meta", () => {
  const ok = champsProfil({ about: " Vik Studios ", websites: ["https://vikstudios.com"], vertical: "edu", email: "hello@vikstudios.com" });
  assertEquals(ok.erreurs, []);
  assertEquals(ok.champs, { about: "Vik Studios", websites: ["https://vikstudios.com"], vertical: "EDU", email: "hello@vikstudios.com" });
  assertEquals(champsProfil({}).champs, {});
  const ko = champsProfil({ about: "x".repeat(140), websites: ["a", "b", "c"], vertical: "BOF", email: "pas-un-email" });
  assertEquals(ko.erreurs.length, 4);
  assertEquals(champsProfil({ about: "" }).erreurs, ["about : 1–139 caractères"]);
});
