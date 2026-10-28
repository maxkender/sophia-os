import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({ lireEtatUpwork: vi.fn(), lienConnexionUpwork: vi.fn(), diagnosticUpwork: vi.fn() }));
vi.mock("./api", () => api);

import { CarteUpwork } from "./CarteUpwork";

function rendu(url = "/admin/reglages") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <CarteUpwork />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CarteUpwork", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
  });

  it("pas encore connecté : bouton Connecter, qui ouvre Upwork", async () => {
    api.lireEtatUpwork.mockResolvedValue([]);
    api.lienConnexionUpwork.mockResolvedValue("https://www.upwork.com/ab/account-security/oauth2/authorize?x=1");
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, writable: true });
    rendu();
    expect(await screen.findByText("Pas connecté")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Connecter Upwork/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://www.upwork.com/ab/account-security/oauth2/authorize?x=1"));
  });

  it("connecté : organisations, schéma, appels, Reconnecter et Relire les droits", async () => {
    api.lireEtatUpwork.mockResolvedValue([
      {
        compte: "principal", statut: "connecte", connecte_at: "2026-10-28T09:00:00Z", connecte_par_nom: "Max K",
        utilisateur: null, organisations: [{ title: "Vik Studios", organizationId: "1" }, { title: "Micabo", organizationId: "2" }],
        droits: { schema_lu: true, requetes: ["a", "b"], mutations: ["c"], scope_jeton: null },
        access_expire_at: null, refresh_at: null, dernier_appel_at: "2026-10-28T09:01:00Z", derniere_erreur: null,
        appels_24h: 3, erreurs_24h: 0,
      },
    ]);
    rendu("/admin/reglages?upwork=ok");
    expect(await screen.findByText("Connecté")).toBeInTheDocument();
    expect(screen.getByText("Vik Studios · Micabo")).toBeInTheDocument();
    expect(screen.getByText("lu : 2 requêtes, 1 mutations")).toBeInTheDocument();
    expect(screen.getByText(/Upwork est connecté/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reconnecter/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Relire les droits/ }));
    await waitFor(() => expect(api.diagnosticUpwork).toHaveBeenCalled());
  });

  it("retour en erreur : la raison s'affiche", async () => {
    api.lireEtatUpwork.mockResolvedValue([]);
    rendu("/admin/reglages?upwork=erreur&raison=Code%20expired");
    expect(await screen.findByText("La connexion à Upwork a échoué : Code expired")).toBeInTheDocument();
  });
});
