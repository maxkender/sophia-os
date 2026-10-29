import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import { DELAIS_ACCUEIL_DEFAUT, etatsAccueil, type RecrueAccueil } from "./etapes.ts";
import { planRelance, TEXTES_RELANCE_DEFAUT, texteRelance } from "./relance_jour.ts";

const base: RecrueAccueil = {
  poster_id: "p1",
  prenom: "Ana",
  fuseau: "Europe/Paris",
  bienvenue_at: "2026-10-26T10:00:00Z",
  cohorte_lundi: "2026-11-02",
  premiere_connexion_at: null,
  slack_user_id: null,
  contrat_id: "C1",
  compte_id: "c1",
  handle: "ana.books1",
  warmup_started_at: null,
  tiktok_existe: false,
  tiktok_vu_at: null,
  abonnements: null,
  videos: null,
  messages: [],
  prevues: [],
  repondu_at: null,
  kill: null,
  email: "anaa@sophia.com",
};
const plan = (x: RecrueAccueil, iso: string) => planRelance(x, etatsAccueil(x, DELAIS_ACCUEIL_DEFAUT), new Date(iso), DELAIS_ACCUEIL_DEFAUT);
const texte = (x: RecrueAccueil, iso: string) =>
  texteRelance(TEXTES_RELANCE_DEFAUT, plan(x, iso), {
    prenom: x.prenom, handle: x.handle, url: "https://os", lien_etapes: "https://guide", cohorte_lundi: x.cohorte_lundi,
    email: x.email, mot_de_passe: "12345678",
  });

Deno.test("pas connecté : rien avant 24 h, puis les identifiants (jamais « first message »)", () => {
  assertEquals(plan(base, "2026-10-27T09:00:00Z").element, null);
  assertEquals(plan(base, "2026-10-27T11:00:00Z").element, "connexion");
  const t = texte(base, "2026-10-27T11:00:00Z");
  assertStringIncludes(t, "login: anaa@sophia.com, password: 12345678");
  assertEquals(t.includes("first message"), false);
  // Sans e-mail connu : rien ne part.
  assertEquals(texte({ ...base, email: null }, "2026-10-27T11:00:00Z"), "");
});

Deno.test("compte introuvable : « create » seulement sans Start warmup ; avec Start warmup, Needs you et aucun message", () => {
  const connecte = { ...base, premiere_connexion_at: "2026-10-27T08:00:00Z" };
  assertEquals(plan(connecte, "2026-10-28T08:00:00Z").element, null);
  assertEquals(plan(connecte, "2026-10-29T09:00:00Z").element, "tiktok");
  assertStringIncludes(texte(connecte, "2026-10-29T09:00:00Z"), "create your TikTok account @ana.books1");
  const clique = { ...connecte, warmup_started_at: "2026-10-28T08:00:00Z" };
  assertEquals(plan(clique, "2026-10-29T09:00:00Z"), { element: null, elements: [], needsYou: true, follows: 0 });
  assertEquals(texte(clique, "2026-10-29T09:00:00Z"), "");
});

Deno.test("compte trouvé : Start warmup, puis les abonnements qui manquent (24 h après Start warmup)", () => {
  const trouve = { ...base, premiere_connexion_at: "2026-10-27T08:00:00Z", tiktok_existe: true, tiktok_vu_at: "2026-10-28T08:00:00Z" };
  assertEquals(plan(trouve, "2026-10-28T20:00:00Z").element, null);
  assertEquals(plan(trouve, "2026-10-29T09:00:00Z").element, "warmup");
  const lance = { ...trouve, warmup_started_at: "2026-10-29T10:00:00Z", abonnements: 2 };
  assertEquals(plan(lance, "2026-10-29T12:00:00Z").element, null);
  assertEquals(plan(lance, "2026-10-30T11:00:00Z"), { element: "follows", elements: ["follows"], needsYou: false, follows: 3 });
  assertStringIncludes(texte(lance, "2026-10-30T11:00:00Z"), "follow 3 more accounts with @ana.books1");
  assertStringIncludes(texte({ ...lance, abonnements: 4 }, "2026-10-30T11:00:00Z"), "follow 1 more account with");
  // 5 abonnements : plus rien.
  assertEquals(plan({ ...lance, abonnements: 5 }, "2026-10-30T11:00:00Z").element, null);
});

Deno.test("le texte : un seul élément, dans le cadre, avec la date de la cohorte", () => {
  const t = texte(base, "2026-10-27T11:00:00Z");
  assertStringIncludes(t, "Hi Ana, to start posting on Monday 2 November, you still need to log in to your dashboard: https://os");
});

const planSlack = (x: RecrueAccueil, iso: string) =>
  planRelance(x, etatsAccueil(x, DELAIS_ACCUEIL_DEFAUT), new Date(iso), DELAIS_ACCUEIL_DEFAUT, { slack: true });
const texteSlack = (x: RecrueAccueil, iso: string, slack = "https://join.slack/x") =>
  texteRelance(TEXTES_RELANCE_DEFAUT, planSlack(x, iso), {
    prenom: x.prenom, handle: x.handle, url: "https://os", lien_etapes: "https://guide", cohorte_lundi: x.cohorte_lundi,
    email: x.email, mot_de_passe: "12345678", slack,
  });

Deno.test("v4, étape 0 : pas sur Slack, « join our Slack » avec la prochaine étape, dans le même message", () => {
  assertEquals(planSlack(base, "2026-10-27T09:00:00Z").elements, []);
  assertEquals(planSlack(base, "2026-10-27T11:00:00Z").elements, ["slack", "connexion"]);
  const t = texteSlack(base, "2026-10-27T11:00:00Z");
  assertStringIncludes(t, "you still need to join our Slack: https://join.slack/x and log in to your dashboard: https://os");
  // Sur Slack : plus d'étape 0.
  assertEquals(planSlack({ ...base, slack_user_id: "U1" }, "2026-10-27T11:00:00Z").elements, ["connexion"]);
  // Le 2e compte d'un Double : jamais d'étape 0.
  assertEquals(planSlack({ ...base, deuxieme: true }, "2026-10-27T11:00:00Z").elements.includes("slack"), false);
  // Tout fait sauf Slack : l'étape 0 seule.
  const pret = { ...base, premiere_connexion_at: "x", tiktok_existe: true, tiktok_vu_at: "2026-10-27T08:00:00Z", warmup_started_at: "2026-10-27T09:00:00Z", abonnements: 6 };
  assertEquals(planSlack(pret, "2026-10-28T11:00:00Z").elements, ["slack"]);
  assertStringIncludes(texteSlack(pret, "2026-10-28T11:00:00Z"), "you still need to join our Slack: https://join.slack/x.");
});

Deno.test("v4 : sans lien Slack, l'étape 0 est laissée de côté ; Start warmup cliqué et compte introuvable : rien", () => {
  assertStringIncludes(texteSlack(base, "2026-10-27T11:00:00Z", ""), "you still need to log in to your dashboard");
  assertEquals(texteSlack(base, "2026-10-27T11:00:00Z", "").includes("Slack"), false);
  const clique = { ...base, premiere_connexion_at: "2026-10-27T08:00:00Z", warmup_started_at: "2026-10-28T08:00:00Z" };
  assertEquals(planSlack(clique, "2026-10-29T09:00:00Z"), { element: null, elements: [], needsYou: true, follows: 0 });
});
