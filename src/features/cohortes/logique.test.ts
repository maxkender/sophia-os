import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { RecrueCohorte } from "./api";
import {
  barre,
  caseEtape,
  cohorteDeLOffre,
  cohorteLundiDe,
  cohorteParDefaut,
  cohortesParDefaut,
  entonnoir,
  estRouge,
  FILTRES_VIDES,
  filtrer,
  morceauBarre,
  phaseCohorte,
  pretLundi,
  pretLundiFige,
  quatreDernieres,
  samediRecrue,
  tableauHm,
  trierRecrues,
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
    contrat_id: "44707021",
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

describe("la règle de cohorte (prompt 21, A1 : dimanche → samedi, lundi qui suit)", () => {
  it("acceptée au plus tard le samedi : le lundi qui suit", () => {
    expect(cohorteLundiDe("2026-10-26")).toBe("2026-11-02"); // lun. 26 oct.
    expect(cohorteLundiDe("2026-10-30")).toBe("2026-11-02"); // ven. 30 oct. (avant : 9 nov.)
    expect(cohorteLundiDe("2026-10-31")).toBe("2026-11-02"); // sam. 31 oct.
    expect(cohorteLundiDe("2026-11-01")).toBe("2026-11-09"); // dim. 1er nov.
  });

  it("l'heure de Paris compte (sans pays) : samedi 23 h 30 à Paris, c'est encore samedi", () => {
    expect(cohorteDeLOffre(new Date("2026-10-31T22:30:00Z"))).toBe("2026-11-02");
    expect(cohorteDeLOffre(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-09");
  });

  it("le jour limite est un réglage (jeudi = 4, l'ancienne règle)", () => {
    expect(cohorteLundiDe("2026-10-29", 4)).toBe("2026-11-02");
    expect(cohorteLundiDe("2026-10-30", 4)).toBe("2026-11-09");
  });

  it("la même règle que la base (0391, cohorte_lundi_de ; samedi par défaut depuis 0413)", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/0391_relances.sql"), "utf8");
    expect(sql).toMatch(/p_jour \+ \(7 - coalesce\(.*cohorte_jour_limite.*, 4\)\)/);
    expect(sql).toContain("(d + (8 - extract(isodow from d)::int))::date");
    const sql0413 = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/0413_cohorte_samedi.sql"), "utf8");
    expect(sql0413).toMatch(/p_jour \+ \(7 - coalesce\(.*cohorte_jour_limite.*, 6\)\)/);
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
  it("page Cohorts : une seule cohorte par défaut, celle « getting ready »", () => {
    expect(cohorteParDefaut(["2026-11-09", "2026-11-02", "2026-10-26"], "2026-10-28")).toBe("2026-11-02");
    expect(cohorteParDefaut(["2026-10-26", "2026-10-19"], "2026-10-28")).toBe("2026-10-26");
    expect(cohorteParDefaut([], "2026-10-28")).toBeNull();
  });

  it("accueil HM : celle en préparation et celle en semaine 1", () => {
    const lundis = ["2026-11-09", "2026-11-02", "2026-10-26", "2026-10-19"];
    expect(cohortesParDefaut(lundis, "2026-10-28")).toEqual(["2026-11-02", "2026-10-26"]);
    expect(phaseCohorte("2026-11-02", "2026-10-28")).toEqual({ prepa: true });
    expect(phaseCohorte("2026-10-26", "2026-10-28")).toEqual({ prepa: false, semaine: 1 });
    expect(phaseCohorte("2026-10-19", "2026-10-28")).toEqual({ prepa: false, semaine: 2 });
    expect(quatreDernieres(lundis, "2026-10-28")).toEqual(["2026-10-26", "2026-10-19"]);
  });
});

describe("les cases : une seule information chacune", () => {
  const ENVOI = { type: "acces", periode: "2026-11-02", envoye_at: "2026-10-27T11:10:00Z", canal: "upwork", resolu_at: null, erreur: null };

  it("faite : « ✓ date » ; en cours : ce qui manque + la relance ; après : —", () => {
    expect(caseEtape(recrue(PRETE), "acces")).toEqual({ etat: "fait", le: "2026-10-26T12:00:00Z" });
    // Accès pas fait : l'accès est l'étape en cours, TikTok et warm-up « — » (pas de détail du warm-up).
    const r = recrue({ nudges: [ENVOI] });
    expect(caseEtape(r, "acces")).toEqual({
      etat: "encours",
      detail: { cle: "connexion" },
      envoi: { type: "envoye", le: "2026-10-27T11:10:00Z", canal: "upwork" },
    });
    expect(caseEtape(r, "tiktok")).toEqual({ etat: "apres" });
    expect(caseEtape(r, "warmup")).toEqual({ etat: "apres" });
    // Système du 2 nov. : la relance « connexion » s'affiche dans la colonne Accès.
    expect(caseEtape(recrue({ nudges: [{ ...ENVOI, type: "connexion" }] }), "acces")).toMatchObject({
      envoi: { type: "envoye", canal: "upwork" },
    });
    // Simulation : « ✉ planned ».
    const prevue = recrue({
      premiere_connexion_at: "2026-10-26T12:00:00Z",
      prevues: [{ type: "tiktok", periode: "2026-11-02", statut: "prevu", canal: "slack", raison: "simulation" }],
    });
    expect(caseEtape(prevue, "tiktok")).toEqual({
      etat: "encours",
      detail: { cle: "tiktok", handle: "ana.tt" },
      envoi: { type: "prevu", canal: "slack" },
    });
    // Warm-up en cours : son détail (follows 2/5).
    const warmup = recrue({ ...PRETE, abonnements: 2 });
    expect(caseEtape(warmup, "warmup")).toEqual({
      etat: "encours",
      detail: { cle: "warmup", start: true, follows: 2 },
      envoi: null,
    });
  });

  it("rouge : la relance et ce qui manque, dans la même case", () => {
    const rouge = recrue({
      rouges: [{ etape: "acces", periode: "2026-11-02", rouge_at: "2026-10-28T11:10:00Z", decision: null, decision_at: null }],
      nudges: [ENVOI],
    });
    expect(caseEtape(rouge, "acces")).toEqual({
      etat: "rouge",
      detail: { cle: "connexion" },
      envoi: { type: "envoye", le: "2026-10-27T11:10:00Z", canal: "upwork" },
      le: "2026-10-28T11:10:00Z",
    });
    expect(estRouge(rouge)).toBe(true);
  });

  it("après « Reporter », la relance déjà envoyée reste visible et la ligne n'est plus rouge", () => {
    const r = recrue({
      cohorte_lundi: "2026-11-09",
      nudges: [ENVOI],
      rouges: [{ etape: "acces", periode: "2026-11-02", rouge_at: "2026-10-28T11:10:00Z", decision: "reporter", decision_at: "x" }],
    });
    expect(estRouge(r)).toBe(false);
    expect(caseEtape(r, "acces")).toMatchObject({ etat: "encours", envoi: { type: "envoye" } });
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

  it("« Ready Monday » : — jusqu'à dimanche minuit (Paris), puis la photo, figée", () => {
    const r = recrue(PRETE); // cohorte du 2 nov.
    expect(pretLundiFige(r, new Date("2026-11-01T22:59:00Z"))).toBeNull(); // dimanche 23 h 59 à Paris
    expect(pretLundiFige(r, new Date("2026-11-01T23:00:00Z"))).toBe(true); // lundi 0 h
    // Start warmup cliqué après minuit : la photo dit « pas prêt », même si c'est fait depuis.
    const tard = recrue({ ...PRETE, warmup_started_at: "2026-11-02T08:00:00Z" });
    expect(pretLundiFige(tard, new Date("2026-11-05T12:00:00Z"))).toBe(false);
    expect(pretLundi(tard)).toBe(true);
  });

  it("prompt 21, C3 : « Ready » de la base (compte_pret) quand elle le donne", () => {
    // La base dit non (par ex. une vidéo avant le lundi) : ni prête, ni la photo de dimanche.
    expect(pretLundi(recrue({ ...PRETE, pret: false }))).toBe(false);
    expect(pretLundiFige(recrue({ ...PRETE, pret: false }), new Date("2026-11-05T12:00:00Z"))).toBe(false);
    expect(pretLundiFige(recrue({ ...PRETE, abonnements: 1, pret: true }), new Date("2026-11-05T12:00:00Z"))).toBe(true);
    // Pas lu : l'ancien calcul.
    expect(pretLundi(recrue({ ...PRETE, pret: null }))).toBe(true);
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

  it("le tri : rouges d'abord, puis du moins au plus avancé", () => {
    const rouge = recrue({
      poster_id: "rouge",
      ...PRETE,
      rouges: [{ etape: "warmup", periode: "2026-11-02", rouge_at: "x", decision: null, decision_at: null }],
    });
    const rien = recrue({ poster_id: "rien" });
    const pret = recrue({ poster_id: "pret", ...PRETE });
    const tiktok = recrue({ poster_id: "tiktok", premiere_connexion_at: "2026-10-26T12:00:00Z" });
    expect(trierRecrues([pret, tiktok, rien, rouge], "2026-10-28").map((r) => r.poster_id)).toEqual([
      "rouge",
      "rien",
      "tiktok",
      "pret",
    ]);
  });
});

describe("Where they are now, entonnoir, filtres, tableau par HM", () => {
  it("la barre compte chaque recrue une seule fois, là où elle bloque (rouge avant tout)", () => {
    const recrues = [
      recrue({ poster_id: "a" }),
      recrue({ poster_id: "b", premiere_connexion_at: "2026-10-26T12:00:00Z" }),
      recrue({ poster_id: "c", premiere_connexion_at: "2026-10-26T12:00:00Z", tiktok_existe: true }),
      recrue({ poster_id: "d", ...PRETE }),
      recrue({ poster_id: "e", rouges: [{ etape: "acces", periode: "2026-11-02", rouge_at: "x", decision: null, decision_at: null }] }),
    ];
    const n = barre(recrues);
    expect(n).toEqual({ connexion: 1, tiktok: 1, warmup: 1, prets: 1, rouges: 1 });
    expect(Object.values(n).reduce((x, y) => x + y, 0)).toBe(recrues.length);
    expect(morceauBarre(recrues[4]!)).toBe("rouges");
  });

  it("entonnoir séquentiel ; un Double n'est pas une recrue : 2 comptes, 1 recrue", () => {
    const r = recrue({
      ...PRETE,
      semaine1: [
        { compte_id: "c1", handle: "ana.tt", is_active: true, prevus: 14, publies: 12, publies_lun_mar: 4 },
        { compte_id: "c2", handle: "ana.double", is_active: true, prevus: 2, publies: 2, publies_lun_mar: 0 },
      ],
    });
    // A posté sans avoir fait l'accès : compte seulement dans « offre ».
    const sansAcces = recrue({
      poster_id: "z",
      semaine1: [{ compte_id: "c9", handle: "z", is_active: true, prevus: 14, publies: 3, publies_lun_mar: 1 }],
    });
    expect(entonnoir([r, sansAcces], "2026-11-09", new Date("2026-11-09T12:00:00Z"))).toEqual({
      offre: 2,
      acces: 1,
      tiktok: 1,
      warmup: 1,
      pret: 1,
      aPoste: 1,
      garde: 1,
    });
  });

  it("filtres : un morceau de la barre, contrats non reliés, HM, pays", () => {
    const rouge = recrue({
      poster_id: "a",
      contrat_id: null,
      rouges: [{ etape: "tiktok", periode: "2026-11-02", rouge_at: "x", decision: null, decision_at: null }],
    });
    const autre = recrue({ poster_id: "b", hm_id: "hm-rana", pays: "AU" });
    const ids = (f: Partial<typeof FILTRES_VIDES>) => filtrer([rouge, autre], { ...FILTRES_VIDES, ...f }).map((r) => r.poster_id);
    expect(ids({ morceau: "rouges" })).toEqual(["a"]);
    expect(ids({ sansContrat: true })).toEqual(["a"]);
    expect(ids({ hm: "hm-rana" })).toEqual(["b"]);
    expect(ids({ pays: "BR" })).toEqual(["a"]);
  });

  it("par HM : % prêtes lundi (photo), % gardées samedi sur les cohortes dont le samedi est passé", () => {
    const lignes = tableauHm(
      [
        recrue({ ...PRETE, poster_id: "a" }),
        recrue({ poster_id: "b", is_active: false }),
        recrue({ ...PRETE, poster_id: "c", cohorte_lundi: "2026-11-09" }),
        recrue({ poster_id: "d", hm_id: "hm-rana", hm_prenom: "Rana", cohorte_lundi: "2026-11-09" }),
      ],
      "2026-11-12",
      new Date("2026-11-12T12:00:00Z"),
    );
    expect(lignes).toEqual([
      { hm_id: "hm-lucia", hm_prenom: "Lucia", recrues: 3, pretes: 67, gardees: 50 },
      { hm_id: "hm-rana", hm_prenom: "Rana", recrues: 1, pretes: 0, gardees: null },
    ]);
  });
});
