import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import type { PosterProfil } from "@/features/moteur/types";

import type { BonusAVenir as TBonusAVenir } from "./api";

const api = vi.hoisted(() => ({
  lireBonus: vi.fn(),
  marquerBonusPaye: vi.fn(),
  genererBonus: vi.fn(),
  lireBonusAVenir: vi.fn(),
  enregistrerReglagesBonus: vi.fn(),
  lireReglagesBonus: vi.fn(),
  lierRecrue: vi.fn(),
}));
vi.mock("./api", () => api);
vi.mock("@/features/paie/api", () => ({
  nomsHms: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, `${id} Nom`]))),
}));
vi.mock("@/features/moteur/cohortes", async (orig) => ({
  ...(await orig<typeof import("@/features/moteur/cohortes")>()),
  aujourdhuiParis: () => "2026-11-30",
}));

import { BonusAVenir } from "./BonusAVenir";
import { ChoixRecrue } from "./ChoixRecrue";

const REGLAGES = {
  parrainage_montant: 25,
  parrainage_semaines_min: 2,
  parrainage_posts_min_semaine: 12,
  comment_master_par_commentaire: 0.5,
  premier_lundi: "2026-11-30",
};


function avec(el: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
}

beforeEach(async () => {
  await i18n.changeLanguage("fr");
  vi.clearAllMocks();
  api.lireReglagesBonus.mockResolvedValue(REGLAGES);
  api.marquerBonusPaye.mockResolvedValue(undefined);
  api.lierRecrue.mockResolvedValue(undefined);
});

describe("Bonus à venir (dashboard HM)", () => {
  const b = (o: Partial<TBonusAVenir>): TBonusAVenir => ({
    poster_id: "Ana",
    hm_id: "hm-a",
    type: "parrainage",
    detail: "parrainage de Bruno, 2 semaines faites",
    quantite: 2,
    montant: 25,
    lundi_bonus: "2026-12-28",
    etat: "apercu",
    ...o,
  });

  it("qui, combien, quand ; l'estimation est signalée ; filtre HM", async () => {
    api.lireBonusAVenir.mockResolvedValue([b({}), b({ poster_id: "Zoe", hm_id: "hm-b", montant: 10 })]);
    avec(<BonusAVenir hm="hm-a" />);
    const bloc = await screen.findByTestId("bonus-a-venir");
    expect(within(bloc).getByText(/Lundi 28 décembre/)).toBeTruthy();
    expect(within(bloc).getByText(/Ana Nom · Parrainage · 25 \$/)).toBeTruthy();
    expect(within(bloc).getByText("(estimation)")).toBeTruthy();
    expect(within(bloc).queryByText(/Zoe Nom/)).toBeNull();
  });

  it("rien à venir : rien n'apparaît", async () => {
    api.lireBonusAVenir.mockResolvedValue([]);
    const { container } = avec(<BonusAVenir />);
    await vi.waitFor(() => expect(api.lireBonusAVenir).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="bonus-a-venir"]')).toBeNull();
  });
});

describe("La recrue d'un parrainage (Admin → Parrainages)", () => {
  const posteurs = [
    { id: "p1", prenom: "Ana", nom: "Pérez", email: null },
    { id: "p2", prenom: "Bruno", nom: "Keller", email: null },
  ] as PosterProfil[];

  it("propose le posteur au même nom ; l'admin relie", async () => {
    avec(<ChoixRecrue referral={{ id: "r1", prenom: "ana", nom: "perez", recrue_id: null }} posteurs={posteurs} />);
    expect(screen.getByText("Proposé : Ana Pérez")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Relier" }));
    await vi.waitFor(() => expect(api.lierRecrue).toHaveBeenCalledWith("r1", "p1"));
  });
});
