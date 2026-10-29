import { describe, expect, it } from "vitest";

import {
  aManque,
  attendusJusquIci,
  choixJeudiInitial,
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
