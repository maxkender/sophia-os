import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";
import type { AssignationABlancResultat } from "./assignationABlanc";

const lancer = vi.fn();

vi.mock("@/features/moteur/api", () => ({
  listerComptes: () =>
    Promise.resolve([{ id: "0000000a-0000-4000-8000-000000000001", persona_nom: "Alice", handle_tiktok: null, langue: "fr" }]),
  demainParis: () => "2026-10-10",
  lancerAssignationABlanc: (...args: unknown[]) => lancer(...args),
}));

import { AssignationABlancCard } from "./AssignationABlancCard";

function rendre(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const RESULTAT: AssignationABlancResultat = {
  aBlanc: true,
  jour: "2026-10-10",
  ia: false,
  dureeMs: 4200,
  resume: "1 créneau(x) simulé(s) — rien n'a été écrit",
  compte: { id: "0000000a-0000-4000-8000-000000000001", nom: "Alice", langue: "fr", quota: 3, actif: true, ugc: false },
  laNuit: { servirait: false, motifs: ["warmup_en_cours"] },
  resultat: { crees: 1, quotaBaisse: { avant: 3, apres: 1, raison: "pool mince", simule: true } },
  creneaux: [{
    rang: 1,
    passageId: "fictif-passage",
    postId: "fictif-post",
    contenu: { id: "c0000000-0000-4000-8000-000000000001", titre: "Trois habitudes", tier: "B", tierCycle: 2, repeche: true },
    application: { id: "00000000-0000-4000-8000-000000000001", slug: "sophia", nom: "Sophia" },
    langue: "fr",
    slides: [
      { position: 1, texte: "accroche", pub: false, mediaId: "m1", mediaUrl: "https://x/m1.jpg", referenceUrl: null },
      { position: 2, texte: "avec l'appli Sophia", pub: true, mediaId: null, mediaUrl: null, referenceUrl: null },
    ],
    slidePub: 2,
    hashtags: "#culture",
    musique: { titre: "Son", url: null, plateforme: "tiktok" },
    deck: { origine: "existant", hashtagsStatiques: false, appelsIA: { autorises: 0, bloques: 0 } },
  }],
  decksEcartes: [],
  ecrituresEvitees: [
    { table: "passages", operation: "insert", requetes: 1, lignes: 1 },
    { table: "comptes", operation: "update", requetes: 1, lignes: 1 },
  ],
  appelsBloques: [{ hote: "queue.fal.run", motif: "externe", nombre: 2 }],
  appelsIA: { autorises: 0, bloques: 0 },
  lectures: 42,
  limites: ["Rappels J+7 non rejoués"],
};

describe("AssignationABlancCard", () => {
  beforeEach(() => {
    lancer.mockReset();
    lancer.mockImplementation((_d: string, _c: string, _ia: boolean, onLog?: (l: unknown) => void) => {
      onLog?.({ at: "2026-10-09T12:00:00Z", detail: "Évité · INSERT passages (1)", etape: "a_blanc" });
      return Promise.resolve(RESULTAT);
    });
  });

  it("lance le test à blanc du compte choisi (sans IA par défaut) et affiche le résultat, sans aucun lien", async () => {
    rendre(<AssignationABlancCard />);
    const select = await screen.findByLabelText(/creator|créateur/i);
    await waitFor(() => expect(screen.getByRole("option", { name: /Alice/ })).toBeInTheDocument());
    fireEvent.change(select, { target: { value: "0000000a-0000-4000-8000-000000000001" } });
    fireEvent.click(screen.getByRole("button", { name: /dry-run test|test à blanc/i }));

    await screen.findByTestId("resultat-a-blanc");
    expect(lancer).toHaveBeenCalledWith("2026-10-10", "0000000a-0000-4000-8000-000000000001", false, expect.any(Function));
    expect(screen.getByText("Évité · INSERT passages (1)")).toBeInTheDocument();
    expect(screen.getAllByTestId("creneau-a-blanc")).toHaveLength(1);
    expect(screen.getByText("Trois habitudes")).toBeInTheDocument();
    expect(screen.getByText(/3→1/)).toBeInTheDocument();
    expect(screen.getByText(/SIMUL/)).toBeInTheDocument();
    expect(screen.getByText("queue.fal.run")).toBeInTheDocument();
    expect(screen.getByText("comptes")).toBeInTheDocument();
    // Ids fictifs : jamais de lien vers un passage ou un post.
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(document.body.textContent).not.toContain("fictif-post");
  });
});
