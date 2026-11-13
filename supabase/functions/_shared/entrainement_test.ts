import { assertEquals } from "jsr:@std/assert@1";

import { actionActive, lireGroupes, promptRegroupement, type QuestionLue, resumerGroupe, statutAuto, TEXTE_ATTENTE } from "./entrainement.ts";

const q = (o: Partial<QuestionLue>): QuestionLue => ({
  ref: "c:1", texte: "Can I change my @?", reponse: null, repondu: false, plateforme: "upwork", source: "Slack", qui: "Ana", at: "2026-11-13T10:00:00Z", regle: null, ...o,
});

Deno.test("entraînement : le modèle rend des groupes ; ids existants seulement, chaque question une fois", () => {
  const existants = [{ id: "t1", question: "Can I change my TikTok username?" }];
  const g = lireGroupes('ok {"groupes":[{"existant":"t1","membres":[0,2]},{"existant":"zz","question":"When am I paid?","categorie":"paie","membres":[1,2,9]},{"question":"x","membres":[3]}]}', 4, existants);
  assertEquals(g, [
    { existant: "t1", question: "", categorie: null, membres: [0, 2] },
    { existant: null, question: "When am I paid?", categorie: "paie", membres: [1] },
  ]);
  assertEquals(lireGroupes("pas de json", 3, existants), []);
  const p = promptRegroupement([q({}), q({ texte: "when\n am I paid" })], existants);
  assertEquals(p.includes("- t1 : Can I change my TikTok username?"), true);
  assertEquals(p.includes("1 : when am I paid"), true);
});

Deno.test("entraînement : statut sûr / pas sûr / sans réponse, résumé du groupe", () => {
  assertEquals(statutAuto([q({ repondu: true }), q({ repondu: true })]), "sur");
  assertEquals(statutAuto([q({ repondu: true }), q({})]), "pas_sur");
  assertEquals(statutAuto([q({})]), "sans_reponse");
  const r = resumerGroupe([
    q({ ref: "c:1", at: "2026-11-10T09:00:00Z", reponse: "Yes, tell us the new one.", repondu: true }),
    q({ ref: "s:2", at: "2026-11-13T10:42:00Z", reponse: TEXTE_ATTENTE, plateforme: "ruul", source: "Help", regle: "Changer son @" }),
    q({ ref: "c:3", at: "2026-11-12T18:05:00Z" }),
  ]);
  assertEquals(r.nb, 3);
  assertEquals([r.upwork, r.ruul], [true, true]);
  assertEquals(r.exemples.map((e) => e.at), ["2026-11-13T10:42:00Z", "2026-11-12T18:05:00Z", "2026-11-10T09:00:00Z"]);
  assertEquals(r.reponse_actuelle, "Yes, tell us the new one.");
  assertEquals(r.regles, ["Changer son @"]);
  assertEquals(r.statut_auto, "pas_sur");
});

Deno.test("entraînement : une action désactivée n'est plus faite (absente = active)", () => {
  assertEquals(actionActive({}, "pseudo_tiktok"), true);
  assertEquals(actionActive({ pseudo_tiktok: false }, "pseudo_tiktok"), false);
  assertEquals(actionActive({ pseudo_tiktok: true }, "pseudo_tiktok"), true);
  assertEquals(actionActive(null, "arret"), true);
  assertEquals(actionActive({ arret: false }, null), true);
});
