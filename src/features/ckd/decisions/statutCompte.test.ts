import { describe, expect, it } from "vitest";

import { compte } from "./semaineComptes.test";
import { csvMasterlist, evaluerCompte, type ExtrasCompte, nomsConcordent, ongletDe, ordreStatut } from "./statutCompte";

const extras = (o: Partial<ExtrasCompte> = {}): ExtrasCompte => ({
  compte_id: "c1", poster_id: "p1", sans_contrat: false, contrat_id: "123", freelance_nom: "Ana S.", profil_nom: "Ana Silva",
  message_recu_at: null, message_apercu: null, reponse_apres_nudge: false, liens_a_verifier: 0, vues_baisse: false,
  actif_semaines: 6, fiable_semaines: 5, dernier_nudge_at: null, needs_you_n: 0, disputes_n: 0, to_read_n: 0,
  connecte: true, sur_slack: true, tiktok_trouve: true, start_warmup: true, abonnements: 10, relances: 0, derniere_reaction_at: null, ...o,
});

const O = { lundi: "2026-10-26", aujourdhui: "2026-10-31", maintenant: new Date("2026-10-31T10:00:00Z"), page: "samedi" as const };
// Un compte dans les clous : tous les jours passés avec leurs liens.
const bon = compte({ jours: [{ jour: "2026-10-26", prevus: 2, lien: 2 }, { jour: "2026-10-27", prevus: 2, lien: 2 }, { jour: "2026-10-28", prevus: 2, lien: 2 }] });
const zero = compte({
  jours: [{ jour: "2026-10-26", prevus: 2, lien: 0 }, { jour: "2026-10-27", prevus: 2, lien: 0 }, { jour: "2026-10-28", prevus: 2, lien: 0 }],
  prevus_passes: 6, lien_passes: 0, lien_total: 0, nudge_envoye_at: "2026-10-29T15:00:00Z",
});

describe("prompts 12 et 14 : le statut et la proposition, en direct", () => {
  it("0 post, nudgé, pas de réponse : rouge, Kill proposé (plus jamais « Nothing to report »)", () => {
    const e = evaluerCompte(zero, extras(), O);
    expect([e.statut, e.proposition, e.raison]).toEqual(["rouge", "kill", "zero_post"]);
    expect(e.signaux[0]).toEqual({ cle: "zero_post", valeurs: { nudge: "sans_reponse" } });
  });

  it("pas de contrat : le Kill est bloqué (Keep, raison « relier le contrat »)", () => {
    const e = evaluerCompte(zero, extras({ sans_contrat: true }), O);
    expect([e.statut, e.proposition, e.raison]).toEqual(["rouge", "keep", "sans_contrat"]);
  });

  it("un jour manqué : orange, Keep ; plusieurs : rouge", () => {
    const un = compte({ jours: [{ jour: "2026-10-26", prevus: 2, lien: 1 }, { jour: "2026-10-27", prevus: 2, lien: 2 }], lien_passes: 5, lien_total: 5 });
    expect(evaluerCompte(un, extras(), O)).toMatchObject({ statut: "orange", proposition: "keep", raison: "surveiller" });
    const deux = compte({ jours: [{ jour: "2026-10-26", prevus: 2, lien: 1 }, { jour: "2026-10-27", prevus: 2, lien: 0 }], lien_passes: 3, lien_total: 3 });
    expect(evaluerCompte(deux, extras(), O)).toMatchObject({ statut: "rouge", proposition: "keep", raison: "jours_manques_keep" });
  });

  it("de confiance : actif et fiable depuis 3 semaines, rien d'ouvert, pas nudgé ; sinon « rien à signaler »", () => {
    expect(evaluerCompte(bon, extras(), O).statut).toBe("vert");
    expect(evaluerCompte(bon, extras({ fiable_semaines: 2 }), O).statut).toBe("ok");
    expect(evaluerCompte(bon, extras({ needs_you_n: 1 }), O).statut).toBe("ok");
    expect(evaluerCompte(bon, extras({ dernier_nudge_at: "2026-10-22T10:00:00Z" }), O).statut).toBe("ok");
    // Le jeudi : jamais « de confiance ».
    expect(evaluerCompte(bon, extras(), { ...O, page: "jeudi" }).statut).toBe("ok");
  });

  it("shadowban : Recreate ; message pas traité : rouge ; déjà traité : orange", () => {
    expect(evaluerCompte(compte({ shadowban: "shadowban" }), extras(), O)).toMatchObject({ statut: "rouge", proposition: "recreate" });
    expect(evaluerCompte(compte({}), extras({ message_recu_at: "2026-10-30T10:00:00Z", to_read_n: 1 }), O))
      .toMatchObject({ statut: "rouge", proposition: "repondre" });
    expect(evaluerCompte(bon, extras({ message_recu_at: "2026-10-30T10:00:00Z" }), O).statut).toBe("orange");
  });

  it("recrues de la cohorte qui arrive : le samedi, Keep sans signal ; le jeudi, sans réaction → Kill, étapes manquantes → Reporter", () => {
    const r = compte({ cohorte_lundi: "2026-11-02", jours: [], prevus_passes: 0, lien_passes: 0, lien_total: 0 });
    expect(ongletDe(r, O.lundi)).toBe("recrues");
    expect(evaluerCompte(r, extras({ connecte: false, relances: 3 }), O)).toMatchObject({ statut: "ok", proposition: "keep", recrue: true });
    const J = { ...O, page: "jeudi" as const };
    expect(evaluerCompte(r, extras({ connecte: false, relances: 3 }), J)).toMatchObject({ statut: "rouge", proposition: "kill", recrue: true });
    expect(evaluerCompte(r, extras({ start_warmup: false, relances: 1, derniere_reaction_at: "2026-10-29T10:00:00Z" }), J))
      .toMatchObject({ statut: "orange", proposition: "reporter" });
  });

  it("le nom Upwork qui ne correspond pas : « vérifier le contrat » ; l'ordre : rouge, orange, rien, confiance", () => {
    expect(nomsConcordent("Ana S.", "Ana Silva")).toBe(true);
    expect(nomsConcordent("Hussein F.", "Ana Silva")).toBe(false);
    expect(evaluerCompte(compte({}), extras({ freelance_nom: "Hussein F." }), O).contratAVerifier).toBe(true);
    const tri = [evaluerCompte(bon, extras(), O), evaluerCompte(zero, extras(), O)].sort(ordreStatut);
    expect(tri.map((e) => e.statut)).toEqual(["rouge", "vert"]);
  });

  it("export CSV de la liste filtrée", () => {
    const e = evaluerCompte(zero, extras(), O);
    const csv = csvMasterlist([{ c: zero, e, choix: "kill", phrase: "0 post" }]);
    expect(csv.split("\n")[0]).toBe("handle,poster,hm,pays,cohorte,posts_avec_lien,attendus,statut,probleme,proposition,choix");
    expect(csv.split("\n")[1]).toContain('"rouge","0 post","kill","kill"');
  });
});
