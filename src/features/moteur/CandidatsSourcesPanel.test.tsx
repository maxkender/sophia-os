import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { CandidatSource } from "./candidatsSources";
import type { Label } from "./types";

const listerCandidatsSources = vi.fn();
const validerCandidatSource = vi.fn();
const deciderCandidatSource = vi.fn();

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));
vi.mock("@/features/moteur/candidatsSources", async (importer) => ({
  ...(await importer<typeof import("./candidatsSources")>()),
  listerCandidatsSources: () => listerCandidatsSources(),
  validerCandidatSource: (...a: unknown[]) => validerCandidatSource(...a),
  deciderCandidatSource: (...a: unknown[]) => deciderCandidatSource(...a),
}));

import { CandidatsSourcesPanel } from "./CandidatsSourcesPanel";
import { candidatsVisibles, compterOnglets, languesDeLOnglet, versCandidat, vuesCourtes } from "./candidatsSources";

const LABELS = [
  { id: "l-smart", nom: "smart_girl" },
  { id: "l-alpha", nom: "alpha_male" },
] as Label[];

function candidat(handle: string, extra: Partial<CandidatSource> = {}): CandidatSource {
  return {
    id: handle,
    handle,
    langue: "de",
    sorte: "label",
    labelId: "l-smart",
    concept: null,
    pourquoi: `Pourquoi ${handle}`,
    risques: null,
    score: 50,
    chiffres: {
      posts: 40,
      slideshows: 37,
      vuesMediane: 84_800,
      vuesMax: 1_900_000,
      posts10k: 26,
      posts100k: 5,
      abonnes: 17_900,
      postsTotal: 624,
      dernierSlideshow: "2026-11-11",
      releveLe: "2026-11-12",
    },
    exemples: [{ url: `https://www.tiktok.com/@${handle}/photo/1`, vues: 1_900_000, accroche: "ZUFÄLLIGE FAKTEN" }],
    piste: "ancien_agent",
    statut: "propose",
    raisonRefus: null,
    ...extra,
  };
}

const TOUS = [
  candidat("moyen", { score: 60 }),
  candidat("fort", { score: 90 }),
  candidat("concept", { score: 80, sorte: "concept", labelId: null, concept: "fautes d'orthographe", langue: "hu" }),
  candidat("attend", { statut: "plus_tard" }),
  candidat("refuse", { statut: "refuse", raisonRefus: "trop de citations" }),
];

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CandidatsSourcesPanel niches={LABELS} />
    </QueryClientProvider>,
  );
}

const handles = (cartes: HTMLElement[]) => cartes.map((c) => within(c).getAllByRole("link")[0].textContent);

describe("CandidatsSourcesPanel", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
  });

  it("ne prend pas de place tant que l'agent n'a rien proposé", async () => {
    listerCandidatsSources.mockResolvedValue([]);
    const { container } = rendre();
    await waitFor(() => expect(listerCandidatsSources).toHaveBeenCalled());
    expect(container.querySelector("[data-testid='candidats-sources']")).toBeNull();
  });

  it("montre les propositions à décider, le meilleur score d'abord, avec leurs chiffres", async () => {
    listerCandidatsSources.mockResolvedValue(TOUS);
    rendre();
    const cartes = await screen.findAllByTestId("candidat-source");
    expect(handles(cartes)).toEqual(["@fort", "@concept", "@moyen"]);
    const chiffres = within(cartes[0]).getByTestId("candidat-chiffres").textContent ?? "";
    expect(chiffres).toContain(
      "37 slideshows sur ses 40 derniers posts · médiane 85 k vues · meilleur 1,9 M · 5 à 100 000 vues ou plus · 26 à 10 000 ou plus",
    );
    expect(chiffres).toMatch(/17\s900 abonnés · 624 posts en tout · dernier slideshow le 11 novembre · relevé le 12 novembre/);
    expect(within(cartes[1]).getByText("Concept nouveau")).toBeTruthy();
    expect(screen.getByRole("button", { name: "À décider · 3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Plus tard · 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Décidées · 1" })).toBeTruthy();
  });

  it("valide avec le label proposé et annonce la file", async () => {
    listerCandidatsSources.mockResolvedValue(TOUS);
    validerCandidatSource.mockResolvedValue({ handle: "fort", file: "attente" });
    rendre();
    const cartes = await screen.findAllByTestId("candidat-source");
    fireEvent.click(within(cartes[0]).getByRole("button", { name: "Valider" }));
    await waitFor(() => expect(validerCandidatSource).toHaveBeenCalledWith("fort", "l-smart", "de"));
    expect(await screen.findByText("@fort est une source. Son import partira au prochain lot (6 h 37).")).toBeTruthy();
  });

  it("demande un label avant de valider un concept nouveau", async () => {
    listerCandidatsSources.mockResolvedValue(TOUS);
    validerCandidatSource.mockResolvedValue({ handle: "concept", file: "lancee" });
    rendre();
    const carte = (await screen.findAllByTestId("candidat-source"))[1];
    const valider = within(carte).getByRole("button", { name: "Valider" }) as HTMLButtonElement;
    expect(valider.disabled).toBe(true);
    expect(within(carte).getByText("Choisis un label pour valider.")).toBeTruthy();
    fireEvent.change(within(carte).getByLabelText("Label de @concept"), { target: { value: "l-alpha" } });
    fireEvent.click(valider);
    await waitFor(() => expect(validerCandidatSource).toHaveBeenCalledWith("concept", "l-alpha", "hu"));
  });

  it("refuse avec la raison", async () => {
    listerCandidatsSources.mockResolvedValue(TOUS);
    deciderCandidatSource.mockResolvedValue(undefined);
    rendre();
    const carte = (await screen.findAllByTestId("candidat-source"))[2];
    fireEvent.click(within(carte).getByRole("button", { name: "Refuser" }));
    fireEvent.change(within(carte).getByLabelText("Raison du refus de @moyen"), { target: { value: "déjà vu" } });
    fireEvent.click(within(carte).getByRole("button", { name: "Confirmer le refus" }));
    await waitFor(() => expect(deciderCandidatSource).toHaveBeenCalledWith("moyen", "refuse", "déjà vu"));
  });

  it("garde les décidées dans leur onglet, avec la raison du refus", async () => {
    listerCandidatsSources.mockResolvedValue(TOUS);
    rendre();
    await screen.findAllByTestId("candidat-source");
    fireEvent.click(screen.getByRole("button", { name: "Décidées · 1" }));
    const carte = screen.getByTestId("candidat-source");
    expect(within(carte).getByText("Refusée : trop de citations")).toBeTruthy();
    expect(within(carte).queryByRole("button", { name: "Valider" })).toBeNull();
    expect(within(carte).getByRole("button", { name: "Remettre à décider" })).toBeTruthy();
  });

  it("filtre par sorte", async () => {
    listerCandidatsSources.mockResolvedValue(TOUS);
    rendre();
    await screen.findAllByTestId("candidat-source");
    fireEvent.click(screen.getByRole("button", { name: "Concepts nouveaux" }));
    expect(handles(screen.getAllByTestId("candidat-source"))).toEqual(["@concept"]);
  });
});

describe("candidatsSources", () => {
  it("lit une ligne de la base", () => {
    const c = versCandidat({
      id: "1",
      handle_tiktok: "lena.psychologie",
      langue: "de",
      sorte: "concept",
      label_id: null,
      concept: "faits au hasard",
      pourquoi: "Régulier",
      risques: "",
      score: 72,
      chiffres: {
        posts: 40,
        slideshows: 37,
        vues_mediane: 84800,
        vues_max: 1900000,
        posts_10k: 26,
        posts_100k: 5,
        abonnes: 17900,
        posts_total: 624,
        dernier_slideshow: "2026-11-11",
        releve_le: "2026-11-12",
      },
      exemples: [{ url: "https://x", vues: 1900000, accroche: "ZUFÄLLIGE FAKTEN" }, { vues: 3 }],
      piste: "ancien_agent",
      statut: "propose",
      raison_refus: null,
    });
    expect(c.sorte).toBe("concept");
    expect(c.risques).toBeNull();
    expect(c.chiffres).toEqual({
      posts: 40,
      slideshows: 37,
      vuesMediane: 84800,
      vuesMax: 1900000,
      posts10k: 26,
      posts100k: 5,
      abonnes: 17900,
      postsTotal: 624,
      dernierSlideshow: "2026-11-11",
      releveLe: "2026-11-12",
    });
    expect(c.exemples).toEqual([{ url: "https://x", vues: 1900000, accroche: "ZUFÄLLIGE FAKTEN" }]);
  });

  it("compte les onglets et trie par score", () => {
    expect(compterOnglets(TOUS)).toEqual({ a_decider: 3, plus_tard: 1, decides: 1 });
    expect(candidatsVisibles(TOUS, { onglet: "a_decider", langue: "de", sorte: "" }).map((c) => c.handle)).toEqual([
      "fort",
      "moyen",
    ]);
    expect(languesDeLOnglet(TOUS, "a_decider")).toEqual(["de", "hu"]);
  });

  it("abrège les vues", () => {
    expect(vuesCourtes(null)).toBe("—");
    expect(vuesCourtes(478)).toBe("478");
    expect(vuesCourtes(2_679)).toBe("2,7 k");
    expect(vuesCourtes(84_800)).toBe("85 k");
    expect(vuesCourtes(1_000_000)).toBe("1 M");
    expect(vuesCourtes(3_200_000)).toBe("3,2 M");
  });
});
