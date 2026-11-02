/**
 * Relier les posteurs à Slack : email perso d'abord, puis email de connexion,
 * puis nom complet sans accents ni casse ; jamais un lien ambigu, jamais un
 * compte Slack déjà pris, jamais un bot ni un membre supprimé.
 */

import { assertEquals } from "jsr:@std/assert@1";

import { apparier, lireMembres, type MembreSlack, normaliserNom, type PosteurSlack } from "./slack_relier.ts";

const m = (id: string, nom: string | null, email: string | null = null, extra: Partial<MembreSlack> = {}): MembreSlack => ({
  slack_user_id: id,
  nom_reel: nom,
  nom_affiche: null,
  email,
  bot: false,
  supprime: false,
  ...extra,
});
const p = (id: string, prenom: string, nom: string, email_perso: string | null = null, extra: Partial<PosteurSlack> = {}): PosteurSlack => ({
  id,
  prenom,
  nom,
  email_perso,
  email: null,
  slack_user_id: null,
  ...extra,
});

Deno.test("normaliserNom : accents, casse et ponctuation", () => {
  assertEquals(normaliserNom("  José  María-López "), "jose maria lopez");
  assertEquals(normaliserNom("ŁUKASZ Żółć"), "lukasz zolc");
  assertEquals(normaliserNom(null), "");
});

Deno.test("email perso, sans casse ni espaces", () => {
  const r = apparier([p("a", "Ana", "Silva", " Ana@Mail.com ")], [m("U0000001", "Someone", "ana@mail.com")], new Set());
  assertEquals(r.liens, [{ profile_id: "a", slack_user_id: "U0000001", par: "email" }]);
});

Deno.test("email de connexion si l'email perso ne donne rien", () => {
  const r = apparier(
    [p("a", "Ana", "Silva", "autre@mail.com", { email: "ana@os.com" })],
    [m("U0000001", "X Y", "ana@os.com")],
    new Set(),
  );
  assertEquals(r.liens[0].par, "email");
});

Deno.test("nom complet sans accents ni casse", () => {
  const r = apparier([p("a", "José", "Pérez")], [m("U0000001", "jose perez")], new Set());
  assertEquals(r.liens, [{ profile_id: "a", slack_user_id: "U0000001", par: "nom" }]);
});

Deno.test("nom affiché aussi", () => {
  const r = apparier([p("a", "José", "Pérez")], [m("U0000001", null, null, { nom_affiche: "José Pérez" })], new Set());
  assertEquals(r.liens.length, 1);
});

Deno.test("deux membres Slack au même nom : personne n'est relié", () => {
  const r = apparier([p("a", "Ana", "Silva")], [m("U0000001", "Ana Silva"), m("U0000002", "ana silva")], new Set());
  assertEquals(r.liens, []);
  assertEquals(r.ambigus, ["a"]);
});

Deno.test("deux posteurs au même nom : personne n'est relié", () => {
  const r = apparier([p("a", "Ana", "Silva"), p("b", "Ana", "Silva")], [m("U0000001", "Ana Silva")], new Set());
  assertEquals(r.liens, []);
});

Deno.test("un membre qui ressemble à deux posteurs (nom réel et nom affiché) : personne", () => {
  const r = apparier(
    [p("a", "Ana", "Silva"), p("b", "Ana", "Costa")],
    [m("U0000001", "Ana Silva", null, { nom_affiche: "Ana Costa" })],
    new Set(),
  );
  assertEquals(r.liens, []);
});

Deno.test("un prénom seul ne suffit pas", () => {
  const r = apparier([p("a", "Ana", "")], [m("U0000001", "Ana")], new Set());
  assertEquals(r.liens, []);
});

Deno.test("bot, supprimé, Slackbot et compte déjà pris sont exclus", () => {
  const posteurs = [p("a", "Ana", "Silva"), p("b", "Bo", "Lee"), p("c", "Cy", "Ro"), p("d", "Di", "Fa")];
  const membres = [
    m("U0000001", "Ana Silva", null, { bot: true }),
    m("U0000002", "Bo Lee", null, { supprime: true }),
    m("USLACKBOT", "Cy Ro"),
    m("U0000004", "Di Fa"),
  ];
  assertEquals(apparier(posteurs, membres, new Set(["U0000004"])).liens, []);
});

Deno.test("un posteur déjà relié n'est pas retouché ; l'email passe avant le nom", () => {
  const r = apparier(
    [p("a", "Ana", "Silva", null, { slack_user_id: "U0000009" }), p("b", "Bo", "Lee", "bo@mail.com")],
    [m("U0000001", "Ana Silva"), m("U0000002", "Bo Lee"), m("U0000003", "Robert", "bo@mail.com")],
    new Set(["U0000009"]),
  );
  assertEquals(r.liens, [{ profile_id: "b", slack_user_id: "U0000003", par: "email" }]);
});

Deno.test("team_join : le motif est forcé", () => {
  const r = apparier([p("a", "Ana", "Silva")], [m("U0000001", "Ana Silva")], new Set(), "team_join");
  assertEquals(r.liens[0].par, "team_join");
});

Deno.test("lireMembres suit la pagination et lit les profils", async () => {
  const pages = [
    { ok: true, members: [{ id: "U1", profile: { real_name: "A B", email: "a@b.c" } }], response_metadata: { next_cursor: "x" } },
    { ok: true, members: [{ id: "U2", is_bot: true, profile: {} }], response_metadata: { next_cursor: "" } },
  ];
  let i = 0;
  const fauxFetch = (() => Promise.resolve(new Response(JSON.stringify(pages[i++])))) as typeof fetch;
  const membres = await lireMembres("t", fauxFetch);
  assertEquals(membres.map((x) => [x.slack_user_id, x.nom_reel, x.email, x.bot]), [
    ["U1", "A B", "a@b.c", false],
    ["U2", null, null, true],
  ]);
});
