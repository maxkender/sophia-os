import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { CompteSemaine } from "./api";

const api = vi.hoisted(() => ({ lireSemaineProchaine: vi.fn() }));
vi.mock("./api", () => api);
vi.mock("@/features/paie/api", () => ({
  nomsHms: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, `${id} Nom`]))),
}));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: "hiring_manager", user: { id: "u" } }) }));
vi.mock("@/features/moteur/cohortes", async (orig) => ({
  ...(await orig<typeof import("@/features/moteur/cohortes")>()),
  // Jeudi : la cohorte de lundi 2 novembre est en warm-up.
  aujourdhuiParis: () => "2026-10-29",
}));

import { SemaineProchaine } from "./SemaineProchaine";

function compte(o: Partial<CompteSemaine>): CompteSemaine {
  return {
    compte_id: "c",
    poster_id: "p",
    hm_id: "hm-a",
    handle: "h",
    pays: "FR",
    type: "premier",
    ancien_handle: null,
    is_active: true,
    cree_le: "2026-10-29T08:00:00Z",
    warmup_lance_le: null,
    warmup_fin: null,
    reposts_le: null,
    releves: [],
    ...o,
  };
}

function rendu(hm = "") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SemaineProchaine hm={hm} />
    </QueryClientProvider>,
  );
}

describe("SemaineProchaine", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    api.lireSemaineProchaine.mockResolvedValue([
      compte({ compte_id: "neuf", poster_id: "Anna", handle: "anna.neuf" }),
      compte({
        compte_id: "retard",
        poster_id: "Bruno",
        handle: "bruno.retard",
        cree_le: "2026-10-26T08:00:00Z",
        hm_id: "hm-b",
      }),
      compte({ compte_id: "recree", poster_id: "Carla", handle: "carla.v2", type: "recree", ancien_handle: "carla.v1" }),
      compte({ compte_id: "double", poster_id: "Dimi", handle: "dimi.2", type: "double" }),
      compte({ compte_id: "archive", poster_id: "Eva", handle: "eva", is_active: false }),
    ]);
  });

  it("lit la cohorte du lundi qui vient", async () => {
    rendu();
    await screen.findByText("Anna Nom");
    expect(api.lireSemaineProchaine).toHaveBeenCalledWith("2026-11-02");
  });

  it("6 étapes par compte ; en retard en rouge, avec la phrase à envoyer, en premier", async () => {
    rendu();
    await screen.findByText("Anna Nom");
    const lignes = screen.getAllByRole("listitem").filter((l) => l.hasAttribute("data-compte"));
    expect(lignes[0]!.getAttribute("data-compte")).toBe("bruno.retard");
    const bruno = lignes[0]!;
    expect(bruno.querySelectorAll("[data-etape]")).toHaveLength(6);
    expect(bruno.querySelector('[data-etape="tiktok"]')!.getAttribute("data-statut")).toBe("en_retard");
    expect(within(bruno).getByTestId("phrase-posteur").textContent).toMatch(/^Hi Bruno! @bruno\.retard isn't created/);
    const anna = lignes.find((l) => l.getAttribute("data-compte") === "anna.neuf")!;
    expect(anna.querySelector('[data-etape="compteOs"]')!.textContent).toMatch(/Fait le/);
    expect(within(anna).queryByTestId("phrase-posteur")).toBeNull();
  });

  it("recréés et 2ᵉ comptes avec leur étiquette ; les désactivés n'y sont pas", async () => {
    rendu();
    await screen.findByText("Anna Nom");
    const carla = screen.getByText("Carla Nom").closest("li")!;
    expect(within(carla).getByText("Recréé")).toBeTruthy();
    expect(within(carla).getByText(/remplace @carla\.v1/)).toBeTruthy();
    expect(within(screen.getByText("Dimi Nom").closest("li")!).getByText("2ᵉ compte")).toBeTruthy();
    expect(screen.queryByText("Eva Nom")).toBeNull();
  });

  it("la HM choisie par l'admin ou le Head of Ops", async () => {
    rendu("hm-b");
    expect(await screen.findByText("Bruno Nom")).toBeTruthy();
    expect(screen.queryByText("Anna Nom")).toBeNull();
  });
});
