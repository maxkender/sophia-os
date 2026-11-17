import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lirePosteursRuul: vi.fn(),
  lireTableauRuul: vi.fn(),
  lireLotRuul: vi.fn(),
  preparerLotRuul: vi.fn(),
  saisirLotRuul: vi.fn(),
  payerLotRuul: vi.fn(),
  rapprocherLotRuul: vi.fn(),
  validerLigneRuul: vi.fn(),
  devisLotRuul: vi.fn(),
  creerPaiementRuul: vi.fn(),
  relirePaiementRuul: vi.fn(),
  changerStatutRuul: vi.fn(),
  lireVerifRuul: vi.fn(),
  deciderVerifRuul: vi.fn(),
  importerHistoriqueRuul: vi.fn(),
}));
vi.mock("./api", () => api);

import { descriptionLigneRuul, lignesCsvLot, lignesCsvRuul, lireExportRuul } from "./logique";
import { PaieRuul } from "./PaieRuul";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><PaieRuul /></QueryClientProvider>);
}

const posteur = (o: Record<string, unknown>) => ({
  poster_id: "p1", nom: "Ana Test", prenom_legal: "Ana", nom_legal: "Test", ruul_email: "ana@test.zz", ruul_statut: "a_ajouter",
  pays: "IT", cohorte: "2026-10-26", actif: true, ajoute_at: null, pret_at: null, premier_paiement_at: null,
  relances: 0, relance_at: null, stop_at: null, du: 14, ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.lireTableauRuul.mockResolvedValue({
    mode: "manuel", statuts: { a_ajouter: 1, invite: 1 }, semaine: "2026-11-02", lot: null, rattrapages: { nb: 2, total: 14 }, reportes: 2,
  });
  api.lirePosteursRuul.mockResolvedValue([posteur({}), posteur({ poster_id: "p2", nom: "Bo Test", ruul_statut: "invite", ajoute_at: "2026-11-09T10:00:00Z", relances: 1 })]);
  api.changerStatutRuul.mockResolvedValue({ ok: true });
  api.preparerLotRuul.mockResolvedValue({ ok: true });
  api.lireVerifRuul.mockResolvedValue([]);
  api.saisirLotRuul.mockResolvedValue({ ok: true });
});

describe("Paie Ruul", () => {
  it("à ajouter : email modifiable, « Ajouté sur Ruul » ; invités : « Marquer prêt »", async () => {
    api.lireLotRuul.mockResolvedValue({ semaine: "2026-11-02", lot: null, rapprochement: null, lignes: [], reportes: [] });
    rendu();
    const carte = await screen.findByTestId("ajouter-ruul");
    fireEvent.change(within(carte).getByLabelText("Email Ruul de Ana Test"), { target: { value: "ana.ruul@test.zz" } });
    fireEvent.click(within(carte).getByRole("button", { name: "Ajouté sur Ruul" }));
    await waitFor(() => expect(api.changerStatutRuul).toHaveBeenCalledWith("p1", "invite", "ana.ruul@test.zz"));
    fireEvent.click(within(screen.getByTestId("invites-ruul")).getByRole("button", { name: "Marquer prêt" }));
    await waitFor(() => expect(api.changerStatutRuul).toHaveBeenCalledWith("p2", "pret", undefined));
    expect(screen.getByTestId("tableau-ruul")).toHaveTextContent("14.00 $");
  });

  it("le lot : alertes, saisie de la facture, reportés", async () => {
    api.lireLotRuul.mockResolvedValue({
      semaine: "2026-11-02",
      lot: { id: "l", statut: "prepare", facture: null, total: 20, nb: 2, paye_at: null },
      rapprochement: null,
      lignes: [{
        poster_id: "p1", nom: "Ana Test", ruul_email: "ana@test.zz", pays: "IT", total: 20, alertes: ["1er paiement", "rattrapage"],
        ruul_onboarding: "READY", valide: false, a_verifier: ["rattrapage (semaine du 26/10)"],
        semaines: [
          { id: "a", semaine: "2026-10-26", montant: 10, rattrapage: true, statut: "a_payer", nb_comptes: 1, faits: 14, prevus: 14, paye_at: null, ecart: null },
          { id: "b", semaine: "2026-11-02", montant: 10, rattrapage: false, statut: "a_payer", nb_comptes: 1, faits: 14, prevus: 14, paye_at: null, ecart: null },
        ],
      }],
      reportes: [
        { poster_id: "p2", nom: "Bo Test", ruul_statut: "invite", ruul_compte: "invited", semaine: "2026-11-02", montant: 7, raison: "x" },
        { poster_id: "p3", nom: "Cy Test", ruul_statut: "invite", ruul_compte: "invited", semaine: "2026-11-02", montant: 0, raison: "0 post" },
      ],
      totaux: { payable: 20, nb_payable: 1, en_attente: 7, nb_en_attente: 1, a_valider: 1, pret: 0, nb_pret: 0 },
      devis: { env: "prod", currency: "EUR", lignes: 1, net_usd: 20, payment: { total: 18.9 } },
    });
    api.validerLigneRuul.mockResolvedValue({ ok: true, lignes: 2 });
    rendu();
    const lot = await screen.findByTestId("lot-ruul");
    expect(within(lot).getByTestId("alertes-ruul")).toHaveTextContent("Ana Test : rattrapage");
    // 0705 : 2 totaux, et la liste « en attente » (Invited qui ont posté) avec le montant dû.
    expect(within(lot).getByTestId("total-payable")).toHaveTextContent("20.00 $");
    expect(within(lot).getByTestId("total-attente")).toHaveTextContent("7.00 $");
    expect(within(lot).getByTestId("totaux-ruul")).toHaveTextContent("Payable (READY) · 1 posteur(s)");
    expect(within(lot).getByTestId("total-frais")).toHaveTextContent("18.90 EUR");
    const attente = within(lot).getByTestId("reportes-ruul");
    expect(attente).toHaveTextContent("En attente : pas encore READY (7.00 $)");
    expect(attente).toHaveTextContent("Bo Test · semaine du 2/11 · 7.00 $ · x");
    // 0737 : la ligne inhabituelle attend l'OK de Max.
    const aValider = within(lot).getByTestId("a-valider-ruul");
    expect(aValider).toHaveTextContent("Ana Test · 20.00 $ · rattrapage (semaine du 26/10)");
    fireEvent.click(within(aValider).getByRole("button", { name: "OK" }));
    await waitFor(() => expect(api.validerLigneRuul).toHaveBeenCalledWith("p1", "2026-11-02", true));
    expect(within(lot).getByTestId("lignes-ruul")).toHaveTextContent("28 / 28");
    expect(attente).not.toHaveTextContent("Cy Test");
    fireEvent.change(within(lot).getByLabelText("Numéro de facture Ruul"), { target: { value: "INV-1" } });
    fireEvent.click(within(lot).getByRole("button", { name: "Saisi" }));
    await waitFor(() => expect(api.saisirLotRuul).toHaveBeenCalledWith("2026-11-02", "INV-1"));
    expect(api.payerLotRuul).not.toHaveBeenCalled();
  });

  it("0738 : créer le paiement Ruul (confirmation), puis le virement à faire", async () => {
    const base = {
      semaine: "2026-11-16", rapprochement: null, reportes: [],
      lignes: [{ poster_id: "p1", nom: "Ana Test", ruul_email: "ana@test.zz", pays: "IT", total: 14, alertes: [], ruul_onboarding: "READY", valide: true,
        semaines: [{ id: "a", semaine: "2026-11-16", montant: 14, rattrapage: false, statut: "a_payer", nb_comptes: 1, faits: 14, prevus: 14, paye_at: null, ecart: null }] }],
      totaux: { payable: 14, nb_payable: 1, en_attente: 0, nb_en_attente: 0, a_valider: 0, pret: 14, nb_pret: 1 },
    };
    api.lireLotRuul.mockResolvedValue({ ...base, lot: { id: "l", statut: "prepare", facture: null, total: 14, nb: 1, paye_at: null },
      devis: { env: "prod", currency: "EUR", lignes: 1, net_usd: 14, payment: { total: 13.5 } } });
    api.creerPaiementRuul.mockResolvedValue({ ok: true, batch: 42 });
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(true);
    rendu();
    fireEvent.click(await screen.findByTestId("creer-paiement-ruul"));
    expect(confirmer.mock.calls[0]![0]).toContain("13.50 EUR à virer frais compris");
    await waitFor(() => expect(api.creerPaiementRuul).toHaveBeenCalledWith("2026-11-16"));
    confirmer.mockRestore();
  });

  it("0738 : le paiement créé montre le virement (montant, référence, IBAN)", async () => {
    api.lireLotRuul.mockResolvedValue({
      semaine: "2026-11-16", rapprochement: null, reportes: [], lignes: [],
      lot: { id: "l", statut: "saisi", facture: "Ruul 42", total: 14, nb: 1, paye_at: null, ruul_batch_id: 42, ruul_env: "prod", ruul_statut: "AWAITING_FUNDING",
        ruul_resume: { rows: 1, byStatus: { AWAITING_FUNDING: 1 } },
        ruul_funding: { currency: "EUR", dueAmount: 13.5, reference: "REF123", accounts: [{ currency: "EUR", accountDetails: { beneficiaryName: "Ruul", iban: "XX00TEST" } }] } },
    });
    rendu();
    const p = await screen.findByTestId("paiement-ruul");
    expect(p).toHaveTextContent("Paiement Ruul n° 42 · statut AWAITING_FUNDING · 1 AWAITING_FUNDING");
    expect(within(p).getByTestId("virement-ruul")).toHaveTextContent("À virer depuis Qonto : 13.50 EUR · référence à mettre sur le virement : REF123");
    expect(within(p).getByTestId("virement-ruul")).toHaveTextContent("IBANXX00TEST");
    expect(screen.queryByTestId("creer-paiement-ruul")).toBeNull();
  });

  it("0740 : une semaine à vérifier, l'historique Ruul, « Déjà payé »", async () => {
    api.lireLotRuul.mockResolvedValue({ semaine: "2026-11-09", lot: null, rapprochement: null, lignes: [], reportes: [] });
    api.lireVerifRuul.mockResolvedValue([{
      poster_id: "p1", nom: "Ana Test", ruul_email: "ana@test.zz", ruul_onboarding: "READY", total_du: 14, a_verifier: 7, ruul_paye: 20,
      du: [{ semaine: "2026-10-26", montant: 7, faits: 10, statut: "reporte", verif: "à vérifier" },
           { semaine: "2026-11-16", montant: 7, faits: 14, statut: "a_payer", verif: null }],
      ruul: [{ tno: "123", date: "2026-11-02T10:00:00Z", montant: 20, devise: "USD", statut: "PAID", description: "x" }],
    }]);
    api.deciderVerifRuul.mockResolvedValue({ ok: true, lignes: 1 });
    rendu();
    const carte = await screen.findByTestId("verif-posteur");
    expect(carte).toHaveTextContent("Semaine du 26/10 : 7.00 $ (10 posts)");
    expect(carte).not.toHaveTextContent("16/11");
    expect(carte).toHaveTextContent("20 USD PAID (#123)");
    fireEvent.click(within(carte).getByRole("button", { name: "Déjà payé" }));
    await waitFor(() => expect(api.deciderVerifRuul).toHaveBeenCalledWith("p1", "2026-10-26", "deja_paye"));
  });

  it("CSV du lot et lecture de l'export Ruul", () => {
    expect(lignesCsvLot([{ poster_id: "p", nom: "Ana", ruul_email: "a@b.cc", pays: "IT", total: 20, alertes: [], semaines: [
      { id: "1", semaine: "2026-10-26", montant: 10, rattrapage: true, statut: "a_payer", nb_comptes: 1, faits: 1, prevus: 1, paye_at: null, ecart: null },
      { id: "2", semaine: "2026-11-02", montant: 10, rattrapage: false, statut: "a_payer", nb_comptes: 1, faits: 1, prevus: 1, paye_at: null, ecart: null },
    ] }])).toEqual([["Ana", "a@b.cc", "26/10 (rattrapage) + 2/11", "20.00"]]);
    expect(descriptionLigneRuul("2026-11-16", 14, 10)).toBe("Vik Studios — week of Nov 16 : 14 posts + 10 $ bonus");
    expect(lignesCsvRuul("2026-11-16", [
      { poster_id: "p", nom: "Ana", ruul_email: " A@B.cc ", pays: "IT", total: 14, alertes: [], ruul_onboarding: "READY", valide: true, bonus: 0,
        semaines: [{ id: "1", semaine: "2026-11-16", montant: 14, rattrapage: false, statut: "a_payer", nb_comptes: 1, faits: 1, prevus: 14, paye_at: null, ecart: null }] },
      { poster_id: "q", nom: "Bo", ruul_email: "b@b.cc", pays: "IT", total: 7, alertes: [], ruul_onboarding: "READY", valide: false, semaines: [] },
      { poster_id: "r", nom: "Cy", ruul_email: "c@b.cc", pays: "IT", total: 7, alertes: [], ruul_onboarding: "PENDING_KYC", semaines: [] },
    ])).toEqual([["a@b.cc", "Vik Studios — week of Nov 16 : 1 post", "14.00", "USD"]]);
    expect(lireExportRuul('Name;E-mail;Amount (USD)\n"Ana";a@b.cc;"$20,00"\n')).toEqual([{ email: "a@b.cc", montant: "20.00" }]);
    expect(descriptionLigneRuul("2026-11-16", 14, 10)).toBe("Vik Studios — week of Nov 16 : 14 posts + 10 $ bonus");
    expect(lignesCsvRuul("2026-11-16", [
      { poster_id: "p", nom: "Ana", ruul_email: " A@B.cc ", pays: "IT", total: 14, alertes: [], ruul_onboarding: "READY", valide: true, bonus: 0,
        semaines: [{ id: "1", semaine: "2026-11-16", montant: 14, rattrapage: false, statut: "a_payer", nb_comptes: 1, faits: 1, prevus: 14, paye_at: null, ecart: null }] },
      { poster_id: "q", nom: "Bo", ruul_email: "b@b.cc", pays: "IT", total: 7, alertes: [], ruul_onboarding: "READY", valide: false, semaines: [] },
      { poster_id: "r", nom: "Cy", ruul_email: "c@b.cc", pays: "IT", total: 7, alertes: [], ruul_onboarding: "PENDING_KYC", semaines: [] },
    ])).toEqual([["a@b.cc", "Vik Studios — week of Nov 16 : 1 post", "14.00", "USD"]]);
    expect(lireExportRuul("a,b\n1,2")).toEqual({ erreur: "colonnes email et montant introuvables" });
  });
});

describe("Étapes Ruul", () => {
  it("bloqué en rouge après 48 h sur la même étape", async () => {
    const { etapeBloquee } = await import("./logique");
    const m = new Date("2026-11-09T12:00:00Z");
    expect(etapeBloquee({ candidature: "2026-11-01T10:00:00Z", acceptee: "2026-11-02T10:00:00Z" }, m)).toBe("signee");
    expect(etapeBloquee({ candidature: "2026-11-09T10:00:00Z" }, m)).toBeNull();
    expect(etapeBloquee({}, m)).toBeNull();
  });
});
