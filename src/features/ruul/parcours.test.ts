import { describe, expect, it } from "vitest";

import {
  bientotInactif,
  cohorteParDefaut,
  cohortes,
  compterEtapes,
  dansCohorte,
  derniereRelance,
  estPret,
  filtrer,
  membresEtape,
  pastilles,
  prochaineRelance,
  prochainLundi,
  type EtatParcoursRuul,
} from "./parcours";

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
  it("pastilles : tout vert quand tout est fait", () => {
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

  it("prêt à poster : connecté + TikTok + warm-up 5+ ; Slack et Ruul ne bloquent pas", () => {
    const sansSlackNiRuul = base({
      premiere_connexion_at: "2026-11-11T09:00:00Z", tiktok_existe: true, warmup_started_at: "2026-11-11T10:00:00Z",
      abonnements: 5, ruul_statut: null, ruul_compte: null,
    });
    expect(estPret(sansSlackNiRuul)).toBe(true);
    expect(pastilles(sansSlackNiRuul).pret).toBe(true);
    expect(estPret({ ...sansSlackNiRuul, abonnements: 4 })).toBe(false);
    expect(estPret({ ...sansSlackNiRuul, warmup_started_at: null })).toBe(false);
    expect(estPret({ ...sansSlackNiRuul, tiktok_existe: false })).toBe(false);
    expect(estPret({ ...sansSlackNiRuul, premiere_connexion_at: null })).toBe(false);
  });

  it("dans Ruul, Ruul Active, It's done", () => {
    const hors = base({ ruul_statut: null, ruul_compte: null, ruul_email_a_at: "2026-11-11T12:00:00Z" });
    expect(pastilles(hors).invite).toBe(false);
    expect(pastilles(base({ ruul_statut: "invite", ruul_compte: null })).invite).toBe(true);
    expect(pastilles(base({ ruul_statut: null, ruul_compte: "invited" })).invite).toBe(true);
    const paye = pastilles(base({ ruul_statut: "paye_1x", ruul_compte: "active" }));
    expect([paye.invite, paye.active, paye.done]).toEqual([true, true, true]);
    expect(pastilles(base({ ruul_statut: "invite", ruul_compte: "invited" })).done).toBe(false);
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

  it("filtres : pas prêts, Ruul pas fini, jamais connectés, bientôt 14 jours inactifs", () => {
    const vieux = base({ poster_id: "v", cree_at: "2026-11-01T08:00:00Z" });
    const pret = base({ poster_id: "q", ruul_statut: "pret", premiere_connexion_at: "2026-11-11T09:00:00Z" });
    const aPoster = base({
      poster_id: "z", premiere_connexion_at: "2026-11-11T09:00:00Z", tiktok_existe: true,
      warmup_started_at: "2026-11-11T10:00:00Z", abonnements: 7,
    });
    expect(filtrer([base(), aPoster], "pas_prets", jeudi).map((e) => e.poster_id)).toEqual(["p"]);
    expect(filtrer([base(), aPoster], "tous", jeudi)).toHaveLength(2);
    const l = [base(), vieux, pret];
    expect(filtrer(l, "ruul_pas_pret", jeudi).map((e) => e.poster_id)).toEqual(["p", "v"]);
    expect(filtrer(l, "jamais_connectes", jeudi).map((e) => e.poster_id)).toEqual(["p", "v"]);
    expect(bientotInactif(vieux, jeudi)).toBe(true);
    expect(filtrer(l, "bientot_inactifs", jeudi).map((e) => e.poster_id)).toEqual(["v"]);
  });
});

describe("cohorte Ruul étape par étape", () => {
  const a = base({ poster_id: "a", cohorte_lundi: "2026-11-16" });
  const b = base({
    poster_id: "b", cohorte_lundi: "2026-11-16", premiere_connexion_at: "2026-11-11T09:00:00Z", tiktok_existe: true,
    warmup_started_at: "2026-11-11T10:00:00Z", abonnements: 5, ruul_statut: null, ruul_compte: null,
  });
  const c = base({ poster_id: "c", cohorte_lundi: "2026-11-09", slack_user_id: "U1", ruul_statut: "pret", ruul_compte: "active" });
  const d = base({ poster_id: "d", cohorte_lundi: "2026-11-23" });
  const sans = base({ poster_id: "s", cohorte_lundi: null });

  it("liste des cohortes : lundis distincts, la plus récente d'abord", () => {
    expect(cohortes([a, b, c, d, sans])).toEqual(["2026-11-23", "2026-11-16", "2026-11-09"]);
    expect(cohortes([])).toEqual([]);
  });

  it("prochain lundi, à Paris (aujourd'hui si on est lundi)", () => {
    expect(prochainLundi(jeudi)).toBe("2026-11-16");
    expect(prochainLundi(new Date("2026-11-16T10:00:00Z"))).toBe("2026-11-16");
    expect(prochainLundi(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-16"); // lundi 0 h 30 à Paris
    expect(prochainLundi(new Date("2026-12-28T10:00:00Z"))).toBe("2026-12-28");
    expect(prochainLundi(new Date("2026-12-30T10:00:00Z"))).toBe("2027-01-04");
  });

  it("cohorte par défaut : le prochain lundi s'il existe, sinon la plus récente", () => {
    expect(cohorteParDefaut([a, c, d], jeudi)).toBe("2026-11-16");
    expect(cohorteParDefaut([c, d], jeudi)).toBe("2026-11-23");
    expect(cohorteParDefaut([sans], jeudi)).toBeNull();
  });

  it("compte et membres de chaque étape, pour une cohorte", () => {
    const co = dansCohorte([a, b, c, d, sans], "2026-11-16");
    expect(co.map((e) => e.poster_id)).toEqual(["a", "b"]);
    expect(dansCohorte([a, sans], null).map((e) => e.poster_id)).toEqual(["s"]);
    const n = Object.fromEntries(compterEtapes(co).map((x) => [x.cle, x.n]));
    expect(n).toEqual({ compte: 2, connecte: 1, tiktok: 1, warmup: 1, slack: 0, invite: 1, active: 0, done: 0, pret: 1 });
    expect(compterEtapes(co).map((x) => x.libelle)).toEqual([
      "Compte créé", "Connectés", "TikTok", "Warm-up 5+", "Slack", "Dans Ruul", "Ruul Active", "It's done", "Prêts à poster",
    ]);
    expect(membresEtape(co, "pret").map((e) => e.poster_id)).toEqual(["b"]);
    expect(membresEtape(co, "pret", false).map((e) => e.poster_id)).toEqual(["a"]);
    expect(membresEtape(co, "invite").map((e) => e.poster_id)).toEqual(["a"]);
    expect(membresEtape(co, "compte", false)).toEqual([]);
  });
});
