import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/locales/index";

import { BoutonKill } from "./KillProbleme";

const apercu = vi.fn();
const executer = vi.fn();
vi.mock("./api", () => ({
  apercuKill: (...a: unknown[]) => apercu(...a),
  executerKill: (...a: unknown[]) => executer(...a),
}));

const info = {
  contrat_id: "44716522", titre: "TikTok Content Posting — Slovenian", organisation: "VIk Studios", statut: "ACTIVE",
  jalons: [], plan: { decision: "fermer", raison: null, montant: 10, en_cours: { nom: "Week 44", depot: 10, etat: "Active" } },
};

function rendre() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><BoutonKill p={{ id: "x", nom: "Test A", poster_id: "p1" }} libelle="Kill" /></QueryClientProvider>);
}

describe("BoutonKill", () => {
  it("affiche le contrat lié et le milestone, case cochée par défaut, et envoie le choix", async () => {
    await i18n.changeLanguage("fr");
    apercu.mockResolvedValue({ ...info, mode: "on" });
    executer.mockResolvedValue({ ...info, texte: "Compte désactivé · Contrat 44716522 fermé · 10 $ en retour" });
    rendre();
    fireEvent.click(screen.getByTestId("bouton-kill"));
    const contrat = await screen.findByTestId("contrat-kill");
    expect(contrat.textContent).toContain("44716522");
    expect(contrat.textContent).toContain("« Week 44 » · Active · 10 $");
    expect(contrat.textContent).toContain("Financé non payé : 10 $");
    expect((screen.getByTestId("case-fermer") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId("confirmer-kill"));
    await waitFor(() => expect(executer).toHaveBeenCalledWith("x", true));
    expect((await screen.findByTestId("resultat-kill")).textContent).toBe("Compte désactivé · Contrat 44716522 fermé · 10 $ en retour");
  });

  it("case décochée : le contrat reste ouvert ; mode test affiché", async () => {
    await i18n.changeLanguage("fr");
    apercu.mockResolvedValue({ ...info, mode: "test" });
    executer.mockResolvedValue({ ...info, texte: "Mode test : rien n'est exécuté." });
    rendre();
    fireEvent.click(screen.getByTestId("bouton-kill"));
    expect(await screen.findByText(/Mode test : la page n'exécute rien/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("case-fermer"));
    fireEvent.click(screen.getByTestId("confirmer-kill"));
    await waitFor(() => expect(executer).toHaveBeenCalledWith("x", false));
  });
});
