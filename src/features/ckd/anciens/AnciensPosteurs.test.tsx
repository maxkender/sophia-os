import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { LigneAncien } from "./api";

const api = vi.hoisted(() => ({ lireAnciens: vi.fn() }));
vi.mock("./api", () => api);
vi.mock("@/features/paie/api", () => ({
  nomsHms: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, `${id} Nom`]))),
}));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: "hiring_manager", user: { id: "u" } }) }));
vi.mock("@/features/moteur/cohortes", async (orig) => ({
  ...(await orig<typeof import("@/features/moteur/cohortes")>()),
  aujourdhuiParis: () => "2026-10-28",
}));

import { AnciensPosteurs } from "./AnciensPosteurs";

function jour(k: number) {
  return new Date(Date.parse("2026-10-28T12:00:00Z") + k * 86_400_000).toISOString().slice(0, 10);
}
function posts(rates: number[] = []) {
  return Array.from({ length: 14 }, (_, i) => -14 + i).flatMap((k) =>
    [1, 2].map((rang) => ({
      jour: jour(k),
      rang,
      url: rates.includes(k) ? null : "u",
      vues: 800,
      publie_at: null,
      mesure: true,
    })),
  );
}
const DIAG = {
  badge: "ok" as const,
  attendus: 14,
  publies: 14,
  liens_manquants: [],
  mediane: 800,
  mediane_ref: 1000,
  morts: 0,
  seuil_mort: 50,
  shadowban: false,
  vues_basses: false,
};
function ligne(o: Partial<LigneAncien>): LigneAncien {
  return {
    compte_id: "c",
    poster_id: "p",
    hm_id: "hm-a",
    handle: "h",
    pays: "FR",
    premier_jour: "2026-09-07",
    warmup_lance: true,
    seuil_mort: 50,
    mediane_pays: 1000,
    posts: posts(),
    diagnostic: DIAG,
    ...o,
  };
}

function rendu(hm = "") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AnciensPosteurs hm={hm} />
    </QueryClientProvider>,
  );
}

describe("AnciensPosteurs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    api.lireAnciens.mockResolvedValue([
      ligne({ compte_id: "ok", poster_id: "Anna", handle: "anna" }),
      ligne({
        compte_id: "irr",
        poster_id: "Bruno",
        handle: "bruno",
        hm_id: "hm-b",
        posts: posts([-2, -4]),
        diagnostic: { ...DIAG, badge: "posts_manquants", publies: 10 },
      }),
      ligne({
        compte_id: "sb",
        poster_id: "Carla",
        handle: "carla",
        diagnostic: { ...DIAG, badge: "shadowban", shadowban: true },
      }),
    ]);
  });

  it("par défaut : seulement les problèmes, groupés du plus grave au moins grave", async () => {
    rendu();
    await screen.findByText("Bruno Nom");
    const groupes = [...document.querySelectorAll("[data-groupe]")].map((g) => g.getAttribute("data-groupe"));
    expect(groupes).toEqual(["shadowban", "irregulier"]);
    expect(screen.queryByText("Anna Nom")).toBeNull();
  });

  it("chaque ligne : 14 jours d'historique, le diagnostic en 3 lignes, l'action et les autres problèmes", async () => {
    rendu();
    const bruno = (await screen.findByText("Bruno Nom")).closest("li")!;
    expect(within(bruno).getByTestId("mini-historique").children).toHaveLength(14);
    expect(within(bruno).getAllByTestId("mini-historique")[0]!.querySelectorAll('[data-etat="rate"]')).toHaveLength(2);
    expect(within(bruno).getByTestId("diagnostic-compte")).toBeTruthy();
    expect(within(bruno).getByText(/2 posts par jour, tous les jours/)).toBeTruthy();
    expect(within(bruno).getByText("Poste moins")).toBeTruthy();
  });

  it("Tout afficher ajoute les comptes sans problème", async () => {
    rendu();
    await screen.findByText("Bruno Nom");
    fireEvent.click(screen.getByRole("button", { name: "Tout afficher" }));
    expect(screen.getByText("Anna Nom")).toBeTruthy();
    expect(document.querySelector('[data-groupe="ok"]')).toBeTruthy();
  });

  it("la HM choisie par l'admin ou le Head of Ops", async () => {
    rendu("hm-b");
    expect(await screen.findByText("Bruno Nom")).toBeTruthy();
    expect(screen.queryByText("Carla Nom")).toBeNull();
  });
});
