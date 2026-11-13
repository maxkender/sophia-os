import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lireAInviterRuul: vi.fn(),
  lireEtatAgentRuul: vi.fn(),
  marquerInvitesRuul: vi.fn(),
  importerStatutsRuul: vi.fn(),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));

import { lignesAujourdhui } from "@/features/auto/aujourdhui/logique";

import { AgentRuul, DernierImportRuul } from "./AgentRuul";
import { texteAInviter } from "./api";

function rendu(el: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.lireAInviterRuul.mockResolvedValue([{ poster_id: "p1", nom: "Ana B", email_ruul: "ana@gmail.com", pays: "ES" }]);
  api.lireEtatAgentRuul.mockResolvedValue({ dernier_import_at: null, emails_ab: false, a_envoyer_a: 0, a_envoyer_b: 0, envoyes_a: 0, envoyes_b: 0, journal: [] });
  api.importerStatutsRuul.mockImplementation(async (_t: string, simuler: boolean) => ({
    lignes: 2, trouves: 2, changes: 2, a_envoyer_a: 1, a_envoyer_b: 1, nouveaux_invited: 1, nouveaux_active: 1, introuvables: [], illisibles: [], simulation: simuler,
  }));
  api.marquerInvitesRuul.mockResolvedValue({ emails: 2, marques: 1, deja: 0, introuvables: ["x@y.com"] });
});

describe("0681 : Agent Ruul", () => {
  it("la liste à copier : « nom ; email ; pays » (pays en anglais)", () => {
    expect(texteAInviter([
      { poster_id: "1", nom: "Ana B", email_ruul: "ana@gmail.com", pays: "ES" },
      { poster_id: "2", nom: "", email_ruul: "b@x.io", pays: null },
      { poster_id: "3", nom: "Ece", email_ruul: "e@x.io", pays: "tr" },
    ])).toBe("Ana B ; ana@gmail.com ; Spain\n? ; b@x.io ; ?\nEce ; e@x.io ; Türkiye");
  });

  it("intitulés fixes ; Importer seulement après Vérifier ; Marquer invités montre les introuvables", async () => {
    rendu(<AgentRuul />);
    expect(await screen.findByText("À inviter dans Ruul (1)")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Marquer invités" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Importer statuts Ruul" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Importer statuts Ruul"), { target: { value: "a@x.io ; Active\nb@x.io ; Invited" } });
    expect((screen.getByTestId("agent-ruul-importer") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("agent-ruul-verifier"));
    await screen.findByTestId("agent-ruul-apercu");
    expect(api.importerStatutsRuul).toHaveBeenCalledWith("a@x.io ; Active\nb@x.io ; Invited", true);
    fireEvent.click(screen.getByTestId("agent-ruul-importer"));
    await waitFor(() => expect(api.importerStatutsRuul).toHaveBeenCalledWith("a@x.io ; Active\nb@x.io ; Invited", false));
    fireEvent.change(screen.getByLabelText("Marquer invités"), { target: { value: "ana@gmail.com x@y.com" } });
    fireEvent.click(screen.getByTestId("agent-ruul-marquer-bouton"));
    expect((await screen.findByTestId("agent-ruul-marquer-resultat")).textContent).toContain("x@y.com");
  });

  it("sans import depuis 48 h : alerte en haut de la page et ligne dans Aujourd'hui", async () => {
    rendu(<DernierImportRuul />);
    expect((await screen.findByTestId("ruul-dernier-import")).textContent).toContain("jamais");
    const base = { pourAdrien: 0, pourMax: 0, maintenant: 0, jeudi: 0, samedi: 0, ruulAInviter: 0, jourSemaine: 3 };
    expect(lignesAujourdhui({ ...base, ruulImportHeures: null }).map((l) => l.cle)).toContain("ruul_import");
    expect(lignesAujourdhui({ ...base, ruulImportHeures: 60 }).find((l) => l.cle === "ruul_import")?.texte).toBe("Statuts Ruul pas importés depuis 2 jours");
    expect(lignesAujourdhui({ ...base, ruulImportHeures: 10 }).map((l) => l.cle)).not.toContain("ruul_import");
    expect(lignesAujourdhui({ ...base }).map((l) => l.cle)).not.toContain("ruul_import");
  });
});
