import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));
const paie = vi.hoisted(() => ({ lireReglagesPaie: vi.fn(), enregistrerReglagesPaie: vi.fn() }));
vi.mock("./liste/api", () => paie);
const bonus = vi.hoisted(() => ({ lireReglagesBonus: vi.fn(), enregistrerReglagesBonus: vi.fn() }));
vi.mock("@/features/bonus/api", () => bonus);

import { ReglagesPaie } from "./ReglagesPaie";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReglagesPaie />
    </QueryClientProvider>,
  );
}

describe("ReglagesPaie (prompt 15, point 1 : admin seulement)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    vi.clearAllMocks();
    paie.lireReglagesPaie.mockResolvedValue({
      paie: { seuil_posts_complets: 10, retenue_par_post: 1, manques_toleres: 1 },
      parrainageActif: false,
      bonusPremiereSemaine: 1,
    });
    paie.enregistrerReglagesPaie.mockResolvedValue(undefined);
    bonus.lireReglagesBonus.mockResolvedValue({
      parrainage_montant: 0,
      parrainage_semaines_min: 2,
      parrainage_posts_min_semaine: 12,
      comment_master_par_commentaire: 0.5,
      premier_lundi: "2026-11-30",
    });
    bonus.enregistrerReglagesBonus.mockResolvedValue(undefined);
  });

  it("le Head of Ops lit les réglages sans pouvoir les modifier", async () => {
    auth.role = "head_of_ops";
    rendu();
    const seuil = await screen.findByLabelText("Posts manqués tolérés par compte et par semaine");
    expect(seuil).toBeDisabled();
    expect(screen.getByLabelText("Bonus de la 1re semaine de posts ($)")).toBeDisabled();
    expect(screen.getByText(/Lecture seule/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer", hidden: true }).closest("div")).toHaveClass("hidden");
  });

  it("l'admin modifie et enregistre, bonus de la 1re semaine compris", async () => {
    auth.role = "admin";
    rendu();
    const champ = await screen.findByLabelText("Bonus de la 1re semaine de posts ($)");
    expect(champ).toBeEnabled();
    fireEvent.change(champ, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(paie.enregistrerReglagesPaie).toHaveBeenCalledWith({ seuil_posts_complets: 10, retenue_par_post: 1, manques_toleres: 1 }, false, 2),
    );
  });
});
