import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { LigneListePaie } from "./api";

const api = vi.hoisted(() => ({ lireListePaie: vi.fn(), corrigerPaie: vi.fn(), exclurePaie: vi.fn() }));
vi.mock("./api", () => api);
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
    ...o,
  };
}

function rendu(semaine: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ListePaie semaine={semaine} />
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
    expect(within(grece as HTMLElement).getByText(/Retiré de la liste : payé à part/)).toBeTruthy();
    expect(document.querySelector('[data-equipe="Zone – DACH & Nordics"]')!.textContent).toContain("Kill");
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
});
