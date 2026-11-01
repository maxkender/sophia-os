import { describe, expect, it } from "vitest";

import type { Accueil } from "./api";
import { estARelier } from "./aRelier";

const a = (o: Partial<Accueil>): Accueil => ({
  contrat_id: "1", job_id: null, job_titre: null, prenom: "A", nom: "B", debut_at: null, statut: "a_relier", raison: null,
  pays: null, langue: null, hm_id: null, poster_id: null, email: null, cohorte_lundi: null, message_texte: null, message_at: null,
  updated_at: "2026-11-01T00:00:00Z", ...o,
});

describe("0493 : Contracts to link = recrues VIk Studios seulement", () => {
  it("une ligne classée ou d'une autre équipe n'est jamais à relier", () => {
    expect(estARelier(a({ equipe: "VIk Studios" }))).toBe(true);
    expect(estARelier(a({}))).toBe(true);
    expect(estARelier(a({ equipe: "Maximilien Kender" }))).toBe(false);
    expect(estARelier(a({ equipe: "VIk Studios", classement: "autre_activite" }))).toBe(false);
    expect(estARelier(a({ equipe: "VIk Studios", classement: "hm" }))).toBe(false);
    expect(estARelier(a({ statut: "doublon" }))).toBe(false);
  });
});
