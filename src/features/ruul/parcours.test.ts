import { describe, expect, it } from "vitest";

import { bientotInactif, derniereRelance, filtrer, pastilles, prochaineRelance, type EtatParcoursRuul } from "./parcours";

const base = (x: Partial<EtatParcoursRuul> = {}): EtatParcoursRuul => ({
  poster_id: "p",
  prenom: "Ana",
  login: "anas@sophia.com",
  email: "ana@mail.com",
  cohorte_lundi: "2026-11-16",
  cree_at: "2026-11-11T08:00:00Z",
  premiere_connexion_at: null,
  handle: "ana.x",
  tiktok_existe: null,
  warmup_started_at: null,
  abonnements: null,
  slack_user_id: null,
  ruul_statut: "invite",
  ruul_compte: "invited",
  ruul_email_a_at: null,
  ruul_email_b_at: null,
  relances_stop_at: null,
  posts: 0,
  derniere_activite: null,
  envois: [],
  ...x,
});
const jeudi = new Date("2026-11-12T10:00:00Z");

describe("vue parcours Ruul", () => {
  it("pastilles : prêt seulement quand tout est fait", () => {
    const p = pastilles(base());
    expect(p.compte).toBe(true);
    expect(p.connecte).toBe(false);
    expect(p.invite).toBe(true);
    expect(p.active).toBe(false);
    expect(p.pret).toBe(false);
    const tout = pastilles(base({
      premiere_connexion_at: "2026-11-11T09:00:00Z", tiktok_existe: true, warmup_started_at: "2026-11-11T10:00:00Z",
      abonnements: 5, slack_user_id: "U1", ruul_statut: "pret", ruul_compte: "active", posts: 2,
    }));
    expect(Object.values(tout).every(Boolean)).toBe(true);
  });

  it("prochaine relance : une par étape, puis Ruul tous les 2 jours", () => {
    expect(prochaineRelance(base(), jeudi)?.type).toBe("jamais_connecte");
    const co = base({ premiere_connexion_at: "2026-11-11T09:00:00Z" });
    expect(prochaineRelance(co, jeudi)?.type).toBe("tiktok");
    const ruul = base({
      premiere_connexion_at: "2026-11-11T09:00:00Z", tiktok_existe: true, warmup_started_at: "2026-11-11T10:00:00Z",
      abonnements: 6, slack_user_id: "U1", ruul_email_a_at: "2026-11-11T12:00:00Z",
      envois: [{ cle: "ruul_1", type: "ruul", at: "2026-11-12T08:00:00Z", ok: true }],
    });
    const r = prochaineRelance(ruul, jeudi);
    expect(r?.type).toBe("ruul");
    expect(r?.le?.slice(0, 10)).toBe("2026-11-14");
    expect(derniereRelance(ruul)?.type).toBe("ruul");
    expect(prochaineRelance(base({ relances_stop_at: "2026-11-12T00:00:00Z" }), jeudi)).toBeNull();
  });

  it("filtres : Ruul pas prêt, jamais connectés, bientôt 14 jours inactifs", () => {
    const vieux = base({ poster_id: "v", cree_at: "2026-11-01T08:00:00Z" });
    const pret = base({ poster_id: "q", ruul_statut: "pret", premiere_connexion_at: "2026-11-11T09:00:00Z" });
    const l = [base(), vieux, pret];
    expect(filtrer(l, "ruul_pas_pret", jeudi).map((e) => e.poster_id)).toEqual(["p", "v"]);
    expect(filtrer(l, "jamais_connectes", jeudi).map((e) => e.poster_id)).toEqual(["p", "v"]);
    expect(bientotInactif(vieux, jeudi)).toBe(true);
    expect(filtrer(l, "bientot_inactifs", jeudi).map((e) => e.poster_id)).toEqual(["v"]);
  });
});
