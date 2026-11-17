import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const lister = vi.fn();
const retenues = vi.fn();
const consolider = vi.fn();
const valider = vi.fn();
const rejeter = vi.fn();

vi.mock("./api", () => ({
  listerRelecteurs: () =>
    Promise.resolve([
      { id: "r1", profile_id: "p1", langue: "it", statut: "invite", note: null, created_at: "2026-11-03T10:00:00Z", prenom: "Annapaola", nom: "Illiano", email: null },
    ]),
}));

vi.mock("./apiRegles", () => ({
  listerRegles: (...a: unknown[]) => lister(...a),
  idsCorrectionsRetenues: (...a: unknown[]) => retenues(...a),
  consoliderRegles: (...a: unknown[]) => consolider(...a),
  validerRegles: (...a: unknown[]) => valider(...a),
  rejeterRegles: (...a: unknown[]) => rejeter(...a),
}));

import { SectionRegles } from "./SectionRegles";

const version = (id: string, v: number, statut: string, contenu: string, ids: string[]) => ({
  id,
  langue: "it",
  version: v,
  contenu,
  statut,
  corrections_ids: ids,
  auteur: "consolidation-lundi",
  valide_le: statut === "validee" ? "2026-11-16T08:00:00Z" : null,
  created_at: "2026-11-16T05:17:00Z",
});

function afficher() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SectionRegles />
    </QueryClientProvider>,
  );
}

describe("SectionRegles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    retenues.mockResolvedValue(["c1", "c2", "c3"]);
    consolider.mockResolvedValue({ ok: true, faites: [{ langue: "it", version: 3, nouvelles: 1 }], sautees: [], echecs: [], restantes: [] });
    valider.mockResolvedValue(undefined);
    rejeter.mockResolvedValue(undefined);
  });

  it("montre les règles validées en production et compte les corrections hors règles", async () => {
    lister.mockResolvedValue([version("v1", 1, "validee", "### Calques à éviter\n- au lieu de « fare senso »", ["c1", "c2"])]);
    afficher();
    expect(await screen.findByTestId("regles-validee")).toHaveTextContent("fare senso");
    expect(screen.getByTestId("regles-etat")).toHaveTextContent(/1 (correction\(s\) retenue\(s\) hors règles|accepted correction\(s\) outside the rules)/);
    expect(screen.queryByTestId("regles-proposee")).toBeNull();
  });

  it("valide la version proposée avec les retouches", async () => {
    lister.mockResolvedValue([
      version("v2", 2, "proposee", "### Vocabulaire\n- v2", ["c1", "c2", "c3"]),
      version("v1", 1, "validee", "### Calques\n- v1", ["c1", "c2"]),
    ]);
    afficher();
    const zone = await screen.findByLabelText(/^(Texte des règles|Rules text)$/);
    fireEvent.change(zone, { target: { value: "### Vocabulaire\n- v2 retouchée" } });
    fireEvent.click(screen.getByRole("button", { name: /(Valider avec mes retouches|Validate with my edits)/ }));
    await waitFor(() => expect(valider).toHaveBeenCalledWith("v2", "### Vocabulaire\n- v2 retouchée"));
  });

  it("valide sans retouche : le texte n'est pas renvoyé", async () => {
    lister.mockResolvedValue([version("v2", 2, "proposee", "### Sens\n- v2", ["c1"])]);
    afficher();
    fireEvent.click(await screen.findByRole("button", { name: /(Valider : passer en production|Validate: send to production)/ }));
    await waitFor(() => expect(valider).toHaveBeenCalledWith("v2", undefined));
  });

  it("consolide au bouton et dit quelle version est proposée", async () => {
    lister.mockResolvedValue([]);
    afficher();
    const bouton = await screen.findByRole("button", { name: /(Consolider maintenant \(3 corrections hors règles\)|Consolidate now \(3 corrections outside the rules\))/ });
    fireEvent.click(bouton);
    await waitFor(() => expect(consolider).toHaveBeenCalledWith("it", false));
    expect(await screen.findByText(/Version 3 (proposée|proposed)/)).toBeInTheDocument();
  });

  it("bouton désactivé quand les règles validées couvrent tout", async () => {
    lister.mockResolvedValue([version("v1", 1, "validee", "- tout", ["c1", "c2", "c3"])]);
    afficher();
    await screen.findByTestId("regles-validee");
    expect(screen.getByRole("button", { name: /(Consolider maintenant|Consolidate now) \(0 corrections/ })).toBeDisabled();
  });
});
