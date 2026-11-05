import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales/index";

import type { Probleme } from "./api";
import { BlocDecision } from "./DecisionProbleme";

const decider = vi.fn(async (_id: string, i: number) => ({ libelle: String(i) }));
const envoyer = vi.fn(async () => undefined);
const motDePasse = vi.fn(async () => undefined);
vi.mock("./api", () => ({
  deciderProbleme: (...a: unknown[]) => decider(...(a as [string, number])),
  envoyerUpwork: (...a: unknown[]) => envoyer(...(a as [])),
  envoyerLienMotDePasse: (...a: unknown[]) => motDePasse(...(a as [])),
  dejaEcritAujourdhui: vi.fn(async () => false),
}));

const base: Probleme = {
  id: "d1", poster_id: "00000000-0000-0000-0000-000000000001", contrat_id: "1234", nom: "Test A", hm: null, cohorte: null, actif: true,
  categorie: "paie", niveau: "bots", resume: "r", sources: [], proprietaire: "pay_bot", proposition_reponse: null, canal_reponse: null,
  proposition_action: "decision", propose_par: "os", propose_at: null, statut: "ouvert", ferme_raison: null, ferme_at: null,
  created_at: "2026-11-03T10:00:00Z", maj_at: "2026-11-03T10:00:00Z", slack_relie: true, compte_id: null,
  question: "Week 45 : financer 14 $ ou 28 $ ?",
  options: [
    { libelle: "14 $", paie: true, lien: "https://www.upwork.com/nx/wm/workroom/1234/overview", recommande: true },
    { libelle: "28 $", paie: true, lien: "https://www.upwork.com/nx/wm/workroom/1234/overview" },
  ],
  sujet: "posteur", destinataire: "posteur",
};

function rendre(p: Probleme, mode: "test" | "on" = "test") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BlocDecision p={p} mode={mode} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("BlocDecision", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    vi.clearAllMocks();
  });

  it("paie : la recommandée en premier ; le bouton ouvre le contrat Upwork, l'OS ne paie pas", async () => {
    const ouvrir = vi.spyOn(window, "open").mockImplementation(() => null);
    rendre(base);
    expect(screen.getByTestId("question").textContent).toBe("Week 45 : financer 14 $ ou 28 $ ?");
    expect(screen.getByTestId("option-0").textContent).toContain("(recommandé)");
    expect(screen.getByTestId("option-1").textContent).not.toContain("recommandé");
    fireEvent.click(screen.getByTestId("option-1"));
    expect(await screen.findByText("Contrat Upwork ouvert : la paie se fait là-bas, l'OS ne paie jamais.")).toBeTruthy();
    expect(ouvrir).toHaveBeenCalledWith("https://www.upwork.com/nx/wm/workroom/1234/overview", "_blank", "noopener,noreferrer");
    expect(decider).toHaveBeenCalledWith("d1", 1, false);
    expect(envoyer).not.toHaveBeenCalled();
  });

  const posteur: Probleme = {
    ...base, categorie: "autre", question: "Démarrage envoyé à tort. Que faire ?",
    options: [{ libelle: "Garder le 9 nov + excuse", reponse: "Hi, sorry." }, { libelle: "Démarrer maintenant", reponse: "Hi, start now." }],
  };

  it("mode test : le choix est noté, rien ne part", async () => {
    rendre(posteur, "test");
    expect(screen.getByTestId("reponses-options").textContent).toContain("« Hi, sorry. »");
    fireEvent.click(screen.getByTestId("option-0"));
    expect(await screen.findByText("Mode test : noté, rien n'est parti.")).toBeTruthy();
    expect(decider).toHaveBeenCalledWith("d1", 0, false);
    expect(envoyer).not.toHaveBeenCalled();
  });

  it("mode on : la réponse liée part au posteur (avec la ligne STOP), puis le choix est noté", async () => {
    rendre(posteur, "on");
    fireEvent.click(screen.getByTestId("option-1"));
    expect(await screen.findByText("Choix enregistré, réponse envoyée.")).toBeTruthy();
    expect(envoyer).toHaveBeenCalledWith(posteur.poster_id, expect.stringMatching(/^Hi, start now\.[\s\S]*STOP/));
    expect(decider).toHaveBeenCalledWith("d1", 1, true);
  });

  it("offre / HM : la réponse à l'HM est à copier, jamais envoyée ; « Autre » demande le texte", async () => {
    const offre: Probleme = {
      ...base, poster_id: null, categorie: "offre_hm_incorrecte", sujet: "offre", destinataire: "hm", hm_nom: "HM Test",
      question: "Offre envoyée hors VIk. Que faire ?",
      options: [{ libelle: "Demander à l'HM de la renvoyer", reponse: "Hi, please resend it from VIk." }, { libelle: "Autre (j'écris la réponse)" }],
    };
    const { unmount } = rendre(offre, "on");
    fireEvent.click(screen.getByTestId("option-0"));
    expect((await screen.findByTestId("a-copier")).textContent).toContain("Hi, please resend it from VIk.");
    expect(screen.getByText("Réponse à envoyer à HM Test (DM Slack, à copier) :")).toBeTruthy();
    expect(envoyer).not.toHaveBeenCalled();
    expect(decider).toHaveBeenCalledWith("d1", 0, false);
    unmount();

    rendre(offre, "on");
    fireEvent.click(screen.getByTestId("option-1"));
    expect(screen.getByTestId("option-libre")).toBeTruthy();
    expect(decider).not.toHaveBeenCalledWith("d1", 1, expect.anything());
  });
});
