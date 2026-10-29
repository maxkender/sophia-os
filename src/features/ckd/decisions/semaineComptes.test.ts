import { describe, expect, it } from "vitest";

import {
  aManque,
  attendusJusquIci,
  choixJeudiInitial,
  choixSamediInitial,
  manqueRecrue,
  planSamedi,
  type CompteSemaine,
  FILTRES_VIDES,
  filtrerComptes,
  optionsFiltres,
  trierComptes,
} from "./semaineComptes";

export const compte = (o: Partial<CompteSemaine>): CompteSemaine => ({
  compte_id: "c1", handle: "ana.books1", poster_id: "p1", poster_nom: "Ana Silva", prenom: "Ana", hm_id: "h1", hm_nom: "Lucia",
  pays: "ES", cohorte_lundi: "2026-10-19", premier_post: "2026-10-19",
  jours: [
    { jour: "2026-10-26", prevus: 2, lien: 2 },
    { jour: "2026-10-27", prevus: 2, lien: 2 },
    { jour: "2026-10-28", prevus: 2, lien: 2 },
    { jour: "2026-10-29", prevus: 2, lien: 0 },
  ],
  prevus_passes: 6, lien_passes: 6, lien_aujourdhui: 0, lien_total: 6, prevus_semaine: 14,
  vues: [], shadowban: null, liens_introuvables: 0, canal: "slack", nudge_envoye_at: null, nudge_en_file: false,
  ckd_jeudi_id: null, ckd_jeudi_action: null, ckd_jeudi_decision: null,
  ckd_samedi_id: null, ckd_samedi_action: null, ckd_samedi_regle: null, ckd_samedi_decision: null, ckd_samedi_donnees: null,
  recreer: null, autres_comptes: 0, ...o,
});

describe("le jeudi (prompt 25, partie 3)", () => {
  it("Nudge pré-coché dès qu'un post avec lien manque depuis lundi (jours passés) ; aujourd'hui ne compte pas encore", () => {
    expect(choixJeudiInitial(compte({}))).toBe("rien");
    expect(choixJeudiInitial(compte({ lien_passes: 5, lien_total: 5 }))).toBe("nudge");
    // Déjà nudgé cette semaine (ou en file) : rien.
    expect(choixJeudiInitial(compte({ lien_passes: 5, nudge_envoye_at: "2026-10-29T15:00:00Z" }))).toBe("rien");
    expect(choixJeudiInitial(compte({ lien_passes: 5, nudge_en_file: true }))).toBe("rien");
    expect(aManque({ prevus_passes: 6, lien_passes: 6 })).toBe(false);
  });

  it("Recreate pré-coché pour un shadowban supposé ou un compte mort, seulement si un chemin existe", () => {
    expect(choixJeudiInitial(compte({ shadowban: "shadowban", recreer: "shadowban" }))).toBe("recreate");
    expect(choixJeudiInitial(compte({ shadowban: "vues_basses", recreer: "shadowban", lien_passes: 2 }))).toBe("recreate");
    expect(choixJeudiInitial(compte({ ckd_jeudi_action: "recreer", recreer: "ckd" }))).toBe("recreate");
    // Pas de chemin de Recreate : le Nudge si un post manque.
    expect(choixJeudiInitial(compte({ shadowban: "shadowban", recreer: null, lien_passes: 4 }))).toBe("nudge");
  });

  it("attendus jusqu'ici : les jours passés, plus ce qui est déjà posté aujourd'hui", () => {
    expect(attendusJusquIci({ prevus_passes: 6, lien_aujourdhui: 1 })).toBe(7);
  });

  it("filtres : HM, pays, posts, shadowban, nom ; tri par posts", () => {
    const a = compte({ compte_id: "a", handle: "a1", lien_total: 0, lien_passes: 0, hm_id: "h1", pays: "ES" });
    const b = compte({ compte_id: "b", handle: "b1", poster_nom: "Bo Li", lien_total: 3, lien_passes: 3, hm_id: null, hm_nom: null, pays: "FR", shadowban: "shadowban" });
    const c = compte({ compte_id: "c", handle: "c1", lien_total: 8, hm_id: "h2", hm_nom: "Ines", pays: "ES" });
    const l = [a, b, c];
    expect(filtrerComptes(l, { ...FILTRES_VIDES, hm: "aucune" }).map((x) => x.compte_id)).toEqual(["b"]);
    expect(filtrerComptes(l, { ...FILTRES_VIDES, pays: "ES" }).map((x) => x.compte_id)).toEqual(["a", "c"]);
    expect(filtrerComptes(l, { ...FILTRES_VIDES, posts: "0" }).map((x) => x.compte_id)).toEqual(["a"]);
    expect(filtrerComptes(l, { ...FILTRES_VIDES, posts: "max4" }).map((x) => x.compte_id)).toEqual(["a", "b"]);
    expect(filtrerComptes(l, { ...FILTRES_VIDES, posts: "manque" }).map((x) => x.compte_id)).toEqual(["a", "b"]);
    expect(filtrerComptes(l, { ...FILTRES_VIDES, shadowban: "oui" }).map((x) => x.compte_id)).toEqual(["b"]);
    expect(filtrerComptes(l, { ...FILTRES_VIDES, nom: "bo" }).map((x) => x.compte_id)).toEqual(["b"]);
    expect(trierComptes(l, "posts_desc").map((x) => x.compte_id)).toEqual(["c", "b", "a"]);
    expect(trierComptes(l, "posts_asc").map((x) => x.compte_id)).toEqual(["a", "b", "c"]);
    expect(optionsFiltres(l)).toEqual({ hms: [["aucune", "—"], ["h2", "Ines"], ["h1", "Lucia"]], pays: ["ES", "FR"] });
  });
});

describe("le samedi (prompt 25, partie 4)", () => {
  it("pré-rempli avec la proposition de l'OS ; une décision déjà prise reste", () => {
    expect(choixSamediInitial(compte({}))).toBe("keep");
    expect(choixSamediInitial(compte({ ckd_samedi_id: "s1", ckd_samedi_action: "ne_pas_renouveler", ckd_samedi_regle: "absent" }))).toBe("kill");
    expect(choixSamediInitial(compte({ ckd_samedi_id: "s1", ckd_samedi_action: "doubler", ckd_samedi_regle: "doubler" }))).toBe("double");
    expect(choixSamediInitial(compte({ ckd_samedi_id: "s1", ckd_samedi_action: "ne_pas_renouveler", ckd_samedi_decision: "garder" }))).toBe("keep");
  });

  it("Validate : décider la proposition, la refuser, ou en créer une à la main", () => {
    const kill = compte({ ckd_samedi_id: "s1", ckd_samedi_action: "ne_pas_renouveler", ckd_samedi_regle: "absent" });
    const dbl = compte({ ckd_samedi_id: "s2", ckd_samedi_action: "doubler", ckd_samedi_regle: "doubler" });
    const rien = compte({});
    expect(planSamedi(kill, "kill")).toEqual([{ op: "decider", id: "s1", decision: "ne_pas_renouveler" }]);
    expect(planSamedi(kill, "keep")).toEqual([{ op: "decider", id: "s1", decision: "garder" }]);
    expect(planSamedi(kill, "double")).toEqual([{ op: "decider", id: "s1", decision: "garder" }, { op: "choisir", action: "doubler" }]);
    expect(planSamedi(dbl, "double")).toEqual([{ op: "decider", id: "s2", decision: "doubler" }]);
    expect(planSamedi(dbl, "keep")).toEqual([{ op: "decider", id: "s2", decision: "pas_maintenant" }]);
    expect(planSamedi(dbl, "kill")).toEqual([{ op: "decider", id: "s2", decision: "pas_maintenant" }, { op: "choisir", action: "ne_pas_renouveler" }]);
    expect(planSamedi(rien, "keep")).toEqual([]);
    expect(planSamedi(rien, "kill")).toEqual([{ op: "choisir", action: "ne_pas_renouveler" }]);
    expect(planSamedi({ ...kill, ckd_samedi_decision: "ne_pas_renouveler" }, "keep")).toEqual([]);
  });

  it("ce qui manque à une recrue", () => {
    const r = { connecte: true, tiktok_trouve: true, start_warmup: true, abonnements: 2 };
    expect(manqueRecrue({ ...r, connecte: false })).toBe("connexion");
    expect(manqueRecrue({ ...r, start_warmup: false, tiktok_trouve: false })).toBe("tiktok");
    expect(manqueRecrue({ ...r, start_warmup: false })).toBe("warmup");
    expect(manqueRecrue({ ...r, tiktok_trouve: false })).toBe("tiktok");
    expect(manqueRecrue(r)).toBe("follows");
  });
});
