import { describe, expect, it } from "vitest";

import { detecterProblemes } from "./problemes";
import { datesCourtes, resumer } from "@/features/ckd/decisions/resumeContexte";

const maintenant = new Date("2026-10-31T10:00:00Z");

describe("Problems : seulement le grave, avec une piste", () => {
  it("rien quand tout va bien", () => {
    expect(detecterProblemes({ sante: { taches: [], upwork: null, upwork_comptes: [] }, frequences: { taches: [], appels_jour: 10, limite: 1000, alerte: 800 }, freins: [], pause: { actif: false, depuis: null, par_nom: null } }, maintenant)).toEqual([]);
  });

  it("pause, Upwork plein partout, 429 du jour, tâche en erreur, frein ; le grave d'abord", () => {
    const compte = (o: Record<string, unknown>) => ({
      compte: "principal", statut: "connecte", connecte_une_fois: true, utilisateur: null, organisations: null, utilises: 45, limite: true,
      access_expire_at: null, derniere_erreur: null, dernier_appel_at: null, renouvellement_at: null, renouvellement_erreur: null, expire_bientot: false, alerte: false, ...o,
    });
    const p = detecterProblemes({
      sante: {
        taches: [
          { tache: "accueil", job: "upwork-accueil", existe: true, actif: true, dernier_at: null, statut: "failed", message: "boom", passage_at: null, en_erreur: true, en_retard: false },
          { tache: "paie", job: "paie-auto", existe: true, actif: true, dernier_at: null, statut: null, message: null, passage_at: null, en_erreur: false, en_retard: true },
        ],
        upwork: null,
        upwork_comptes: [compte({}), compte({ compte: "secours", expire_bientot: true })] as never,
        upwork_max: 45,
      },
      frequences: { taches: [{ tache: "accueil", reglee: 30, effective: 60, dernier_at: null, dernier_429_at: "2026-10-31T08:12:00Z" }], appels_jour: 900, limite: 1000, alerte: 800 },
      freins: [{ id: "f1", type: "relance", motif: "plafond_heure", detail: null, cree_at: "2026-10-31T07:00:00Z" }],
      pause: { actif: true, depuis: "2026-10-31T06:00:00Z", par_nom: "Max" },
    }, maintenant);
    const cles = p.map((x) => x.cle);
    expect(cles).toEqual(expect.arrayContaining(["pause", "upwork_plein", "upwork_429", "appels_api", "tache_erreur:upwork-accueil", "tache_retard:paie-auto", "frein:f1", "upwork_expire:secours"]));
    expect(p.find((x) => x.cle === "upwork_429")?.params.heure).toBe("09:12");
    // Le grave d'abord.
    const premierAttention = p.findIndex((x) => x.gravite === "attention");
    expect(p.slice(premierAttention).every((x) => x.gravite === "attention")).toBe(true);
  });
});

describe("Contexte : une ligne, des dates au jour près", () => {
  it("pas de réponse à nos messages depuis sa dernière réponse ; stop ; a répondu", () => {
    const fil = [
      { sens: "recu" as const, at: "2026-10-27T09:00:00Z", canal: "upwork", texte: "Ok I will do it" },
      { sens: "envoye" as const, at: "2026-10-28T10:00:00Z", canal: "slack", texte: "Hi" },
      { sens: "envoye" as const, at: "2026-10-30T10:00:00Z", canal: "upwork", texte: "Hi again" },
      { sens: "envoye" as const, at: "2026-10-30T18:00:00Z", canal: "slack", texte: "Hi again" },
    ];
    const r = resumer(fil);
    expect([r.verdict, r.sansReponse.n, r.sansReponse.dates]).toEqual(["silence", 3, ["2026-10-28", "2026-10-30"]]);
    expect(datesCourtes(r.sansReponse.dates)).toBe("28 Oct, 30 Oct");
    expect(resumer([{ sens: "recu", at: "2026-10-29T09:00:00Z", canal: "slack", texte: "I want to stop, sorry" }]).verdict).toBe("stop");
    expect(resumer(fil.slice(0, 1)).verdict).toBe("repondu");
    expect(resumer([]).verdict).toBe("rien");
    expect(datesCourtes(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"])).toBe("+2 · 3 Oct, 4 Oct, 5 Oct");
  });
});
