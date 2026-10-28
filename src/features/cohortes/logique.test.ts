import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { RecrueCohorte } from "./api";
import {
  caseEtape,
  cohorteDeLOffre,
  cohorteLundiDe,
  cohortesParDefaut,
  entonnoir,
  estRouge,
  filtrer,
  phaseCohorte,
  pretLundi,
  quatreDernieres,
  samediRecrue,
  tableauHm,
} from "./logique";

function recrue(o: Partial<RecrueCohorte> = {}): RecrueCohorte {
  return {
    poster_id: "p1",
    nom: "Ana Silva",
    pays: "BR",
    hm_id: "hm-lucia",
    hm_prenom: "Lucia",
    contrat: true,
    is_active: true,
    offre_at: "2026-10-26T10:00:00Z",
    cohorte_lundi: "2026-11-02",
    premiere_connexion_at: null,
    slack_lie: false,
    slack_lie_at: null,
    compte_id: "c1",
    handle: "ana.tt",
    tiktok_existe: null,
    tiktok_vu_at: null,
    abonnements: null,
    warmup_started_at: null,
    warmup_reposts_at: null,
    semaine1: [],
    samedi: [],
    nudges: [],
    prevues: [],
    rouges: [],
    ...o,
  };
}

const PRETE = {
  premiere_connexion_at: "2026-10-26T12:00:00Z",
  slack_lie: true,
  slack_lie_at: "2026-10-27T09:00:00Z",
  tiktok_existe: true,
  tiktok_vu_at: "2026-10-28T08:00:00Z",
  abonnements: 6,
  warmup_started_at: "2026-10-28T10:00:00Z",
  warmup_reposts_at: "2026-10-29T10:00:00Z",
} as const;

describe("la règle de cohorte (vendredi → jeudi, lundi qui suit)", () => {
  it("les 4 exemples du prompt 17", () => {
    expect(cohorteLundiDe("2026-10-26")).toBe("2026-11-02"); // lun. 26 oct.
    expect(cohorteLundiDe("2026-10-29")).toBe("2026-11-02"); // jeu. 29 oct.
    expect(cohorteLundiDe("2026-10-30")).toBe("2026-11-09"); // ven. 30 oct.
    expect(cohorteLundiDe("2026-11-01")).toBe("2026-11-09"); // dim. 1er nov.
  });

  it("l'heure de Paris compte : jeudi 23 h 30 à Paris, c'est encore jeudi", () => {
    expect(cohorteDeLOffre(new Date("2026-10-29T22:30:00Z"))).toBe("2026-11-02");
    expect(cohorteDeLOffre(new Date("2026-10-29T23:30:00Z"))).toBe("2026-11-09");
  });

  it("le jour limite est un réglage (mercredi = 3)", () => {
    expect(cohorteLundiDe("2026-10-29", 3)).toBe("2026-11-09");
    expect(cohorteLundiDe("2026-10-28", 3)).toBe("2026-11-02");
  });

  it("la même règle que la base (0391, cohorte_lundi_de)", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/0391_relances.sql"), "utf8");
    expect(sql).toMatch(/p_jour \+ \(7 - coalesce\(.*cohorte_jour_limite.*, 4\)\)/);
    expect(sql).toContain("(d + (8 - extract(isodow from d)::int))::date");
  });

  it("un posteur existant garde sa cohorte : seul « Reporter » la change", () => {
    const sql0391 = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/0391_relances.sql"), "utf8");
    // Le trigger ne la calcule qu'à la création, si elle est vide.
    expect(sql0391).toContain("before insert on public.profiles");
    expect(sql0391).toContain("if new.cohorte_lundi is null then");
    const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/0392_cohortes.sql"), "utf8");
    const ecritures = sql.match(/set cohorte_lundi/g) ?? [];
    expect(ecritures).toHaveLength(1);
    const reporter = sql.slice(sql.indexOf("function public.cohorte_reporter("), sql.indexOf("function public.cohorte_arreter("));
    expect(reporter).toContain("set cohorte_lundi = v_nouveau");
  });
});

describe("les cohortes affichées", () => {
  it("par défaut : celle en préparation et celle en semaine 1", () => {
    const lundis = ["2026-11-09", "2026-11-02", "2026-10-26", "2026-10-19"];
    expect(cohortesParDefaut(lundis, "2026-10-28")).toEqual(["2026-11-02", "2026-10-26"]);
    expect(phaseCohorte("2026-11-02", "2026-10-28")).toEqual({ prepa: true });
    expect(phaseCohorte("2026-10-26", "2026-10-28")).toEqual({ prepa: false, semaine: 1 });
    expect(phaseCohorte("2026-10-19", "2026-10-28")).toEqual({ prepa: false, semaine: 2 });
    expect(quatreDernieres(lundis, "2026-10-28")).toEqual(["2026-10-26", "2026-10-19"]);
  });
});

describe("les cases : une seule chose chacune", () => {
  it("fait > rouge > relancé > prévu > bloqué > pas encore", () => {
    expect(caseEtape(recrue(PRETE), "acces")).toEqual({ etat: "fait", le: "2026-10-26T12:00:00Z" });
    const rouge = recrue({
      rouges: [{ etape: "acces", periode: "2026-11-02", rouge_at: "2026-10-28T11:10:00Z", decision: null, decision_at: null }],
      nudges: [{ type: "acces", periode: "2026-11-02", envoye_at: "2026-10-27T11:10:00Z", canal: "upwork", resolu_at: null, erreur: null }],
    });
    expect(caseEtape(rouge, "acces")).toEqual({ etat: "rouge", le: "2026-10-28T11:10:00Z" });
    expect(estRouge(rouge)).toBe(true);
    const relance = recrue({ nudges: rouge.nudges });
    expect(caseEtape(relance, "acces")).toEqual({ etat: "relance", le: "2026-10-27T11:10:00Z", canal: "upwork" });
    const prevue = recrue({ prevues: [{ type: "tiktok", periode: "2026-11-02", statut: "prevu", canal: "slack", raison: "simulation" }] });
    expect(caseEtape(prevue, "tiktok")).toEqual({ etat: "prevu", canal: "slack" });
    const bloque = recrue({
      prevues: [{ type: "acces", periode: "2026-11-02", statut: "bloque", canal: null, raison: "contrat_non_relie" }],
    });
    expect(caseEtape(bloque, "acces")).toEqual({ etat: "bloque", raison: "contrat_non_relie" });
    expect(caseEtape(recrue(), "warmup")).toEqual({ etat: "attente" });
  });

  it("après « Reporter », la relance déjà envoyée reste visible et la ligne n'est plus rouge", () => {
    const r = recrue({
      cohorte_lundi: "2026-11-09",
      nudges: [{ type: "acces", periode: "2026-11-02", envoye_at: "2026-10-27T11:10:00Z", canal: "upwork", resolu_at: null, erreur: null }],
      rouges: [{ etape: "acces", periode: "2026-11-02", rouge_at: "2026-10-28T11:10:00Z", decision: "reporter", decision_at: "x" }],
    });
    expect(estRouge(r)).toBe(false);
    expect(caseEtape(r, "acces").etat).toBe("relance");
  });

  it("28 oct. : prêt = TikTok + Start warmup + 5 follows ; ni Slack ni reposts", () => {
    expect(pretLundi(recrue(PRETE))).toBe(true);
    expect(pretLundi(recrue({ ...PRETE, abonnements: 4 }))).toBe(false);
    // Accès fait sans Slack → étape verte.
    expect(caseEtape(recrue({ ...PRETE, slack_lie: false, slack_lie_at: null }), "acces").etat).toBe("fait");
    expect(pretLundi(recrue({ ...PRETE, slack_lie: false }))).toBe(true);
    // Warm-up sans reposts → prêt.
    expect(pretLundi(recrue({ ...PRETE, warmup_reposts_at: null }))).toBe(true);
  });

  it("samedi : la décision de Check, Kill or Double", () => {
    const base = { cohorte_lundi: "2026-10-19" };
    expect(samediRecrue(recrue(base), "2026-10-23")).toBe("attente");
    expect(samediRecrue(recrue(base), "2026-10-24")).toBe("garde");
    const kill = [{ regle: "premiere_semaine", action: "ne_pas_renouveler", decision: "ne_pas_renouveler", compte_id: "c1" }];
    expect(samediRecrue(recrue({ ...base, samedi: kill }), "2026-10-28")).toBe("kill");
    expect(samediRecrue(recrue({ ...base, samedi: [{ ...kill[0]!, decision: null }] }), "2026-10-28")).toBe("a_decider");
    expect(samediRecrue(recrue({ ...base, is_active: false }), "2026-10-28")).toBe("arrete");
  });
});

describe("entonnoir, filtres, tableau par HM", () => {
  it("un Double n'est pas une recrue : 2 comptes, 1 recrue", () => {
    const r = recrue({
      ...PRETE,
      cohorte_lundi: "2026-10-19",
      semaine1: [
        { compte_id: "c1", handle: "ana.tt", is_active: true, prevus: 14, publies: 12, publies_lun_mar: 4 },
        { compte_id: "c2", handle: "ana.double", is_active: true, prevus: 2, publies: 2, publies_lun_mar: 0 },
      ],
    });
    expect(entonnoir([r], "2026-10-28")).toEqual({ offre: 1, acces: 1, tiktok: 1, warmup: 1, pret: 1, aPoste: 1, garde: 1 });
  });

  it("une recrue d'une ancienne cohorte qui a posté : TikTok et warm-up faits même sans relevé", () => {
    const r = recrue({
      premiere_connexion_at: "x",
      slack_lie: true,
      cohorte_lundi: "2026-10-12",
      semaine1: [{ compte_id: "c1", handle: "a", is_active: true, prevus: 14, publies: 10, publies_lun_mar: 2 }],
    });
    expect(caseEtape(r, "tiktok").etat).toBe("fait");
    expect(pretLundi(r)).toBe(true);
  });

  it("3 filtres : rouges, HM, pays", () => {
    const rouge = recrue({
      poster_id: "a",
      rouges: [{ etape: "tiktok", periode: "2026-11-02", rouge_at: "x", decision: null, decision_at: null }],
    });
    const autre = recrue({ poster_id: "b", hm_id: "hm-rana", pays: "AU" });
    expect(filtrer([rouge, autre], { rouges: true, hm: "", pays: "" }).map((r) => r.poster_id)).toEqual(["a"]);
    expect(filtrer([rouge, autre], { rouges: false, hm: "hm-rana", pays: "" }).map((r) => r.poster_id)).toEqual(["b"]);
    expect(filtrer([rouge, autre], { rouges: false, hm: "", pays: "BR" }).map((r) => r.poster_id)).toEqual(["a"]);
  });

  it("par HM : % prêtes lundi, % gardées samedi sur les cohortes dont le samedi est passé", () => {
    const lignes = tableauHm(
      [
        recrue({ ...PRETE, poster_id: "a", cohorte_lundi: "2026-10-19" }),
        recrue({ poster_id: "b", cohorte_lundi: "2026-10-19", is_active: false }),
        recrue({ ...PRETE, poster_id: "c", cohorte_lundi: "2026-10-26" }),
        recrue({ poster_id: "d", hm_id: "hm-rana", hm_prenom: "Rana", cohorte_lundi: "2026-10-26" }),
      ],
      "2026-10-28",
    );
    expect(lignes).toEqual([
      { hm_id: "hm-lucia", hm_prenom: "Lucia", recrues: 3, pretes: 67, gardees: 50 },
      { hm_id: "hm-rana", hm_prenom: "Rana", recrues: 1, pretes: 0, gardees: null },
    ]);
  });
});
