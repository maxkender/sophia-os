import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  CAPTURE_ILLISIBLE,
  contientCapture,
  imagesDuMessage,
  lireCapturesSlack,
  texteAvecCaptures,
  texteSlackAvecCaptures,
} from "./slack_captures.ts";
import { trierEvenementSlack } from "./faq.ts";

const img = (n: number, o: Record<string, unknown> = {}) => ({
  id: `F${n}`, name: `capture${n}.png`, mimetype: "image/png", size: 1000,
  url_private_download: `https://files.slack.com/files-pri/T1-F${n}/download/capture${n}.png`,
  url_private: `https://files.slack.com/files-pri/T1-F${n}/capture${n}.png`,
  permalink: `https://sophia.slack.com/files/U1/F${n}/capture${n}.png`, ...o,
});
const decrire = () => Promise.resolve("Ruul screen showing the error \"Invalid code\".");
const png = () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });

Deno.test("slack captures : les images d'un message file_share (mimetype image/*), au plus 3", () => {
  const m = {
    subtype: "file_share", text: "help",
    files: [img(1), { id: "F9", name: "doc.pdf", mimetype: "application/pdf" }, img(2), img(3), img(4)],
  };
  const ims = imagesDuMessage(m);
  assertEquals(ims.map((i) => i.id), ["F1", "F2", "F3"]);
  assertEquals(ims[0]!.url, "https://files.slack.com/files-pri/T1-F1/download/capture1.png");
  assertEquals(ims[0]!.permalien, "https://sophia.slack.com/files/U1/F1/capture1.png");
  // url_private quand url_private_download manque.
  assertEquals(imagesDuMessage({ files: [img(5, { url_private_download: undefined })] })[0]!.url, "https://files.slack.com/files-pri/T1-F5/capture5.png");
  assertEquals(imagesDuMessage({ text: "hi" }), []);
  assertEquals(imagesDuMessage({ files: "x" }), []);
  assertEquals(imagesDuMessage(null), []);
});

Deno.test("slack captures : téléchargées avec le jeton du bot, décrites, ajoutées au texte avec le permalien", async () => {
  const appels: { url: string; auth: string | null }[] = [];
  const f = ((url: string, init?: RequestInit) => {
    appels.push({ url, auth: new Headers(init?.headers).get("authorization") });
    return Promise.resolve(png());
  }) as typeof fetch;
  const texte = await texteSlackAvecCaptures("xoxb-test", { subtype: "file_share", text: "I can't log in", files: [img(1)] }, decrire, f);
  assertEquals(appels, [{ url: "https://files.slack.com/files-pri/T1-F1/download/capture1.png", auth: "Bearer xoxb-test" }]);
  assertEquals(texte, "I can't log in\n\n[Screenshot: Ruul screen showing the error \"Invalid code\".] 📎 https://sophia.slack.com/files/U1/F1/capture1.png");
  assert(contientCapture(texte));
  // Sans image : le texte tel quel, aucun appel.
  assertEquals(await texteSlackAvecCaptures("xoxb-test", { text: "hello" }, decrire, f), "hello");
  assertEquals(appels.length, 1);
});

Deno.test("slack captures : au plus 3 images, 5 Mo max chacune", async () => {
  let n = 0;
  const f = (() => {
    n++;
    return Promise.resolve(png());
  }) as typeof fetch;
  const caps = await lireCapturesSlack("xoxb", { files: [img(1), img(2, { size: 6 * 1024 * 1024 }), img(3), img(4)] }, decrire, f);
  assertEquals(caps.length, 3);
  assertEquals(n, 2); // la lourde n'est pas téléchargée
  assertStringIncludes(caps[1]!.erreur!, "trop_lourde");
  // Taille inconnue dans l'évènement, mais content-length trop grand.
  const gros = (() => Promise.resolve(new Response("x", { headers: { "content-type": "image/png", "content-length": String(6 * 1024 * 1024) } }))) as typeof fetch;
  const [c] = await lireCapturesSlack("xoxb", { files: [img(1, { size: undefined })] }, decrire, gros);
  assertStringIncludes(c!.erreur!, "trop_lourde");
});

Deno.test("slack captures : Slack refuse (missing_scope, page de connexion, 403) → « (screenshot not readable) », sans lever", async () => {
  const cas: Response[] = [
    new Response(JSON.stringify({ ok: false, error: "missing_scope", needed: "files:read" }), { status: 200, headers: { "content-type": "application/json" } }),
    new Response("<html>Sign in to Slack</html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }),
    new Response("forbidden", { status: 403 }),
  ];
  const erreurs: string[] = [];
  for (const r of cas) {
    const [c] = await lireCapturesSlack("xoxb", { files: [img(1)] }, decrire, (() => Promise.resolve(r)) as typeof fetch);
    assertEquals(c!.description, null);
    erreurs.push(c!.erreur!);
  }
  assertStringIncludes(erreurs[0]!, "missing_scope");
  assertStringIncludes(erreurs[0]!, "files:read");
  assertStringIncludes(erreurs[1]!, "not_allowed");
  assertStringIncludes(erreurs[2]!, "http_403");
  // Réseau en panne, modèle en panne, pas de jeton : jamais d'exception.
  const panne = (() => Promise.reject(new Error("réseau"))) as typeof fetch;
  const texte = await texteSlackAvecCaptures("xoxb", { text: "look", files: [img(1)] }, decrire, panne);
  assertEquals(texte, `look\n\n[Screenshot: ${CAPTURE_ILLISIBLE}] 📎 https://sophia.slack.com/files/U1/F1/capture1.png`);
  const [m] = await lireCapturesSlack("xoxb", { files: [img(1)] }, () => Promise.reject(new Error("gemini")), (() => Promise.resolve(png())) as typeof fetch);
  assertEquals(m!.erreur, "gemini");
  const [j] = await lireCapturesSlack(null, { files: [img(1)] }, decrire);
  assertStringIncludes(j!.erreur!, "jeton");
});

Deno.test("slack captures : texte final ; une capture seule devient un message pour le support", () => {
  assertEquals(texteAvecCaptures("hi", []), "hi");
  assertEquals(
    texteAvecCaptures("", [{ description: "TikTok login error", permalien: null, erreur: null }, { description: null, permalien: "https://x.slack.com/files/F2", erreur: "http_403" }]),
    `[Screenshot: TikTok login error]\n[Screenshot: ${CAPTURE_ILLISIBLE}] 📎 https://x.slack.com/files/F2`,
  );
  const texte = texteAvecCaptures("", [{ description: "TikTok login error", permalien: null, erreur: null }]);
  const tri = trierEvenementSlack({ type: "message", subtype: "file_share", channel: "C1", user: "U1", ts: "1.1", text: texte }, { canaux: ["C1"], admins: new Set() });
  assertEquals(tri.cas, "question");
  // Sans capture lue, une image seule reste ignorée.
  assertEquals(trierEvenementSlack({ type: "message", subtype: "file_share", channel: "C1", user: "U1", ts: "1.1", text: "" }, { canaux: ["C1"], admins: new Set() }).cas, "ignore");
  assertEquals(contientCapture("no screenshot here"), false);
});
