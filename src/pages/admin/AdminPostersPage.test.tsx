import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";
import type { PosterProfil } from "@/features/moteur/types";

const listerPosters = vi.fn();
const majZoneRecruteur = vi.fn();

vi.mock("@/features/auth/AuthContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/AuthContext")>()),
  useAuth: () => ({ user: { id: "admin-1" }, role: "admin" }),
}));

vi.mock("@/features/moteur/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/moteur/api")>()),
  listerPosters: () => listerPosters(),
  listerComptesAvecDormants: async () => [],
  listerLanguesReference: async () => ["fr", "tr", "es"],
  listerApplications: async () => [],
  listerLabels: async () => [],
  labelsDesComptes: async () => new Map(),
  majZoneRecruteur: (id: string, zone: string | null) => majZoneRecruteur(id, zone),
}));

vi.mock("@/features/moteur/apiMultiApp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/moteur/apiMultiApp")>()),
  listerLiensLabels: async () => [],
}));

import { AdminPostersPage } from "./AdminPostersPage";

function profil(over: Partial<PosterProfil> & { id: string; role: PosterProfil["role"] }): PosterProfil {
  return {
    prenom: over.id,
    nom: null,
    email: `${over.id}@sophia.com`,
    langues: ["fr"],
    nationalite: null,
    upwork_url: null,
    cout_mensuel: null,
    compte_id: null,
    handle_tiktok: null,
    reference_handle: null,
    persona_nom: null,
    persona_bio: null,
    avatar_url: null,
    classement: null,
    classement_maj_at: null,
    warmup_started_at: null,
    warmup_ends_at: null,
    manager_id: null,
    manager_nom: null,
    is_active: true,
    must_change_password: false,
    hm_ugc_ai_video: false,
    comptes: [],
    ...over,
  };
}

const PROFILS = [
  profil({ id: "admin-1", role: "admin", prenom: "Max" }),
  profil({ id: "amanda", role: "directing_manager", prenom: "Amanda", zone_recrutement: "Turkey + Israel" }),
  profil({ id: "kris", role: "hiring_manager", prenom: "Kris", zone_recrutement: "Spain + Portugal" }),
  profil({ id: "remi", role: "hiring_manager", prenom: "Rémi" }),
  profil({ id: "taimoor", role: "hiring_manager", prenom: "Taimoor", is_active: false }),
  profil({ id: "beyza", role: "poster", prenom: "Beyza", manager_id: "amanda", manager_nom: "Amanda" }),
  profil({ id: "marta", role: "poster", prenom: "Marta", manager_id: "kris", manager_nom: "Kris" }),
  profil({ id: "elodie", role: "poster", prenom: "Élodie", manager_id: "remi", manager_nom: "Rémi" }),
  profil({ id: "seule", role: "poster", prenom: "Solo" }),
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminPostersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** La section d'une zone, par son titre. */
function sectionZone(titre: string): HTMLElement {
  const h2 = screen.getByRole("heading", { level: 2, name: titre });
  return h2.closest("section") as HTMLElement;
}

describe("AdminPostersPage — par zone", () => {
  beforeEach(() => {
    listerPosters.mockReset();
    listerPosters.mockResolvedValue(PROFILS);
    majZoneRecruteur.mockReset();
    majZoneRecruteur.mockResolvedValue(undefined);
  });

  it("range chaque créateur sous la zone de son recruteur", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });

    const titres = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titres.indexOf("Spain + Portugal")).toBeLessThan(titres.indexOf("Turkey + Israel"));

    expect(within(sectionZone("Turkey + Israel")).getByText("Beyza")).toBeTruthy();
    expect(within(sectionZone("Turkey + Israel")).queryByText("Marta")).toBeNull();
    expect(within(sectionZone("Spain + Portugal")).getByText("Marta")).toBeTruthy();
    // Recruteur sans zone : groupe « Sans zone », pas perdu.
    expect(within(sectionZone("No zone")).getByText("Élodie")).toBeTruthy();
    // Créateur sans recruteur : section à part.
    expect(screen.getByText("Solo")).toBeTruthy();
    // Recruteur désactivé sans créateur : replié à part.
    expect(screen.getByText(/Deactivated recruiters with no creators \(1\)/)).toBeTruthy();
  });

  it("filtre de zone par puce, et recherche sans accent", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });

    const puces = screen.getByRole("navigation", { name: "Zone" });
    fireEvent.click(within(puces).getByRole("button", { name: /Spain \+ Portugal/ }));
    expect(screen.queryByRole("heading", { level: 2, name: "Turkey + Israel" })).toBeNull();
    expect(screen.getByText("Marta")).toBeTruthy();

    fireEvent.click(within(puces).getByRole("button", { name: /Spain \+ Portugal/ }));
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "elodie" } });
    expect(screen.getByText("Élodie")).toBeTruthy();
    expect(screen.queryByText("Beyza")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "Turkey + Israel" })).toBeNull();
  });

  it("la fiche d'un recruteur enregistre sa zone", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Rémi" }));

    const champ = await screen.findByLabelText("Zone", { selector: "input" });
    fireEvent.change(champ, { target: { value: "  France  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(majZoneRecruteur).toHaveBeenCalledWith("remi", "France"));
  });
});
