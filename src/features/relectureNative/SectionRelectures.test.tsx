import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const lister = vi.fn();
const envoyer = vi.fn();

vi.mock("./api", () => ({
  listerRelecteurs: () =>
    Promise.resolve([
      { id: "r1", profile_id: "p1", langue: "de", statut: "invite", note: null, created_at: "2026-10-27T20:00:00Z", prenom: "Bogdan", nom: "Kocsis", email: null },
    ]),
}));
vi.mock("./apiRelectures", () => ({
  listerRelectures: (...a: unknown[]) => lister(...a),
  envoyerRelectures: (...a: unknown[]) => envoyer(...a),
}));

import { SectionRelectures } from "./SectionRelectures";

const base = {
  langue: "de",
  relecteur_id: "r1",
  envoye_le: "2026-11-07T08:07:00Z",
  label: "smart_girl",
  vues: 12000,
  publie_at: "2026-11-01T10:00:00Z",
  slides: [
    { position: 1, texte_overlay: "wie ich gepflegt wirke" },
    { position: 2, texte_overlay: "ich dusche jeden Abend" },
  ],
  slides_source: [],
  corrections_extraites_le: null,
  relecteur: { prenom: "Bogdan", nom: "Kocsis" },
};

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SectionRelectures />
    </QueryClientProvider>,
  );
}

describe("SectionRelectures", () => {
  beforeEach(() => {
    lister.mockReset();
    envoyer.mockReset();
    lister.mockResolvedValue([
      { ...base, id: "a", statut: "faite", note: 4, remarque: "gut", slides_corrigees: [{ position: 2, texte: "ich dusch jeden Abend" }], fait_le: "2026-11-07T10:00:00Z" },
      { ...base, id: "b", statut: "a_faire", note: null, remarque: null, slides_corrigees: [], fait_le: null },
    ]);
    envoyer.mockResolvedValue(15);
  });

  it("le bilan de la langue, la liste, le détail d'une relecture", async () => {
    rendre();
    const bilan = await screen.findByTestId("relectures-bilan");
    expect(lister).toHaveBeenCalledWith("de");
    expect(bilan.textContent).toMatch(/2 (envoyés|sent)/);
    expect(bilan.textContent).toMatch(/1 (relu|reviewed)/);
    expect(bilan.textContent).toMatch(/1 slides? (reprises|rewritten).*2.*50 %/);
    const lignes = within(screen.getByTestId("liste-relectures")).getAllByTestId("relecture-admin");
    expect(lignes.map((l) => l.getAttribute("data-statut"))).toEqual(["faite", "a_faire"]);
    fireEvent.click(within(lignes[0]).getByRole("button"));
    expect(lignes[0].textContent).toContain("ich dusch jeden Abend");
    expect(lignes[0].textContent).toContain("« gut »");
  });

  it("le bouton envoie 15 posts de la langue et relit la liste", async () => {
    rendre();
    const bouton = await screen.findByRole("button", { name: /envoyer 15 posts|send 15 posts/i });
    fireEvent.click(bouton);
    await waitFor(() => expect(envoyer).toHaveBeenCalledWith("de", 15));
    expect(await screen.findByText(/15 post\(s\) (envoyé|sent)/)).toBeInTheDocument();
    await waitFor(() => expect(lister.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});
