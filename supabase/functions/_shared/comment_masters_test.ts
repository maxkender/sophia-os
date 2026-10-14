/**
 * Comment masters : règles du commentaire, message Slack, signature Slack et
 * rapprochement du commentaire posté. Sans réseau.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  blocsSlack,
  formatAge,
  formatVues,
  idDuLien,
  lireReponse,
  nomAppli,
  problemesCommentaire,
  promptCommentaire,
  retrouverCommentaire,
  signatureSlackValide,
  similarite,
} from "./comment_masters.ts";

Deno.test("problemesCommentaire : un commentaire conforme passe", () => {
  assertEquals(
    problemesCommentaire("wusste nicht dass man reels einfach ausblenden kann, UnSwipe hat mein handy gerettet 🙏", "UnSwipe"),
    [],
  );
});

Deno.test("problemesCommentaire : chaque règle de Max est vérifiée", () => {
  assertEquals(problemesCommentaire("Sophia top", "Sophia"), ["10 caractères (60 à 150)"]);
  const p = problemesCommentaire('ho imparato tantissimo con "questa app" #fyp 😍😍 vai su www.sophia.com davvero', "Sophia");
  assert(p.includes("plus d'un emoji"));
  assert(p.includes("hashtag"));
  assert(p.includes("guillemets"));
  assert(p.includes("lien"));
  assert(problemesCommentaire("x".repeat(80), "Micabo").includes("ne cite pas Micabo"));
});

Deno.test("nomAppli : l'orthographe TikTok, pas celle de la table", () => {
  assertEquals(nomAppli("Unswipe"), "UnSwipe");
  assertEquals(nomAppli("micabo"), "Micabo");
  assertEquals(nomAppli(null), "Sophia");
});

Deno.test("promptCommentaire : langue, appli et slides dans le prompt", () => {
  const p = promptCommentaire({ langue: "it", appli: "Sophia", slides: ["5 abitudini", "leggi\n5 minuti"], hashtags: "#fyp" });
  assert(p.includes("Write it in Italian"));
  assert(p.includes("mention the app Sophia"));
  assert(p.includes("2. leggi 5 minuti"));
  assert(p.includes("Hashtags: #fyp"));
});

Deno.test("lireReponse : JSON nu ou entouré d'un bloc de code", () => {
  assertEquals(lireReponse('```json\n{"comment": "ciao Sophia", "translation_en": "hi"}\n```'), {
    comment: "ciao Sophia",
    translation_en: "hi",
  });
  assertEquals(lireReponse("pas du json"), null);
});

Deno.test("formatVues / formatAge / idDuLien", () => {
  assertEquals(formatVues(950), "950");
  assertEquals(formatVues(9240), "9.2k");
  assertEquals(formatVues(123456), "123k");
  assertEquals(formatAge(45), "45 min");
  assertEquals(formatAge(305), "5h05");
  assertEquals(idDuLien("https://www.tiktok.com/@a/photo/7696454226351901984?lang=de"), "7696454226351901984");
  assertEquals(idDuLien("https://www.tiktok.com/@a/video/7696454226351901984"), "7696454226351901984");
});

Deno.test("blocsSlack : bouton Done, puis mention de qui l'a fait", () => {
  const d = {
    id: "d1",
    langue: "de",
    handle: "jakob.fokus628",
    application: "Sophia",
    publie_url: "https://www.tiktok.com/@jakob.fokus628/photo/1",
    vues_declenchement: 9240,
    age_minutes: 305,
    commentaire: "krass, Sophia",
    traduction_en: "crazy, Sophia",
  };
  const avant = JSON.stringify(blocsSlack(d));
  assert(avant.includes("🇩🇪 *New post to comment* · @jakob.fokus628 · Sophia"));
  assert(avant.includes("*9.2k views* in 5h05"));
  assert(avant.includes('"action_id":"comment_fait"'));
  assert(avant.includes('"value":"d1"'));
  const apres = JSON.stringify(blocsSlack(d, { par: "U123", heure: "14:32" }));
  assert(!apres.includes("comment_fait"));
  assert(apres.includes("✅ Done by <@U123> at 14:32"));
});

Deno.test("signatureSlackValide : accepte la bonne signature, refuse le reste", async () => {
  const secret = "8f742231b10e8888abcd99yyyzzz85a5";
  const corps = "payload=%7B%7D";
  const ts = "1700000000";
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(`v0:${ts}:${corps}`));
  const sig = "v0=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const maintenant = 1700000000_000 + 60_000;

  assert(await signatureSlackValide(secret, ts, corps, sig, maintenant));
  assert(!(await signatureSlackValide(secret, ts, corps + "x", sig, maintenant)));
  assert(!(await signatureSlackValide("autre", ts, corps, sig, maintenant)));
  assert(!(await signatureSlackValide(secret, ts, corps, sig, maintenant + 10 * 60_000)), "rejeu > 5 min");
  assert(!(await signatureSlackValide(secret, null, corps, sig, maintenant)));
});

Deno.test("retrouverCommentaire : le commentaire retouché, posté après l'envoi", () => {
  const genere = "non sapevo che il cervello adorasse l'acqua fredda, con Sophia imparo una cosa nuova ogni giorno";
  const envoye = "2026-10-14T10:00:00Z";
  const commentaires = [
    { cid: "1", texte: genere, creeAt: "2026-10-14T08:00:00Z", likes: 50 }, // avant l'envoi : pas lui
    { cid: "2", texte: "cuore bello 💜", creeAt: "2026-10-14T10:30:00Z", likes: 99 },
    { cid: "3", texte: "Non sapevo che il cervello adorasse l'acqua fredda!! con sophia imparo una cosa nuova ogni giorno 🧠", creeAt: "2026-10-14T10:20:00Z", likes: 7 },
  ];
  assertEquals(retrouverCommentaire(commentaires, genere, envoye)?.cid, "3");
  assertEquals(retrouverCommentaire(commentaires.slice(0, 2), genere, envoye), null);
  assert(similarite("abc def", "abc def") === 1);
});
