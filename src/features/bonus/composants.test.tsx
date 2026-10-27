import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import type { PosterProfil } from "@/features/moteur/types";

import type { BonusAVenir as TBonusAVenir, LigneBonus } from "./api";

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
import { SectionBonus } from "./SectionBonus";

const REGLAGES = {
  parrainage_montant: 25,
  parrainage_semaines_min: 2,
  parrainage_posts_min_semaine: 12,
  comment_master_par_commentaire: 0.5,
  premier_lundi: "2026-11-30",
};

function ligne(o: Partial<LigneBonus>): LigneBonus {
  return {
    id: "b1",
    poster_id: "Parrain",
    hm_id: "hm",
    type: "parrainage",
    referral_id: "r",
    recrue_id: "x",
    lundi_bonus: "2026-11-30",
    periode_debut: "2026-11-02",
    periode_fin: "2026-11-29",
    detail: "parrainage de Ana Pérez, 2 semaines faites",
    quantite: 2,
    verifies: null,
    montant: 25,
    statut: "a_payer",
    contrat_url: "https://upwork.com/c/1",
    paye_at: null,
    paye_par: null,
    ...o,
  };
}

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

describe("SectionBonus (Paie)", () => {
  beforeEach(() => {
    api.lireBonus.mockResolvedValue([
      ligne({}),
      ligne({
        id: "b2",
        poster_id: "Cm",
        type: "comment_master",
        referral_id: null,
        detail: "37 commentaires du 2 au 29 nov.",
        quantite: 37,
        verifies: 30,
        montant: 18.5,
        statut: "a_voir",
        contrat_url: null,
      }),
    ]);
  });

  it("la consigne, les lignes du lundi bonus, « À voir » sans contrat Upwork", async () => {
    avec(<SectionBonus />);
    await screen.findByText("Parrain Nom");
    expect(api.lireBonus).toHaveBeenCalledWith("2026-11-30");
    expect(screen.getByText("Payer en Bonus sur le contrat Upwork actif du posteur.")).toBeTruthy();
    const cm = screen.getByText("Cm Nom").closest("tr")!;
    expect(within(cm).getByText("Pas de contrat : à voir")).toBeTruthy();
    expect(within(cm).getByText("30 vérifiés sur TikTok")).toBeTruthy();
    expect(screen.getByText(/1 ligne à voir/)).toBeTruthy();
  });

  it("la case « Payé »", async () => {
    avec(<SectionBonus />);
    const parrain = (await screen.findByText("Parrain Nom")).closest("tr")!;
    fireEvent.click(within(parrain).getByRole("checkbox"));
    await vi.waitFor(() => expect(api.marquerBonusPaye).toHaveBeenCalledWith("b1", true));
  });

  it("les réglages viennent de l'OS et s'enregistrent", async () => {
    api.enregistrerReglagesBonus.mockResolvedValue(undefined);
    avec(<SectionBonus />);
    await screen.findByText("Parrain Nom");
    const champ = screen.getByLabelText("Comment Master : montant par commentaire ($)") as HTMLInputElement;
    expect(champ.value).toBe("0.5");
    fireEvent.change(champ, { target: { value: "0.75" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await vi.waitFor(() =>
      expect(api.enregistrerReglagesBonus).toHaveBeenCalledWith({ ...REGLAGES, comment_master_par_commentaire: 0.75 }),
    );
  });
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
