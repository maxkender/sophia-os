import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const lister = vi.fn();
const decider = vi.fn();
const modifier = vi.fn();
const supprimer = vi.fn();
const compterAExtraire = vi.fn();
const extraire = vi.fn();
const bloc = vi.fn();

vi.mock("./api", () => ({
  listerRelecteurs: () =>
    Promise.resolve([
      { id: "r1", profile_id: "p1", langue: "de", statut: "invite", note: null, created_at: "2026-10-27T20:00:00Z", prenom: "Bogdan", nom: "Kocsis", email: null },
      { id: "r2", profile_id: "p2", langue: "it", statut: "invite", note: null, created_at: "2026-09-26T20:00:00Z", prenom: "Annapaola", nom: "Illiano", email: null },
    ]),
}));

vi.mock("./apiCorrections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./apiCorrections")>()),
  listerCorrectionsNatives: (...a: unknown[]) => lister(...a),
  deciderCorrections: (...a: unknown[]) => decider(...a),
  modifierCorrection: (...a: unknown[]) => modifier(...a),
  supprimerCorrection: (...a: unknown[]) => supprimer(...a),
  compterVotesAExtraire: (...a: unknown[]) => compterAExtraire(...a),
  extraireCorrections: (...a: unknown[]) => extraire(...a),
  blocCorrectionsNatives: (...a: unknown[]) => bloc(...a),
}));

import { SectionCorrections } from "./SectionCorrections";

const correction = (id: string, statut: "proposee" | "retenue" | "ecartee", fautif: string, corrige: string | null, type = "calque") => ({
  id,
  langue: "de",
  vote_id: "v1",
  duel_id: "d1",
  relecture_id: null,
  relecteur_id: "r1",
  version: "candidat",
  slide: 4,
  type,
  fautif,
  corrige,
  explication: "ça sonne traduit",
  statut,
  decide_le: null,
  created_at: "2026-11-05T10:00:00Z",
  updated_at: "2026-11-05T10:00:00Z",
  relecteur: { prenom: "Bogdan", nom: "Kocsis" },
});

const CORRECTIONS = [
  correction("c1", "proposee", "Insouciant", "unbekümmert"),
  correction("c2", "proposee", "die Wissenschaft ist verrückt", "krass, oder?", "registre"),
  correction("c3", "retenue", "eine App wie Sophia hilft dir", "ich les das auf Sophia", "placement"),
  correction("c4", "ecartee", "Hallo", null, "autre"),
];

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SectionCorrections />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SectionCorrections", () => {
  beforeEach(() => {
    for (const f of [lister, decider, modifier, supprimer, compterAExtraire, extraire, bloc]) f.mockReset();
    lister.mockResolvedValue(CORRECTIONS);
    compterAExtraire.mockResolvedValue(3);
    bloc.mockResolvedValue("=== RETOURS DES RELECTEURS NATIFS (DE) ===\n- [placement] au lieu de « eine App wie Sophia hilft dir », écris « ich les das auf Sophia »");
    for (const f of [decider, modifier, supprimer]) f.mockResolvedValue(undefined);
    extraire.mockResolvedValue({ traites: 3, corrections: 7, echecs: [], restants: 0 });
  });

  it("la première langue des relecteurs, les proposées d'abord, les compteurs, le filtre", async () => {
    rendre();
    const liste = await screen.findByTestId("liste-corrections");
    expect(lister).toHaveBeenCalledWith("de");
    expect(within(liste).getAllByTestId("correction").map((c) => c.getAttribute("data-statut"))).toEqual(["proposee", "proposee"]);
    expect(liste.textContent).toContain("Insouciant");
    expect(liste.textContent).toContain("unbekümmert");
    expect(screen.getByRole("button", { name: /(proposées|proposed) · 2/i })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /(retenues|kept) · 1/i }));
    expect(within(screen.getByTestId("liste-corrections")).getAllByTestId("correction")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /(toutes|all) · 4/i }));
    expect(within(screen.getByTestId("liste-corrections")).getAllByTestId("correction")).toHaveLength(4);
  });

  it("retenir, écarter et retenir toutes les proposées passent par deciderCorrections", async () => {
    rendre();
    const liste = await screen.findByTestId("liste-corrections");
    const [c1] = within(liste).getAllByTestId("correction");
    fireEvent.click(within(c1).getByRole("button", { name: /^(retenir|keep)$/i }));
    await waitFor(() => expect(decider).toHaveBeenCalledWith(["c1"], "retenue"));
    fireEvent.click(within(c1).getByRole("button", { name: /^(écarter|discard)$/i }));
    await waitFor(() => expect(decider).toHaveBeenCalledWith(["c1"], "ecartee"));
    fireEvent.click(screen.getByRole("button", { name: /retenir les 2 proposées|keep the 2 proposed/i }));
    await waitFor(() => expect(decider).toHaveBeenCalledWith(["c1", "c2"], "retenue"));
  });

  it("le bouton découpe les remarques de la langue et affiche le bilan", async () => {
    rendre();
    const bouton = await screen.findByRole("button", { name: /découper 3 remarques|cut 3 remarks/i });
    fireEvent.click(bouton);
    await waitFor(() => expect(extraire).toHaveBeenCalledWith("de"));
    expect(await screen.findByText(/3 remarque\(s\) découpée\(s\), 7 correction\(s\)|3 remark\(s\) cut, 7 correction\(s\)/)).toBeInTheDocument();
    await waitFor(() => expect(lister.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("modifier la correction enregistre le texte et le type ; l'aperçu montre le bloc reçu par la traduction", async () => {
    rendre();
    const liste = await screen.findByTestId("liste-corrections");
    const [c1] = within(liste).getAllByTestId("correction");
    fireEvent.click(within(c1).getByRole("button", { name: /^(modifier|edit)$/i }));
    fireEvent.change(within(c1).getByRole("textbox"), { target: { value: "sorglos" } });
    fireEvent.change(within(c1).getByRole("combobox"), { target: { value: "vocabulaire" } });
    fireEvent.click(within(c1).getByRole("button", { name: /^(enregistrer|save)$/i }));
    await waitFor(() => expect(modifier).toHaveBeenCalledWith("c1", { corrige: "sorglos", type: "vocabulaire" }));
    expect((await screen.findByTestId("bloc-corrections")).textContent).toContain("ich les das auf Sophia");
  });

  it("changer de langue relit ses corrections ; supprimer demande confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    rendre();
    await screen.findByTestId("liste-corrections");
    fireEvent.change(screen.getByRole("combobox", { name: /langue|language/i }), { target: { value: "it" } });
    await waitFor(() => expect(lister).toHaveBeenCalledWith("it"));
    const [c1] = within(await screen.findByTestId("liste-corrections")).getAllByTestId("correction");
    fireEvent.click(within(c1).getByRole("button", { name: /^(supprimer|delete)$/i }));
    await waitFor(() => expect(supprimer).toHaveBeenCalledWith("c1"));
  });
});
