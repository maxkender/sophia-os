import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";
import i18n from "@/locales";

import type { MajSourcesRun } from "./majSequentielle";
import type { CompteReference } from "./types";

const lireMajSourcesRun = vi.fn();
const contenusParSource = vi.fn();
const performanceSources = vi.fn();
const demarrerMajSourcesServeur = vi.fn();
const annulerMajSourcesServeur = vi.fn();

vi.mock("@/features/moteur/api", () => ({
  lireMajSourcesRun: () => lireMajSourcesRun(),
  contenusParSource: () => contenusParSource(),
  performanceSources: () => performanceSources(),
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
      <MajSourcesPanel sources={SOURCES} />
    </QueryClientProvider>,
  );
}

describe("MajSourcesPanel", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    lireMajSourcesRun.mockResolvedValue(null);
    performanceSources.mockResolvedValue({
      vieille: { posts: 126, r: 1.15, vuesMediane: 1531 },
      moyenne: { posts: 4, r: 1.94, vuesMediane: 3670 },
      recente: { posts: 300, r: 0.85, vuesMediane: 1387 },
    });
    contenusParSource.mockResolvedValue({ recente: { importes: 40, valides: 35 }, vieille: { importes: 53, valides: 45 } });
    await i18n.changeLanguage("fr");
  });

  it("liste chaque source avec la date de sa dernière mise à jour et ses slideshows importés", async () => {
    rendre();
    const cases = await screen.findAllByRole("checkbox");
    expect(cases.map((c) => c.getAttribute("aria-label"))).toEqual(["@vieille", "@moyenne", "@recente"]);
    expect(screen.getByTestId("maj-date-vieille").textContent).toMatch(/Dernière mise à jour il y a 12 jours/);
    expect(screen.getByTestId("maj-date-recente").textContent).toMatch(/Dernière mise à jour hier/);
    // Les contenus importés de la source, pas les sujets reproductibles.
    await waitFor(() => expect(screen.getByTestId("maj-importes-vieille").textContent).toBe("53 importés"));
    expect(screen.getByTestId("maj-importes-vieille").getAttribute("title")).toMatch(/dont 45 validé/);
    expect(screen.getByTestId("maj-importes-moyenne").textContent).toBe("0 importé");
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
    expect(premiere.textContent).toMatch(/20 au profil · 11 déjà dans l'OS \(toutes sources\) · 9 manquants/);
    expect(within(suivi).getByTestId("maj-suivi-moyenne").textContent).toMatch(/En attente de son tour/);
  });

  it("une vieille séquence finie dit sa date et replie son détail", async () => {
    const run: MajSourcesRun = {
      statut: "done",
      comptes: [{ id: "vieille", handle: "vieille", langue: "en" }],
      index: 1,
      faits: 1,
      handle: "vieille",
      phase: "import",
      restant: 0,
      minRestant: null,
      maxFaits: null,
      dernierProgresAt: null,
      journal: [
        {
          at: il(66),
          niveau: "info",
          message: "[1/1] @vieille — rien à rattraper",
          detail: "profil=53 slideshow(s) · déjà en stock=53 · manquants=0\nenfilées=0 · déjà en file=0 · source=apify",
        },
      ],
    };
    lireMajSourcesRun.mockResolvedValue(run);
    rendre();
    const suivi = await screen.findByTestId("maj-suivi");
    expect(within(suivi).getByTestId("maj-suivi-date").textContent).toMatch(/il y a 66 jours/);
    expect(within(suivi).queryByTestId("maj-suivi-vieille")).toBeNull();
    // Les cases restent là : on peut relancer.
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);

    fireEvent.click(within(suivi).getByRole("button", { name: /Voir le détail \(1 source\)/ }));
    expect(within(suivi).getByTestId("maj-suivi-vieille").textContent).toMatch(
      /rien à rattraper, tout était déjà dans l'OS.*53 au profil · 53 déjà dans l'OS \(toutes sources\) · 0 manquants/,
    );
  });

  it("une séquence finie il y a moins d'une heure garde son détail ouvert", async () => {
    lireMajSourcesRun.mockResolvedValue({
      statut: "done",
      comptes: [{ id: "vieille", handle: "vieille", langue: "en" }],
      index: 1,
      faits: 1,
      handle: "vieille",
      phase: "import",
      restant: 0,
      minRestant: null,
      maxFaits: null,
      dernierProgresAt: null,
      journal: [{ at: new Date(Date.now() - 10 * 60_000).toISOString(), niveau: "ok", message: "[1/1] @vieille — 2 slideshow(s) enfilé(s)" }],
    } satisfies MajSourcesRun);
    rendre();
    const suivi = await screen.findByTestId("maj-suivi");
    expect(within(suivi).getByTestId("maj-suivi-vieille").textContent).toMatch(/Terminé : 2 slideshows envoyés à l'import/);
    expect(within(suivi).getByRole("button", { name: "Masquer le détail" })).toBeTruthy();
  });

  it("montre le r de chaque source et « r ≥ 1 » ne coche que les sources qui marchent sur assez de posts", async () => {
    rendre();
    await waitFor(() => expect(screen.getByTestId("maj-r-vieille").textContent).toBe("r 1,15"));
    expect(screen.getByTestId("maj-r-recente").textContent).toBe("r 0,85");
    fireEvent.click(screen.getByRole("button", { name: "r ≥ 1" }));
    // moyenne : r 1,94 mais sur 4 posts seulement, pas cochée.
    expect((screen.getByRole("checkbox", { name: "@vieille" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "@moyenne" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "@recente" }) as HTMLInputElement).checked).toBe(false);
  });
});
