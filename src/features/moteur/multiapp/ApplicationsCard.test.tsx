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
const listerLiensLabels = vi.fn();
const lireLiens1000 = vi.fn();

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
  listerLiensLabels: () => listerLiensLabels(),
  lireLiens1000: () => lireLiens1000(),
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
    listerLiensLabels.mockReset();
    listerLiensLabels.mockResolvedValue([
      { label_id: "l1", application_id: ID_SOPHIA },
      { label_id: "l2", application_id: ID_SOPHIA },
    ]);
    lireLiens1000.mockReset();
    lireLiens1000.mockResolvedValue({ sophia: "taap.it/sophia.culture", unswipe: "" });
  });

  it("un prompt encore en brouillon : pas d'activation, et elle dit lequel relire", async () => {
    sonderTiersApplication.mockResolvedValue("pret");
    lirePrompt.mockImplementation((cle: string) =>
      Promise.resolve(cle.startsWith("placement") ? "[BROUILLON À RELIRE : pitch à écrire]\n\nle prompt" : "un prompt complet"),
    );
    rendre(<ApplicationsCard />);
    const interrupteurs = await screen.findAllByRole("switch");
    fireEvent.click(interrupteurs[1]);
    expect(await screen.findByText(/still a draft — placement_unswipe/)).toBeInTheDocument();
    expect(majApplication).not.toHaveBeenCalled();
  });

  it("la ligne dépliée dit ce qui manque à l'application, dans l'ordre", async () => {
    lirePrompt.mockImplementation((cle: string) => Promise.resolve(cle.startsWith("pertinence") ? "un prompt complet" : ""));
    rendre(<ApplicationsCard />);
    // Colonne « Labels » : 2 pour Sophia, aucun pour Unswipe.
    expect(await screen.findByText("none")).toBeInTheDocument();
    fireEvent.click(await screen.findByText("Unswipe"));
    const preparation = await screen.findByTestId("preparation-unswipe");
    await waitFor(() => expect(preparation.querySelectorAll("li")).toHaveLength(7));
    const etats = [...preparation.querySelectorAll("li")].map((li) => li.getAttribute("data-etat"));
    // code, pertinence, placement, lien à 1 000, labels, langues, interrupteur
    expect(etats).toEqual(["ok", "ok", "a_faire", "a_faire", "a_faire", "ok", "a_faire"]);
    expect(preparation).toHaveTextContent("Placement prompt empty (placement_unswipe)");
    expect(preparation).toHaveTextContent("1,000-follower link missing");
    expect(preparation).toHaveTextContent("Target languages: fr.");
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
