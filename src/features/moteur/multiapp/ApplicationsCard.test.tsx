import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";

const listerApplicationsMulti = vi.fn();
const majApplication = vi.fn();
const sonderTiersApplication = vi.fn();
const lireTiersApplicationsDernierRun = vi.fn();
const lirePrompt = vi.fn();

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin-1" }, role: "admin" }),
}));
vi.mock("@/features/moteur/api", () => ({
  lirePrompt: (cle: string) => lirePrompt(cle),
}));
vi.mock("@/features/moteur/apiMultiApp", () => ({
  listerApplicationsMulti: () => listerApplicationsMulti(),
  majApplication: (id: string, patch: unknown) => majApplication(id, patch),
  sonderTiersApplication: () => sonderTiersApplication(),
  lireTiersApplicationsDernierRun: () => lireTiersApplicationsDernierRun(),
  lireEtatBackfillPertinence: () =>
    Promise.resolve({ actif: false, restants: 0, faits: 0, erreurs: 0, demarre_at: null, dernier_at: null }),
  piloterBackfillPertinence: vi.fn(),
}));

import { ApplicationsCard } from "./ApplicationsCard";

// jsdom n'a pas PointerEvent ; l'interrupteur (base-ui) en construit un au clic.
if (typeof window.PointerEvent === "undefined") {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

function rendre(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("ApplicationsCard — activation et tiers par application (0270)", () => {
  beforeEach(() => {
    listerApplicationsMulti.mockReset();
    listerApplicationsMulti.mockResolvedValue([
      { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", created_at: "1", langues: null, actif: true },
      { id: ID_UNSWIPE, slug: "unswipe", nom: "Unswipe", created_at: "2", langues: ["fr"], actif: false },
    ]);
    majApplication.mockReset();
    majApplication.mockResolvedValue(undefined);
    sonderTiersApplication.mockReset();
    lireTiersApplicationsDernierRun.mockReset();
    lireTiersApplicationsDernierRun.mockResolvedValue(null);
    lirePrompt.mockReset();
    lirePrompt.mockResolvedValue("un prompt complet");
  });

  it("0270 absente : l'activation est refusée, et elle le dit", async () => {
    sonderTiersApplication.mockResolvedValue("absent");
    rendre(<ApplicationsCard />);
    const interrupteurs = await screen.findAllByRole("switch");
    fireEvent.click(interrupteurs[1]);
    expect(await screen.findByText(/apply migration 0270/)).toBeInTheDocument();
    expect(majApplication).not.toHaveBeenCalled();
    expect(lirePrompt).not.toHaveBeenCalled();
  });

  it("sonde en panne : pas d'activation (erreur affichée)", async () => {
    sonderTiersApplication.mockRejectedValue(new Error("base injoignable"));
    rendre(<ApplicationsCard />);
    const interrupteurs = await screen.findAllByRole("switch");
    fireEvent.click(interrupteurs[1]);
    expect(await screen.findByText(/base injoignable/)).toBeInTheDocument();
    expect(majApplication).not.toHaveBeenCalled();
  });

  it("0270 en place et prompts présents : activation", async () => {
    sonderTiersApplication.mockResolvedValue("pret");
    rendre(<ApplicationsCard />);
    const interrupteurs = await screen.findAllByRole("switch");
    fireEvent.click(interrupteurs[1]);
    await waitFor(() => expect(majApplication).toHaveBeenCalledWith(ID_UNSWIPE, { actif: true }));
  });

  it("dernière requalif de l'application, en rouge sur une alerte", async () => {
    lireTiersApplicationsDernierRun.mockResolvedValue({
      jour: "2026-10-09",
      at: "2026-10-09T22:01:00Z",
      etat: "pret",
      erreur: null,
      applications: {
        unswipe: {
          at: "2026-10-09T22:01:00Z",
          examines: 3,
          requalifies: 2,
          enAttente: 1,
          sansMesure: 0,
          attendues: 4,
          complet: false,
          repli: false,
          alerte: "Lecture INCOMPLÈTE de contenu_application_a_requalifier",
          interrompu: false,
          dejaRequalifies: 0,
          erreur: null,
        },
      },
    });
    rendre(<ApplicationsCard />);
    const ligne = await screen.findByText(/Last requalif Unswipe \(2026-10-09\): 3 examined · 2 requalified/);
    expect(ligne.className).toContain("text-destructive");
  });
});
