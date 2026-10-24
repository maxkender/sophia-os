import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";
import i18n from "@/locales";

import type { MajSourcesRun } from "./majSequentielle";
import type { CompteReference } from "./types";

const lireMajSourcesRun = vi.fn();
const demarrerMajSourcesServeur = vi.fn();
const annulerMajSourcesServeur = vi.fn();

vi.mock("@/features/moteur/api", () => ({
  lireMajSourcesRun: () => lireMajSourcesRun(),
  demarrerMajSourcesServeur: (c: unknown) => demarrerMajSourcesServeur(c),
  annulerMajSourcesServeur: () => annulerMajSourcesServeur(),
}));
vi.mock("@/features/moteur/importJobs", () => ({ syncMajJobDepuisRun: () => undefined }));

import { MajSourcesPanel } from "./MajSourcesPanel";

const JOUR = 86_400_000;
const il = (jours: number) => new Date(Date.now() - jours * JOUR).toISOString();

function source(id: string, jours: number, langue = "fr"): CompteReference {
  return { id, handle_tiktok: id, is_active: true, langue, dernier_scrape_at: il(jours) } as CompteReference;
}

const SOURCES = [source("recente", 1), source("vieille", 12, "en"), source("moyenne", 4, "es")];

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MajSourcesPanel sources={SOURCES} stock={{ recente: 40, vieille: 3 }} />
    </QueryClientProvider>,
  );
}

describe("MajSourcesPanel", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    lireMajSourcesRun.mockResolvedValue(null);
    await i18n.changeLanguage("fr");
  });

  it("liste chaque source avec la date de son dernier import, la plus ancienne d'abord", async () => {
    rendre();
    const cases = await screen.findAllByRole("checkbox");
    expect(cases.map((c) => c.getAttribute("aria-label"))).toEqual(["@vieille", "@moyenne", "@recente"]);
    expect(screen.getByTestId("maj-date-vieille").textContent).toMatch(/Dernier import il y a 12 jours/);
    expect(screen.getByTestId("maj-date-recente").textContent).toMatch(/Dernier import hier/);
    expect(screen.getByText("40 en stock")).toBeTruthy();
  });

  it("n'envoie que les sources cochées", async () => {
    demarrerMajSourcesServeur.mockResolvedValue({ deja: false, etat: null });
    rendre();
    const go = await screen.findByRole("button", { name: /Mettre à jour 0 source/ });
    expect((go as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: "@moyenne" }));
    fireEvent.click(screen.getByRole("button", { name: "Mettre à jour 1 source" }));
    await waitFor(() => expect(demarrerMajSourcesServeur).toHaveBeenCalledTimes(1));
    expect(demarrerMajSourcesServeur.mock.calls[0][0]).toEqual([{ id: "moyenne", handle: "moyenne", langue: "es" }]);
  });

  it("« Plus de 7 jours » ne coche que les anciennes", async () => {
    rendre();
    fireEvent.click(await screen.findByRole("button", { name: "Plus de 7 jours" }));
    expect((screen.getByRole("checkbox", { name: "@vieille" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "@moyenne" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole("button", { name: "Mettre à jour 1 source" })).toBeTruthy();
  });

  it("pendant la séquence : où en est chaque source, et plus de cases", async () => {
    const run: MajSourcesRun = {
      statut: "running",
      comptes: [
        { id: "vieille", handle: "vieille", langue: "en" },
        { id: "moyenne", handle: "moyenne", langue: "es" },
      ],
      index: 1,
      faits: 1,
      handle: "vieille",
      phase: "attente",
      restant: 7,
      minRestant: 7,
      maxFaits: null,
      dernierProgresAt: null,
      journal: [
        {
          at: "t",
          niveau: "ok",
          message: "[1/2] @vieille — 9 slideshow(s) enfilé(s)",
          detail: "profil=20 slideshow(s) · déjà en stock=11 · manquants=9\nenfilées=9 · déjà en file=0 · source=apify",
        },
      ],
    };
    lireMajSourcesRun.mockResolvedValue(run);
    rendre();
    const suivi = await screen.findByTestId("maj-suivi");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Arrêter" })).toBeTruthy();

    const premiere = within(suivi).getByTestId("maj-suivi-vieille");
    expect(premiere.dataset.statut).toBe("file");
    expect(premiere.textContent).toMatch(/Import en cours : 9 slideshows, 7 élément\(s\) encore dans la file/);
    expect(premiere.textContent).toMatch(/20 au profil · 11 déjà en stock · 9 manquants/);
    expect(within(suivi).getByTestId("maj-suivi-moyenne").textContent).toMatch(/En attente de son tour/);
  });
});
