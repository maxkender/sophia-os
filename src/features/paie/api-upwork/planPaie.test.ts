import { describe, expect, it } from "vitest";

import { csvContrats, executable, type LignePlanPaie } from "./planPaie";

const l = (o: Partial<LignePlanPaie>): LignePlanPaie => ({
  id: "1", groupe: "liberer", posteur: "A", contrat_id: "c1", jalon_id: "j1", fermer: false, jamais_fermer: false, note: null,
  statut: "a_faire", resultat: null, jalon_libere: null, montant: null, ...o,
});

describe("plan de paie (23/11)", () => {
  it("cochable seulement si le jalon relu est prêt ; jamais bloqué, fini, en cours ou en erreur", () => {
    expect(executable(l({ etat: "pret" }))).toBe(true);
    expect(executable(l({ etat: "pas_finance" }))).toBe(false);
    expect(executable(l({ etat: "pret", statut: "erreur" }))).toBe(false);
    expect(executable(l({ etat: "pret", statut: "en_cours" }))).toBe(false);
    expect(executable(l({ groupe: "bloque", statut: "bloque", etat: "bloque" }))).toBe(false);
    expect(executable(l({ statut: "libere" }))).toBe(false);
  });
  it("libéré sans fermeture confirmée : on peut recliquer pour fermer ; jamais un contrat gardé ouvert", () => {
    expect(executable(l({ groupe: "liberer_fermer", statut: "libere", fermer: true }))).toBe(true);
    expect(executable(l({ groupe: "liberer_fermer", statut: "libere", fermer: true, jamais_fermer: true }))).toBe(false);
  });
  it("kill : recliquable jusqu'à la fermeture du contrat", () => {
    expect(executable(l({ groupe: "kill", statut: "kille" }))).toBe(true);
    expect(executable(l({ groupe: "kill", statut: "kille_ferme" }))).toBe(false);
  });
  it("CSV des contrats ouverts : un jalon par ligne, guillemets échappés", () => {
    const csv = csvContrats([
      { contrat_id: "1", freelancer: 'A "B"', titre: null, cache_lu_at: null, total: 24, jalons: [{ id: "j", nom: "Week 47", etat: "Active", montant: 14 }, { id: "k", nom: "Week 48", etat: "Active", montant: 10 }] },
      { contrat_id: "2", freelancer: "C", titre: null, cache_lu_at: null, total: 0, jalons: [] },
    ]);
    const lignes = csv.split("\n");
    expect(lignes).toHaveLength(4);
    expect(lignes[1]).toContain('"A ""B"""');
  });
});
