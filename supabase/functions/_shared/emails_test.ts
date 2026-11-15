import { assertEquals } from "jsr:@std/assert@1";

import {
  _journalPourTests,
  creditsEmail,
  delaiEssai,
  envoyerSuivi,
  lienStopDansHtml,
  refusDefinitif,
  statutLivraison,
  texteDepuisHtml,
} from "./emails.ts";

const M = { to: "a@b.c", objet: "Hi", html: "<p>Hi</p>", texte: "Hi", stop: "https://x.y/r/stop?t=abc", tags: ["ruul"] };

/** Un journal factice : garde les lignes insérées, et le réglage emails_brevo. */
function journalFactice(sansCredit = false) {
  const lignes: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      if (table === "reglages") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { valeur: { sans_credit: sansCredit } } }) }) }) };
      }
      return { insert: (l: Record<string, unknown>) => { lignes.push(l); return Promise.resolve({ error: null }); } };
    },
  };
  return { db, lignes };
}

const site = (status: number, corps: unknown) => (() => Promise.resolve(new Response(JSON.stringify(corps), { status }))) as unknown as typeof fetch;

Deno.env.set("OS_HUB_SECRET", "x");
Deno.env.set("HUB_EMAIL_URL", "https://site.test/api/public/os-email");

Deno.test("accepté par Brevo : journal « accepte » avec le message_id, le contenu gardé jusqu'à la livraison", async () => {
  const { db, lignes } = journalFactice();
  _journalPourTests(db);
  const r = await envoyerSuivi(M, site(200, { ok: true, message_id: "<m1@brevo>" }));
  assertEquals(r, { ok: true, erreur: null, message_id: "<m1@brevo>" });
  assertEquals(lignes.length, 1);
  assertEquals([lignes[0].statut, lignes[0].message_id, lignes[0].html], ["accepte", "<m1@brevo>", "<p>Hi</p>"]);
});

Deno.test("plus de crédit (402) : en file, réessai dans 15 min ; l'appelant le compte comme parti", async () => {
  const { db, lignes } = journalFactice();
  _journalPourTests(db);
  const r = await envoyerSuivi(M, site(402, { ok: false, error: "not_enough_credits" }));
  assertEquals([r.ok, r.en_file], [true, true]);
  assertEquals([lignes[0].statut, lignes[0].erreur, lignes[0].tentatives], ["en_file", "not_enough_credits", 1]);
  const dans = Date.parse(String(lignes[0].prochain_essai_at)) - Date.now();
  assertEquals(dans > 14 * 60_000 && dans <= 15 * 60_000, true);
});

Deno.test("refus définitif (requête invalide) : « refuse » avec la raison, l'appelant voit l'erreur", async () => {
  const { db, lignes } = journalFactice();
  _journalPourTests(db);
  const r = await envoyerSuivi(M, site(400, { ok: false, error: "invalid_request" }));
  assertEquals(r, { ok: false, erreur: "invalid_request" });
  assertEquals([lignes[0].statut, lignes[0].erreur], ["refuse", "invalid_request"]);
});

Deno.test("Brevo connu sans crédit : directement en file, le site n'est pas appelé", async () => {
  const { db, lignes } = journalFactice(true);
  _journalPourTests(db);
  let appels = 0;
  const f = (() => { appels++; return Promise.resolve(new Response("{}")); }) as unknown as typeof fetch;
  const r = await envoyerSuivi(M, f);
  assertEquals([r.ok, r.en_file, appels], [true, true, 0]);
  assertEquals([lignes[0].statut, lignes[0].erreur], ["en_file", "Brevo sans crédit"]);
});

Deno.test("sans journal (tests, configuration absente) : envoi simple", async () => {
  _journalPourTests(null);
  assertEquals((await envoyerSuivi(M, site(502, { ok: false, error: "email_provider_unavailable" }))).ok, false);
  assertEquals((await envoyerSuivi(M, site(200, { ok: true, message_id: "m" }))).ok, true);
});

Deno.test("refus définitif ou passager", () => {
  const r = (status: number, erreur: string) => ({ ok: false, status, message_id: null, erreur });
  assertEquals(refusDefinitif(r(400, "invalid_request")), true);
  assertEquals(refusDefinitif(r(401, "unauthorized")), true);
  assertEquals(refusDefinitif(r(402, "not_enough_credits")), false);
  assertEquals(refusDefinitif(r(400, "not_enough_credits")), false);
  assertEquals(refusDefinitif(r(429, "too_many_requests")), false);
  assertEquals(refusDefinitif(r(502, "email_provider_unavailable")), false);
  assertEquals(refusDefinitif(r(0, "HUB_EMAIL_URL ou OS_HUB_SECRET manquant")), false);
});

Deno.test("délai des essais : 15 min, 30 min, 1 h… plafonné à 6 h", () => {
  assertEquals([1, 2, 3, 10].map((n) => delaiEssai(n) / 60_000), [15, 30, 60, 360]);
});

Deno.test("crédits email Brevo : SMS ignorés, plans additionnés, illisible → null", () => {
  assertEquals(creditsEmail([{ type: "payAsYouGo", creditsType: "sendLimit", credits: 0 }, { type: "sms", credits: 500 }]), 0);
  assertEquals(creditsEmail([{ type: "subscription", credits: 1200 }, { type: "payAsYouGo", credits: 300 }]), 1500);
  assertEquals(creditsEmail(null), null);
  assertEquals(creditsEmail([{ type: "free" }]), null);
});

Deno.test("livraison : délivré, refusé, à réessayer, en attente", () => {
  assertEquals(statutLivraison([{ event: "requests" }, { event: "delivered" }]).statut, "delivre");
  assertEquals(statutLivraison([{ event: "opened" }]).statut, "delivre");
  assertEquals(statutLivraison([{ event: "hardBounces", reason: "no mailbox" }]), { statut: "refuse", evenement: "hardBounces", raison: "no mailbox" });
  assertEquals(statutLivraison([{ event: "error", reason: "credits" }]).statut, "a_reessayer");
  assertEquals(statutLivraison([{ event: "requests" }]).statut, "en_attente");
  assertEquals(statutLivraison([]).statut, "en_attente");
});

Deno.test("renvoi : le lien stop retrouvé dans le HTML, le texte brut", () => {
  const html = `<p>Hi Anna,</p><p>Go: <a href="https://d.app/r/done?t=abc">It's done</a></p><a href="https://d.app/r/stop?t=Zz_9-x" style="c">I do not wish to continue</a>`;
  assertEquals(lienStopDansHtml(html), "https://d.app/r/stop?t=Zz_9-x");
  assertEquals(lienStopDansHtml("<p>rien</p>"), null);
  assertEquals(texteDepuisHtml(html), "Hi Anna,\nGo: It's done: https://d.app/r/done?t=abc\nI do not wish to continue: https://d.app/r/stop?t=Zz_9-x");
});
