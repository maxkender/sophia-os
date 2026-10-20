/**
 * Comment masters : règles du commentaire, message Slack, signature Slack et
 * rapprochement du commentaire posté. Sans réseau.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  AGE_ABANDON_MIN,
  blocsSlack,
  cleSeuil,
  decisionReleve,
  drapeauPays,
  enLots,
  estLundi,
  formatAge,
  formatVues,
  idDuLien,
  indexerSeuils,
  LANGUE_REGION,
  lireReponse,
  nomAppli,
  nomLangue,
  nomPays,
  problemesCommentaire,
  promptCommentaire,
  releveDu,
  retrouverCommentaire,
  seuilRecalibre,
  signatureSlackValide,
  similarite,
  verdictCanal,
} from "./comment_masters.ts";

Deno.test("problemesCommentaire : seul le minimum non négociable est vérifié", () => {
  assertEquals(
    problemesCommentaire("wusste nicht dass man reels einfach ausblenden kann, UnSwipe hat mein handy gerettet 🙏", "UnSwipe"),
    [],
  );
  // Longueur, emojis, hashtags : c'est au prompt éditable d'en décider.
  assertEquals(problemesCommentaire("Sophia 😍😍 #fyp", "Sophia"), []);
  assertEquals(problemesCommentaire("va su www.sophia.com", "Sophia"), ["lien"]);
  assertEquals(problemesCommentaire("trop bien cette appli", "Micabo"), ["ne cite pas Micabo"]);
  assertEquals(problemesCommentaire("  ", "Micabo"), ["vide", "ne cite pas Micabo"]);
});

Deno.test("nomAppli : l'orthographe TikTok, pas celle de la table", () => {
  assertEquals(nomAppli("Unswipe"), "UnSwipe");
  assertEquals(nomAppli("micabo"), "Micabo");
  assertEquals(nomAppli(null), "Sophia");
});

Deno.test("promptCommentaire : variables remplacées, consigne JSON toujours ajoutée", () => {
  const entree = { langue: "it", appli: "Sophia", slides: ["5 abitudini", "leggi\n5 minuti"], hashtags: "#fyp" };
  const p = promptCommentaire(entree);
  assert(p.includes("Write it in Italian"));
  assert(p.includes("mention the app Sophia"));
  assert(p.includes("2. leggi 5 minuti"));
  assert(p.includes("Hashtags: #fyp"));
  assert(!p.includes("{{"));
  assert(p.endsWith('{"comment": "...", "translation_en": "..."}'));

  const perso = promptCommentaire(entree, "Comment in {{ langue }} about {{appli}}.\n{{slides}}\n{{hashtags}}\n{{inconnue}}");
  assert(perso.startsWith("Comment in Italian about Sophia.\n1. 5 abitudini\n2. leggi 5 minuti\n#fyp\n{{inconnue}}"));
  assert(perso.endsWith('{"comment": "...", "translation_en": "..."}'));

  const vide = promptCommentaire({ ...entree, slides: [], hashtags: null }, "{{slides}} / {{hashtags}}");
  assert(vide.startsWith("(no text) / (none)"));
});

Deno.test("promptCommentaire : la variante de la langue et le pays du compte", () => {
  const entree = { langue: "es-419", pays: "MX", appli: "Sophia", slides: ["hola"], hashtags: null };
  const p = promptCommentaire(entree);
  assert(p.includes("Write it in Latin American Spanish, the way a young person from Mexico"));
  assert(promptCommentaire({ ...entree, langue: "pt-BR", pays: "BR" }).includes("in Brazilian Portuguese"));
  assert(promptCommentaire({ ...entree, langue: "en", pays: "GB" }).includes("person from United Kingdom"));
  // Demande d'avant 0321, sans pays : on retombe sur la langue.
  assert(promptCommentaire({ ...entree, pays: null }).includes("from a country where people speak Latin American Spanish"));
  // Un prompt enregistré sans {{pays}} marche comme avant.
  assert(promptCommentaire(entree, "In {{langue}}.").startsWith("In Latin American Spanish."));
});

Deno.test("LANGUE_REGION : chaque région de la migration a son nom pour le modèle", async () => {
  const sql = await Deno.readTextFile(new URL("../../migrations/0321_comment_masters_pays.sql", import.meta.url));
  const bloc = sql.slice(sql.indexOf("insert into public.comment_master_regions"), sql.indexOf("on conflict (langue)"));
  const langues = [...bloc.matchAll(/\('([a-zA-Z0-9-]+)',/g)].map((m) => m[1]);
  assertEquals(langues.length, 24);
  for (const langue of ["de", "it", ...langues]) {
    assert(LANGUE_REGION[langue], `langue ${langue} absente de LANGUE_REGION`);
    assert(nomLangue(langue) !== langue);
  }
  assertEquals(nomLangue("es"), "Spanish (Spain)");
  assertEquals(nomLangue("pt"), "European Portuguese");
  assertEquals(nomLangue("xx"), "xx");
});

Deno.test("drapeauPays / nomPays : depuis le code ISO", () => {
  assertEquals(drapeauPays("AT"), "🇦🇹");
  assertEquals(drapeauPays("at"), "");
  assertEquals(drapeauPays(null), "");
  assertEquals(nomPays("US"), "United States");
  assertEquals(nomPays("AE"), "United Arab Emirates");
  assertEquals(nomPays(null), "");
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
  // Le drapeau du pays du compte, plus celui de la langue.
  assert(JSON.stringify(blocsSlack({ ...d, pays: "AT" })).includes("🇦🇹 *New post to comment*"));
});

const H = 3600_000;
const PUBLIE = Date.parse("2026-10-20T10:00:00Z");

Deno.test("releveDu : toutes les 2 h dès 2 h, jusqu'à la fin de la fenêtre", () => {
  assert(!releveDu(PUBLIE, null, 12, PUBLIE + 1.9 * H), "trop jeune");
  assert(releveDu(PUBLIE, null, 12, PUBLIE + 2 * H));
  // Relevé lancé à 12:00:05 : le passage de 14:00:03 le reprend (pas de glissement).
  assert(releveDu(PUBLIE, PUBLIE + 2 * H + 5_000, 12, PUBLIE + 4 * H + 3_000));
  assert(!releveDu(PUBLIE, PUBLIE + 2 * H, 12, PUBLIE + 3 * H));
  assert(releveDu(PUBLIE, PUBLIE + 10 * H, 12, PUBLIE + 12 * H + 10 * 60_000), "le relevé de 12 h");
  assert(!releveDu(PUBLIE, PUBLIE + 10 * H, 12, PUBLIE + 12.5 * H), "fenêtre close");
});

Deno.test("decisionReleve : déclencher, abandonner à 6 h sous 20 %, terminer en fin de fenêtre", () => {
  const base = { seuil: 8000, fenetreHeures: 12 };
  assertEquals(decisionReleve({ ...base, ageMin: 120, vues: 8000 }), "declencher");
  assertEquals(decisionReleve({ ...base, ageMin: 240, vues: 500 }), "continuer", "faible mais avant 6 h");
  assertEquals(decisionReleve({ ...base, ageMin: AGE_ABANDON_MIN, vues: 1599 }), "abandonner");
  assertEquals(decisionReleve({ ...base, ageMin: AGE_ABANDON_MIN, vues: 1600 }), "continuer");
  assertEquals(decisionReleve({ ...base, ageMin: 600, vues: 4000 }), "continuer", "le relevé de 12 h reste");
  assertEquals(decisionReleve({ ...base, ageMin: 720, vues: 4000 }), "terminer");
  assertEquals(decisionReleve({ ...base, ageMin: 725, vues: 9000 }), "declencher", "relevé de 12 h dans la grâce");
  assertEquals(decisionReleve({ ...base, ageMin: 760, vues: 9000 }), "terminer", "hors fenêtre : jamais de commentaire");
  assertEquals(decisionReleve({ ...base, ageMin: 240, vues: null }), "continuer", "post absent du run");
});

Deno.test("enLots : 50 liens au plus par run", () => {
  const lots = enLots(Array.from({ length: 120 }, (_, i) => i));
  assertEquals(lots.map((l) => l.length), [50, 50, 20]);
  assertEquals(enLots([]), []);
});

Deno.test("indexerSeuils : seulement les régions actives, clé langue + pays", () => {
  const index = indexerSeuils(
    [{ langue: "de", slack_channel_id: "C1", fenetre_heures: 12 }],
    [
      { langue: "de", pays: "DE", seuil_vues: 8000 },
      { langue: "de", pays: "AT", seuil_vues: 5000 },
      { langue: "it", pays: "IT", seuil_vues: 8000 },
    ],
  );
  assertEquals(index.get(cleSeuil("de", "AT"))?.seuil, 5000);
  assertEquals(index.get(cleSeuil("de", "DE"))?.region.slack_channel_id, "C1");
  assertEquals(index.has(cleSeuil("it", "IT")), false, "région inactive : aucun relevé payé");
  assertEquals(index.has(cleSeuil("de", "CH")), false);
});

Deno.test("seuilRecalibre : vers 1 sur 20, un pas borné, jamais sous 3 000", () => {
  assertEquals(seuilRecalibre(8000, 59, 10).raison, "echantillon");
  assertEquals(seuilRecalibre(8000, 100, 5), { seuil: 8000, raison: "inchange", taux: 0.05, facteur: 1 });
  // 20 % de déclenchement : ×2 brut, borné à ×1,25.
  assertEquals(seuilRecalibre(10000, 100, 20).seuil, 12500);
  // Aucun déclenchement : −20 %, arrondi à 500.
  assertEquals(seuilRecalibre(11000, 200, 0).seuil, 9000);
  assertEquals(seuilRecalibre(3000, 200, 0), { seuil: 3000, raison: "inchange", taux: 0, facteur: 0.8 });
  assertEquals(seuilRecalibre(3500, 200, 0).seuil, 3000);
  // 2,5 % : racine de 0,5 ≈ 0,71, bornée à 0,8.
  assertEquals(seuilRecalibre(10000, 200, 5).seuil, 8000);
});

Deno.test("estLundi", () => {
  assert(estLundi("2026-10-19"));
  assert(!estLundi("2026-10-20"));
});

Deno.test("verdictCanal : membre, pas membre, canal privé invisible, droit manquant", () => {
  assertEquals(verdictCanal({ ok: true, channel: { name: "comments-de", is_member: true } }), { ok: true, nom: "comments-de" });
  assertEquals(verdictCanal({ ok: true, channel: { is_member: false } }), { ok: false, code: "not_in_channel" });
  assertEquals(verdictCanal({ ok: true, channel: { is_member: true, is_archived: true } }), { ok: false, code: "is_archived" });
  assertEquals(verdictCanal({ ok: false, error: "channel_not_found" }), { ok: false, code: "channel_not_found" });
  assertEquals(verdictCanal({ ok: false, error: "missing_scope", needed: "groups:read" }), {
    ok: false,
    code: "missing_scope:groups:read",
  });
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
