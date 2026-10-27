import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { CompteExport } from "./api";

const api = vi.hoisted(() => ({ lireDonneesExport: vi.fn(), journaliserExport: vi.fn() }));
vi.mock("./api", () => api);
vi.mock("@/features/moteur/etapesApi", () => ({ lireEtapesComptes: vi.fn(async () => new Map()) }));
vi.mock("@/features/paie/api", () => ({ lirePaie: vi.fn(async () => []), lireSemaineSuivante: vi.fn(async () => new Map()) }));
vi.mock("@/features/bonus/api", () => ({ lireBonusAVenir: vi.fn(async () => []) }));
const csv = vi.hoisted(() => ({ telecharger: vi.fn() }));
vi.mock("@/lib/csv", async (orig) => ({
  ...(await orig<typeof import("@/lib/csv")>()),
  telechargerCsv: csv.telecharger,
}));
vi.mock("@/features/moteur/cohortes", async (orig) => ({
  ...(await orig<typeof import("@/features/moteur/cohortes")>()),
  aujourdhuiParis: () => "2026-10-28",
}));

import { BoutonExport } from "./BoutonExport";

function compte(i: number): CompteExport {
  return {
    compte_id: `c${i}`,
    poster_id: `p${i}`,
    hm_id: "hm",
    hm_prenom: "Lucía",
    hm_zone: "LATAM",
    poster_nom: `Poster ${i}`,
    pays: "FR",
    langue: "fr",
    handle: `h${i}`,
    comptes_actifs: 1,
    upwork_contrat_url: null,
    is_active: true,
    premier_jour: "2026-09-07",
    cree_le: "2026-09-01T10:00:00Z",
    warmup_started_at: "2026-09-02T10:00:00Z",
    warmup_ends_at: "2026-09-07T00:00:00+02:00",
    reposts_le: null,
    tiktok_existe: true,
    tiktok_cree_le: null,
    follows: 6,
    likes: 10,
    seuil_mort: 50,
    mediane_pays: 1000,
    posts: [
      { jour: "2026-10-27", rang: 1, url: "u|1", vues: 900, likes: 3, publie_at: "2026-10-27T10:00:00Z", stats_maj_at: "2026-10-28T04:00:00Z", mesure: true },
    ],
    diagnostic: { badge: "ok", attendus: 1, publies: 1, liens_manquants: [], mediane: 900, mediane_ref: 1000, morts: 0, seuil_mort: 50, shadowban: false },
    decision: null,
  };
}

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <BoutonExport />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
}

describe("BoutonExport", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    vi.clearAllMocks();
    api.journaliserExport.mockResolvedValue(undefined);
    api.lireDonneesExport.mockResolvedValue([compte(1), compte(2)]);
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
  });

  it("lit les données de la période choisie avec le cloisonnement de la base", async () => {
    rendu();
    await screen.findByText(/2 lignes/);
    expect(api.lireDonneesExport).toHaveBeenCalledWith("2026-10-26", "2026-10-28", null);
  });

  it("CSV : seules les colonnes cochées, nom hm_[prénom]_[bloc]_[date].csv, journalisé", async () => {
    rendu();
    await screen.findByText(/2 lignes/);
    const dialogue = screen.getByRole("dialog");
    // On ne garde que deux colonnes.
    for (const box of within(dialogue).getAllByRole("checkbox") as HTMLInputElement[]) {
      const nom = box.parentElement!.textContent;
      if (box.checked && nom !== "tiktok_handle" && nom !== "posts_done_week") fireEvent.click(box);
    }
    fireEvent.click(within(dialogue).getByRole("button", { name: /Télécharger CSV/ }));
    expect(csv.telecharger).toHaveBeenCalledWith(
      "hm_lucia_tout_2026-10-28.csv",
      "﻿tiktok_handle,posts_done_week\r\nh1,1\r\nh2,1\r\n",
    );
    await vi.waitFor(() =>
      expect(api.journaliserExport).toHaveBeenCalledWith(
        expect.objectContaining({ format: "csv", colonnes: ["tiktok_handle", "posts_done_week"], lignes: 2 }),
      ),
    );
  });

  it("Copier pour Claude : contexte, sens des colonnes, tableau Markdown dans le presse-papier", async () => {
    rendu();
    await screen.findByText(/2 lignes/);
    fireEvent.change(screen.getByLabelText("Niveau"), { target: { value: "detail" } });
    fireEvent.click(screen.getByRole("button", { name: /Copier pour Claude/ }));
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    const texte = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(texte.startsWith("Context\n- HM: Lucía (zone: LATAM)")).toBe(true);
    expect(texte).toContain("- slot: Rank of the post in the day");
    expect(texte).toContain("| 2026-10-27 | h1 | Poster 1 | 1 | published | 2026-10-27T10:00:00.000Z | u\\|1 | 900 | 3 | 18 |");
    expect(await screen.findByText("Copié : colle-le dans Claude.")).toBeTruthy();
  });

  it("plus de 300 lignes : « Copier pour Claude » propose le CSV", async () => {
    api.lireDonneesExport.mockResolvedValue(Array.from({ length: 301 }, (_, i) => compte(i)));
    rendu();
    await screen.findByText(/301 lignes/);
    expect(screen.getByRole("button", { name: /Copier pour Claude/ })).toHaveProperty("disabled", true);
    expect(screen.getByText(/Plus de 300 lignes/)).toBeTruthy();
  });
});
