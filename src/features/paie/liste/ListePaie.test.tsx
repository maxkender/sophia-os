import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { LigneListePaie } from "./api";

const api = vi.hoisted(() => ({
  lireListePaie: vi.fn(),
  corrigerPaie: vi.fn(),
  exclurePaie: vi.fn(),
  lireJalonsPaie: vi.fn(async () => new Map()),
  relireJalonsUpwork: vi.fn(),
}));
vi.mock("./api", () => api);
const apiUpwork = vi.hoisted(() => ({
  lireEtatPaiementsApi: vi.fn(async () => new Map()),
  apercuPaiement: vi.fn(),
  payer: vi.fn(),
  libererPaiementApi: vi.fn(),
  lireEtatPaieAuto: vi.fn(async () => null),
  lireReglagesPaiementApi: vi.fn(async () => ({ mode: "off" })),
  lancerPaieAuto: vi.fn(async () => ({})),
  lireDerniereSimulation: vi.fn(async () => null),
  simulerPaie: vi.fn(),
}));
vi.mock("@/features/paie/api-upwork/api", () => apiUpwork);
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: "admin" }) }));
vi.mock("./contratsATerminer", () => ({ lireContratsATerminer: vi.fn(async () => []), marquerContratTermine: vi.fn() }));
const bonus = vi.hoisted(() => ({ lireBonus: vi.fn(), lireReglagesBonus: vi.fn(), marquerBonusPaye: vi.fn() }));
vi.mock("@/features/bonus/api", () => bonus);
vi.mock("@/features/paie/api", () => ({
  marquerPayee: vi.fn(),
  marquerSemaineSuivante: vi.fn(),
  enregistrerContrat: vi.fn(),
  lireSemaineSuivante: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ in: async () => ({ data: [{ id: "cm1", prenom: "Daywson", nom: "F", profile_id: "cm1", langue: "pt-BR" }], error: null }) }) }),
  },
}));

import { ListePaie } from "./ListePaie";

function ligne(o: Partial<LigneListePaie>): LigneListePaie {
  return {
    id: "l",
    poster_id: "p",
    poster_nom: "Ana",
    hm_id: "hm",
    hm_prenom: "Margherita",
    equipe: "Zone – Greece",
    contrat_url: "https://www.upwork.com/c/1",
    nb_comptes: 1,
    comptes_payes: 1,
    prevus: 14,
    faits: 14,
    tarif: 10,
    retenue: 0,
    montant_calcule: 10,
    montant: 10,
    montant_corrige: null,
    raison_correction: null,
    statut: "ok",
    raison: null,
    action: "payer",
    detail_comptes: [{ compte_id: "c", handle: "ana", attendus: 14, faits: 14, rates: 0, retenue: 0, montant: 10, warmup: false }],
    exclu: false,
    exclu_raison: null,
    paye_at: null,
    semaine_suivante_faite_at: null,
    premiere_semaine: false,
    bonus: 0,
    suivante_action: "financer",
    suivante_comptes: 1,
    suivante_montant: 10,
    suivante_raison: null,
    upwork_compte: null,
    ...o,
  };
}

function rendu(semaine: string, simulation = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ListePaie semaine={semaine} simulation={simulation} />
    </QueryClientProvider>,
  );
}

describe("ListePaie", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    vi.clearAllMocks();
    bonus.lireReglagesBonus.mockResolvedValue({
      parrainage_montant: 0,
      parrainage_semaines_min: 2,
      parrainage_posts_min_semaine: 12,
      comment_master_par_commentaire: 0.5,
      premier_lundi: "2026-11-30",
    });
    bonus.lireBonus.mockResolvedValue([
      {
        id: "b1", poster_id: "cm1", hm_id: null, type: "comment_master", referral_id: null, recrue_id: null,
        lundi_bonus: "2026-11-30", periode_debut: "2026-11-02", periode_fin: "2026-11-29", detail: "37 commentaires",
        quantite: 37, verifies: 30, montant: 18.5, statut: "a_payer", contrat_url: null, paye_at: null, paye_par: null,
      },
    ]);
    api.lireListePaie.mockResolvedValue([
      ligne({ id: "1", poster_nom: "Ana", montant: 10 }),
      ligne({ id: "2", poster_nom: "Bruno", action: "payer_moins", retenue: 5, montant: 5, montant_calcule: 5 }),
      ligne({ id: "3", poster_nom: "Carla", equipe: "Zone – DACH & Nordics", action: "kill", montant: 14 }),
      ligne({ id: "4", poster_nom: "Dimi", exclu: true, exclu_raison: "payé à part", montant: 7 }),
    ]);
  });

  it("un bloc par équipe avec son total ; le total général ne compte pas les lignes retirées", async () => {
    rendu("2026-10-19");
    await screen.findByText("Ana");
    expect(screen.getByText(/Total 29 \$ · reste à payer 29 \$ · 0\/3 payés/)).toBeTruthy();
    const grece = document.querySelector('[data-equipe="Zone – Greece"]')!;
    expect(within(grece as HTMLElement).getByText(/15 \$ · reste 15 \$/)).toBeTruthy();
    expect(within(grece as HTMLElement).getByText("Payer moins 5 $")).toBeTruthy();
    // « À faire » par défaut : la ligne retirée est cachée, « Tout » la montre.
    expect(within(grece as HTMLElement).queryByText(/Retiré de la liste : payé à part/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tout (4)" }));
    expect(within(grece as HTMLElement).getByText(/Retiré de la liste : payé à part/)).toBeTruthy();
    expect(document.querySelector('[data-equipe="Zone – DACH & Nordics"]')!.textContent).toContain("Kill");
  });

  it("28 oct., F1 : la consigne prend le nom de la milestone lue chez Upwork, avec la note si elle diffère", async () => {
    api.lireListePaie.mockResolvedValue([
      ligne({ id: "1", poster_id: "p1", poster_nom: "Ana", montant: 10, suivante_montant: 10 }),
      ligne({ id: "2", poster_id: "p2", poster_nom: "Bruno", montant: 12, suivante_montant: 12 }),
    ]);
    api.lireJalonsPaie.mockResolvedValue(
      new Map([
        ["p1", { jalon_id: "m1", nom: "Week 42", montant: 10, etat: "Active", nb_finances: 1, erreur: null, lu_at: "2026-10-28T16:00:00Z" }],
      ]),
    );
    rendu("2026-10-19"); // Week 43
    const ana = (await screen.findByText("Ana")).closest("tr") as HTMLElement;
    expect(await within(ana).findByText("Approve Week 42: $10 · Fund Week 44: $10")).toBeTruthy();
    expect(within(ana).getByText("name ≠ week posted (postponed)")).toBeTruthy();
    const bruno = screen.getByText("Bruno").closest("tr") as HTMLElement;
    expect(within(bruno).getByText("Approve Week 43: $12 · Fund Week 44: $12")).toBeTruthy();
    expect(bruno.querySelector("[data-note-jalon]")).toBeNull();
    expect(api.lireJalonsPaie).toHaveBeenCalledWith(["p1", "p2"]);
  });

  it("prompt 14, point 3 : Pay → aperçu relu chez Upwork → Confirm ; état « à vérifier » et Libérer", async () => {
    api.lireListePaie.mockResolvedValue([
      ligne({ id: "1", poster_id: "p1", poster_nom: "Ana", montant: 14, suivante_montant: 14 }),
      ligne({ id: "2", poster_id: "p2", poster_nom: "Bruno", montant: 12 }),
    ]);
    apiUpwork.lireEtatPaiementsApi.mockResolvedValue(
      new Map([
        ["2", {
          id: "pa2", paie_semaine_id: "2", poster_id: "p2", statut: "a_verifier", jalon_approuve: "m9", montant_approuve: 12,
          jalon_finance: null, montant_finance: null, financement: "erreur", erreur: "payée ; financement de Week 44 : HTTP 500",
          par_nom: "Lucia", created_at: "2026-11-09T09:00:00Z", updated_at: "2026-11-09T09:00:00Z",
        }],
      ]),
    );
    const plan = {
      id: "1", poster_id: "p1", poster_nom: "Ana", action: "payer", contrat_id: "c1", statut: "pret" as const, raison: null,
      approuver: { jalon_id: "m1", nom: "Week 43", montant: 14, depot: 14, sous_paiement: null },
      financer: { mode: "existant" as const, jalon_id: "m2", nom: "Week 44", montant: 14, editer: false },
      lien: null, total: 28, montant_trouve: null, bloque: null,
    };
    apiUpwork.apercuPaiement.mockResolvedValue({ mode: "on", plafond_ligne: 30, plafond_jour: 5000, lignes: [plan], total: 28 });
    apiUpwork.payer.mockResolvedValue([{ ...plan, resultat: "paye" }]);
    rendu("2026-10-19");
    const ana = (await screen.findByText("Ana")).closest("tr") as HTMLElement;
    // Bruno : déjà passé par l'API, en erreur → « À vérifier », la raison, et « Libérer » pour l'admin.
    const bruno = screen.getByText("Bruno").closest("tr") as HTMLElement;
    expect(await within(bruno).findByText("À vérifier")).toBeTruthy();
    expect(within(bruno).getByText(/financement de Week 44 : HTTP 500/)).toBeTruthy();
    expect(within(bruno).getByRole("button", { name: "Libérer" })).toBeTruthy();
    expect(within(bruno).queryByRole("button", { name: "Payer" })).toBeNull();

    fireEvent.click(within(ana).getByRole("button", { name: "Payer" }));
    const dialog = await screen.findByTestId("dialog-paiement");
    expect(apiUpwork.apercuPaiement).toHaveBeenCalledWith("2026-10-19", ["1"]);
    expect(await within(dialog).findByText("Approuver Week 43 : 14 $")).toBeTruthy();
    expect(within(dialog).getByText("Financer Week 44 (existante) : 14 $")).toBeTruthy();
    fireEvent.click(within(dialog).getByTestId("paiement-confirmer"));
    expect(await within(dialog).findByTestId("paiement-bilan")).toBeTruthy();
    expect(apiUpwork.payer).toHaveBeenCalledWith("2026-10-19", ["1"]);
    expect(within(dialog).getByTestId("paiement-bilan").textContent).toBe("1 payée(s), 0 à vérifier.");
  });

  it("le bloc Comment Masters n'apparaît pas un lundi ordinaire", async () => {
    rendu("2026-10-19");
    await screen.findByText("Ana");
    expect(screen.queryByTestId("paie-bloc-cm")).toBeNull();
  });

  it("le lundi bonus (30 nov.) : le bloc Comment Masters, action Bonus, Done validés", async () => {
    rendu("2026-11-23");
    const bloc = await screen.findByTestId("paie-bloc-cm");
    expect(bonus.lireBonus).toHaveBeenCalledWith("2026-11-30");
    expect(await within(bloc).findByText("Daywson F")).toBeTruthy();
    expect(within(bloc).getByText("Bonus")).toBeTruthy();
    expect(within(bloc).getByText("30 vérifiés TikTok")).toBeTruthy();
  });

  it("modifier le montant demande une raison", async () => {
    api.corrigerPaie.mockResolvedValue(undefined);
    rendu("2026-10-19");
    await screen.findByText("Ana");
    fireEvent.click(screen.getByRole("button", { name: "Modifier la ligne de Ana" }));
    const dialogue = await screen.findByRole("dialog");
    const bouton = within(dialogue).getByRole("button", { name: "Modifier le montant" });
    expect(bouton).toHaveProperty("disabled", true);
    fireEvent.change(within(dialogue).getByLabelText("Raison (obligatoire)"), { target: { value: "bonus" } });
    fireEvent.change(within(dialogue).getByLabelText("Nouveau montant ($)"), { target: { value: "12" } });
    fireEvent.click(bouton);
    await vi.waitFor(() => expect(api.corrigerPaie).toHaveBeenCalledWith("1", 12, "bonus"));
  });

  it("simulation : lit le calcul v3 sans rien enregistrer ; ni case ni menu ; bandeau", async () => {
    rendu("2026-10-26", true);
    await screen.findByText("Ana");
    expect(api.lireListePaie).toHaveBeenCalledWith("2026-10-26", true);
    expect(screen.getByTestId("paie-simulation")).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Modifier la ligne de Ana" })).toBeNull();
  });

  describe("prompt 15, point 5", () => {
    it("la consigne exacte par ligne ; Kill sans case « Semaine suivante faite »", async () => {
      rendu("2026-10-26");
      await screen.findByText("Ana");
      const consignes = [...document.querySelectorAll("[data-consigne]")].map((e) => e.textContent);
      expect(consignes).toContain("Approve Week 44: $10 · Fund Week 45: $10");
      expect(consignes).toContain("Approve Week 44: $14 · Don't fund · End the contract");
      const carla = document.querySelector('[data-paie="Carla"]') as HTMLElement;
      expect(within(carla).getByRole("checkbox", { name: "Payé" })).toBeTruthy();
      expect(within(carla).queryByRole("checkbox", { name: "Semaine suivante faite" })).toBeNull();
    });

    it("« À faire » cache « Nothing to pay » et les lignes terminées", async () => {
      api.lireListePaie.mockResolvedValue([
        ligne({ id: "1", poster_nom: "Ana" }),
        ligne({ id: "2", poster_nom: "Bruno", action: "rien", faits: 0, montant: 0 }),
        ligne({ id: "3", poster_nom: "Carla", paye_at: "x", semaine_suivante_faite_at: "x" }),
      ]);
      rendu("2026-10-26");
      await screen.findByText("Ana");
      expect(screen.queryByText("Bruno")).toBeNull();
      expect(screen.queryByText("Carla")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Tout (3)" }));
      expect(screen.getByText("Bruno")).toBeTruthy();
      expect(screen.getByText("Carla")).toBeTruthy();
    });

    it("tarif manquant : « À vérifier », pas de montant ni de case", async () => {
      api.lireListePaie.mockResolvedValue([ligne({ id: "1", poster_nom: "Ana", tarif: null, montant: 0, suivante_montant: null })]);
      rendu("2026-10-26");
      const ana = (await screen.findByText("Ana")).closest("tr") as HTMLElement;
      expect(within(ana).getByText("À vérifier")).toBeTruthy();
      expect(within(ana).getByText(/Tarif à renseigner/)).toBeTruthy();
      expect(within(ana).queryAllByRole("checkbox")).toHaveLength(0);
      expect(within(ana).queryByText(/0 \$/)).toBeNull();
    });

    it("contrat manquant : une icône sur la ligne, le champ dans « Contrats à compléter »", async () => {
      api.lireListePaie.mockResolvedValue([ligne({ id: "1", poster_nom: "Ana", contrat_url: null })]);
      rendu("2026-10-26");
      const ana = (await screen.findAllByText("Ana"))[0]!;
      expect(document.querySelector("[data-contrat-manquant]")).toBeTruthy();
      const bloc = screen.getByTestId("paie-contrats-a-completer");
      expect(within(bloc).getByText("Contrats à compléter (1)")).toBeTruthy();
      expect(within(bloc).getByLabelText("Coller le lien du contrat Upwork")).toBeTruthy();
      expect(ana).toBeTruthy();
    });

    it("1re semaine : le bonus est signalé ; Double renommé « Payer + financer ×2 »", async () => {
      api.lireListePaie.mockResolvedValue([
        ligne({ id: "1", poster_nom: "Ana", premiere_semaine: true, bonus: 1, montant: 11 }),
        ligne({ id: "2", poster_nom: "Bruno", action: "modifier", suivante_action: "financer_double", suivante_comptes: 2, suivante_montant: 20 }),
      ]);
      rendu("2026-10-26");
      await screen.findByText("Ana");
      expect(screen.getByText("1re semaine de posts : +1 $ inclus")).toBeTruthy();
      expect(screen.getByText("Approve Week 44: $11 · Fund Week 45: $10")).toBeTruthy();
      expect(screen.getByText("Payer + financer ×2")).toBeTruthy();
      expect(screen.getByText("Approve Week 44: $10 · Fund Week 45 (2 acc): $20")).toBeTruthy();
    });
  });
});
