import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import { DELAIS_ACCUEIL_DEFAUT, etatsAccueil, type RecrueAccueil } from "./etapes.ts";
import {
  debutReel,
  avecLigneStop,
  messageDeRetrait,
  signerRelance,
  choisirRelance,
  historiqueRelances,
  LIGNE_STOP_UPWORK,
  planRelance,
  TEXTES_RELANCE_DEFAUT,
  texteRelance,
} from "./relance_jour.ts";

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
    email: x.email,
  });

Deno.test("pas connecté : rien avant 24 h, puis les identifiants (jamais « first message »)", () => {
  assertEquals(plan(base, "2026-10-27T09:00:00Z").element, null);
  assertEquals(plan(base, "2026-10-27T11:00:00Z").element, "connexion");
  const t = texte(base, "2026-10-27T11:00:00Z");
  // 1/11 : jamais de mot de passe : le lien « Set my password », créé à l'envoi.
  assertStringIncludes(t, "with your login anaa@sophia.com (first time: set your password with your personal link {lien_mot_de_passe})");
  assertEquals(/password\s*:/i.test(t), false);
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
    email: x.email, slack,
  });

Deno.test("10/11 : Slack ne bloque plus : plus jamais de relance « join our Slack »", () => {
  assertEquals(planSlack(base, "2026-10-27T09:00:00Z").elements, []);
  assertEquals(planSlack(base, "2026-10-27T11:00:00Z").elements, ["connexion"]);
  assertEquals(texteSlack(base, "2026-10-27T11:00:00Z").includes("Slack"), false);
  // Tout fait sauf Slack : rien.
  const pret = { ...base, premiere_connexion_at: "x", tiktok_existe: true, tiktok_vu_at: "2026-10-27T08:00:00Z", warmup_started_at: "2026-10-27T09:00:00Z", abonnements: 6 };
  assertEquals(planSlack(pret, "2026-10-28T11:00:00Z").elements, []);
  assertEquals(messageDeRetrait(null), false);
});

Deno.test("v4 : sans lien Slack, l'étape 0 est laissée de côté ; Start warmup cliqué et compte introuvable : rien", () => {
  assertStringIncludes(texteSlack(base, "2026-10-27T11:00:00Z", ""), "you still need to log in to your dashboard");
  assertEquals(texteSlack(base, "2026-10-27T11:00:00Z", "").includes("Slack"), false);
  const clique = { ...base, premiere_connexion_at: "2026-10-27T08:00:00Z", warmup_started_at: "2026-10-28T08:00:00Z" };
  assertEquals(planSlack(clique, "2026-10-29T09:00:00Z"), { element: null, elements: [], needsYou: true, follows: 0 });
});

Deno.test("1/11 : canal des relances : Slack d'abord, Upwork une fois 24 h après ; pas sur Slack : Upwork une fois", () => {
  const t0 = new Date("2026-11-01T10:00:00Z");
  const plus = (h: number) => new Date(t0.getTime() + h * 3_600_000);
  // Sur Slack, rien encore : Slack.
  assertEquals(choisirRelance({ elements: ["connexion"] }, true, new Map(), t0), { element: "connexion", canal: "slack", upwork_prevu_at: null });
  // Slack parti il y a 10 h : on attend, Upwork prévu à +24 h.
  const slack = new Map([["connexion", { slack_at: t0.toISOString() }]]);
  assertEquals(choisirRelance({ elements: ["connexion"] }, true, slack, plus(10)), { element: null, canal: null, upwork_prevu_at: plus(24).toISOString() });
  // 24 h après : Upwork, une fois.
  assertEquals(choisirRelance({ elements: ["connexion"] }, true, slack, plus(24)).canal, "upwork");
  const lesDeux = new Map([["connexion", { slack_at: t0.toISOString(), upwork_at: plus(25).toISOString() }]]);
  assertEquals(choisirRelance({ elements: ["connexion"] }, true, lesDeux, plus(72)).canal, null);
  // Pas sur Slack : Upwork directement, une fois ; puis l'étape suivante.
  assertEquals(choisirRelance({ elements: ["slack", "connexion"] }, false, new Map(), t0), { element: "slack", canal: "upwork", upwork_prevu_at: null });
  const slackFait = new Map([["slack", { upwork_at: t0.toISOString() }]]);
  assertEquals(choisirRelance({ elements: ["slack", "connexion"] }, false, slackFait, plus(30)).element, "connexion");
  assertEquals(choisirRelance({ elements: ["slack"] }, false, slackFait, plus(30)).canal, null);
  // La ligne STOP, une seule fois, sur Upwork.
  assertEquals(avecLigneStop("Hi Ana."), `Hi Ana.\n\n${LIGNE_STOP_UPWORK}`);
  assertEquals(avecLigneStop(avecLigneStop("Hi Ana.")), `Hi Ana.\n\n${LIGNE_STOP_UPWORK}`);
  // L'historique : la 1re relance de chaque étape et de chaque canal.
  const h = historiqueRelances([
    { donnees: { elements: ["slack", "connexion"] }, canaux: ["upwork"], envoye_at: "2026-10-30T10:00:00Z" },
    { donnees: { element: "tiktok" }, canaux: ["slack"], envoye_at: "2026-10-31T10:00:00Z" },
  ]);
  assertEquals(h.get("connexion"), { upwork_at: "2026-10-30T10:00:00Z" });
  assertEquals(h.get("tiktok"), { slack_at: "2026-10-31T10:00:00Z" });
});

Deno.test("1/11 : un ancien texte « log in » qui donne un mot de passe est remplacé par le texte par défaut", () => {
  const t = texteRelance({ ...TEXTES_RELANCE_DEFAUT, connexion: "log in: {url} (login: {email}, password: {mot_de_passe})" }, plan(base, "2026-10-27T11:00:00Z"), {
    prenom: base.prenom, handle: base.handle, url: "https://os", lien_etapes: "https://guide", cohorte_lundi: base.cohorte_lundi, email: base.email,
  });
  assertEquals(t.includes("{mot_de_passe}"), false);
  assertStringIncludes(t, "{lien_mot_de_passe}");
});

Deno.test("1/11 : la relance est signée « Vik Studios team » une seule fois, la ligne STOP reste la dernière", () => {
  const t = signerRelance("Hi Ana, please join our Slack.", "Vik Studios team");
  assertEquals(t, "Hi Ana, please join our Slack.\n\nVik Studios team");
  assertEquals(signerRelance(t, "Vik Studios team"), t);
  assertEquals(avecLigneStop(t).endsWith("If you don't wish to continue, just reply STOP here."), true);
  assertEquals(signerRelance("", "Vik Studios team"), "");
});

Deno.test("1/11 : un STOP (même dans une phrase) ou un retrait arrête les relances ; « stop » en minuscules dans une phrase, non", () => {
  assertEquals(messageDeRetrait("STOP"), true);
  assertEquals(messageDeRetrait("hi, unfortunatly i will have to STOP here"), true);
  assertEquals(messageDeRetrait("I do not wish to proceed. Thank you"), true);
  assertEquals(messageDeRetrait("I can't stop watching TikTok, done with the follows!"), false);
  assertEquals(messageDeRetrait(null), false);
});

Deno.test("10/11 : la date est toujours le lundi de la cohorte (jamais mardi, jamais recalculée)", () => {
  const plan = { element: "tiktok" as const, elements: ["tiktok" as const], needsYou: false, follows: 0 };
  const cadre = { ...TEXTES_RELANCE_DEFAUT, cadre: "Hi {prenom}, to start posting on Monday {date}, you still need to {ce_qui_manque}." };
  const o = { prenom: "Ana", handle: "ana.x", url: "https://os", lien_etapes: "https://guide", cohorte_lundi: "2026-11-16", email: "a@x", mardi: true };
  for (const maintenant of [new Date("2026-11-10T10:00:00Z"), new Date("2026-11-16T10:59:00Z"), new Date("2026-11-16T11:00:00Z")]) {
    const t = texteRelance(cadre, plan, { ...o, maintenant });
    assertStringIncludes(t, "to start posting on Monday 16 November");
    assertEquals(t.includes("Tuesday"), false);
  }
  // Un ancien cadre qui disait « Tuesday {date} » : toujours « Monday ».
  assertStringIncludes(texteRelance({ ...cadre, cadre: "Start on Tuesday {date}: {ce_qui_manque}" }, plan, o), "Start on Monday 16 November");
  // Passé le lundi 12:00 (Paris), la relance ne part plus (debutReel ≠ cohorte : recrues-check l'écarte).
  assertEquals(debutReel("2026-11-02", new Date("2026-11-03T08:00:00Z")), "2026-11-09");
  assertEquals(debutReel("2026-11-09", new Date("2026-11-03T08:00:00Z")), "2026-11-09");
});
