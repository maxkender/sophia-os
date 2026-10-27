import { assertEquals } from "jsr:@std/assert@1";

import {
  colonnesVoulues,
  type LangueOs,
  type LigneNotionRelecteurs,
  planifierRelecteurs,
  proprietesOs,
  type RelecteurOs,
  titreLangue,
} from "./notion_relecteurs.ts";

function langue(code: string, posteurs: number, posts30j: number): LangueOs {
  return { code, posteurs, posts30j };
}
function relecteur(langue: string, nom: string, statut: RelecteurOs["statut"], extra: Partial<RelecteurOs> = {}): RelecteurOs {
  return { langue, nom, statut, reponses: 0, questionnaireEnvoye: false, kitRendus: 0, ...extra };
}
function ligne(code: string, extra: Partial<LigneNotionRelecteurs> = {}): LigneNotionRelecteurs {
  return {
    pageId: `page-${code}`,
    code,
    statut: "Aucun candidat",
    candidats: "",
    relecteur: "",
    questionnaire: null,
    kit: "",
    posteurs: 0,
    posts30j: 0,
    ...extra,
  };
}

Deno.test("un relecteur accepté donne son statut, son nom, le questionnaire et le kit à sa langue", () => {
  const c = colonnesVoulues(
    "it",
    langue("it", 18, 631),
    [relecteur("it", "Gianna Olanda", "actif", { reponses: 12, kitRendus: 3 })],
    15,
    { statut: "Candidats Slack", candidats: "Gianna, Sara" },
  );
  assertEquals(c, {
    statut: "Actif",
    relecteur: "Gianna Olanda (actif)",
    questionnaire: "En cours",
    kit: "3 / 15",
    posteurs: 18,
    posts30j: 631,
  });
});

Deno.test("plusieurs relecteurs : le meilleur statut, un kit par prénom, les retirés à part", () => {
  const c = colonnesVoulues(
    "it",
    langue("it", 18, 631),
    [
      relecteur("it", "Sara Rabolini", "invite"),
      relecteur("it", "Gianna Olanda", "actif", { questionnaireEnvoye: true, kitRendus: 5 }),
      relecteur("it", "Claudia Bonaccorsi", "retire", { kitRendus: 15 }),
    ],
    15,
    null,
  );
  assertEquals(c.statut, "Actif");
  assertEquals(c.relecteur, "Gianna Olanda (actif), Sara Rabolini (invité), Claudia Bonaccorsi (retiré)");
  assertEquals(c.questionnaire, "Envoyé");
  assertEquals(c.kit, "Gianna 5 / 15 · Sara 0 / 15");
});

Deno.test("sans relecteur, un statut posé à la main reste ; un statut de l'OS retombe sur la colonne Candidats", () => {
  const sans = (statut: string | null, candidats: string) =>
    colonnesVoulues("hu", langue("hu", 9, 607), [], 15, { statut, candidats }).statut;
  assertEquals(sans("Candidats Slack", "Judit"), "Candidats Slack");
  assertEquals(sans("Aucun candidat", ""), "Aucun candidat");
  assertEquals(sans("Actif", "Judit"), "Candidats Slack");
  assertEquals(sans("Invité", ""), "Aucun candidat");
  assertEquals(sans(null, ""), "Aucun candidat");
});

Deno.test("n'écrit que les lignes qui changent, et ne touche pas aux doublons", () => {
  const plan = planifierRelecteurs(
    [langue("it", 18, 631), langue("hu", 9, 607), langue("de", 22, 1277)],
    [relecteur("it", "Gianna Olanda", "invite")],
    15,
    [
      ligne("it", { statut: "Candidats Slack", candidats: "Gianna", posteurs: 18, posts30j: 631 }),
      ligne("hu", { statut: "Candidats Slack", candidats: "Judit", posteurs: 9, posts30j: 607 }),
      ligne("de", { posteurs: 22, posts30j: 1000 }),
      ligne("tr", { pageId: "tr-1" }),
      ligne("tr", { pageId: "tr-2" }),
      ligne("", { pageId: "vide" }),
    ],
  );
  assertEquals(plan.inchangees, 1);
  assertEquals(
    plan.majs.map((m) => [m.code, m.colonnes.statut, m.colonnes.posts30j]),
    [
      ["it", "Invité", 631],
      ["de", "Aucun candidat", 1277],
    ],
  );
  assertEquals(plan.doublons, ["tr"]);
  assertEquals(plan.creations, []);
});

Deno.test("crée la ligne d'une langue qui passe le seuil ou reçoit un relecteur, pas des autres", () => {
  const plan = planifierRelecteurs(
    [langue("ro", 6, 427), langue("he", 1, 1), langue("lv", 1, 0)],
    [relecteur("lv", "Test Letton", "invite")],
    15,
    [],
  );
  assertEquals(
    plan.creations.map((c) => [c.code, c.titre, c.colonnes.statut]),
    [
      ["lv", "🇱🇻 Letton", "Invité"],
      ["ro", "🇷🇴 Roumain", "Aucun candidat"],
    ],
  );
});

Deno.test("titre d'une langue inconnue, et propriétés vides écrites comme vides", () => {
  assertEquals(titreLangue("xx"), "XX");
  const p = proprietesOs(
    { statut: "Aucun candidat", relecteur: "", questionnaire: null, kit: "", posteurs: 0, posts30j: 0 },
    "2026-10-27T17:00:00Z",
  );
  assertEquals(p.Relecteur, { rich_text: [] });
  assertEquals(p.Questionnaire, { select: null });
  assertEquals(p["Maj OS"], { date: { start: "2026-10-27T17:00:00Z" } });
});
