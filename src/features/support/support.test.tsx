import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lireMesDemandes: vi.fn(),
  lireMaPlateforme: vi.fn(),
  poserQuestion: vi.fn(),
  signalerProbleme: vi.fn(),
  actionPosteur: vi.fn(),
  deposerCapture: vi.fn(),
  lireSupport: vi.fn(),
  lireNiveaux: vi.fn(),
  lireDetail: vi.fn(),
  envoyerReponse: vi.fn(),
  changer: vi.fn(),
  versOfficielles: vi.fn(),
  lienCapture: vi.fn(),
  envoyerTicket: vi.fn(),
  analyserContexte: vi.fn(),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ user: { id: "p1" } }) }));

import i18n from "@/locales";
import { age, filtrer, statutPosteur, type LigneSupport } from "./api";
import { PageHelp } from "./PageHelp";
import { PageSupport } from "./PageSupport";

function rendu(el: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);
}

const ligne = (x: Partial<LigneSupport>): LigneSupport => ({
  id: "x", type: "probleme", categorie: "autre", plateforme: "upwork", source: "help", statut: "ouvert", extrait: "…",
  escalade_at: "2026-11-11T08:00:00Z", cree_at: "2026-11-11T08:00:00Z", posteur_at: null, equipe_at: null, resolu_at: null,
  urgence: "gris", en_retard: false, poster_id: "p", nom: "Ana", messages: 0, ...x,
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
});

describe("Support, logique (0671)", () => {
  it("statut du posteur : Received / In progress / Solved", () => {
    expect(statutPosteur({ statut: "ouvert", equipe_a_repondu: false })).toBe("recu");
    expect(statutPosteur({ statut: "attente_posteur", equipe_a_repondu: true })).toBe("en_cours");
    expect(statutPosteur({ statut: "resolu", equipe_a_repondu: true })).toBe("resolu");
  });

  it("tri : urgence puis ancienneté ; filtres plateforme, retard ; un onglet à la fois", () => {
    const l = [
      ligne({ id: "g", urgence: "gris", escalade_at: "2026-11-10T00:00:00Z" }),
      ligne({ id: "r", urgence: "rouge", categorie: "paiement", escalade_at: "2026-11-11T09:00:00Z", plateforme: "ruul" }),
      ligne({ id: "o", urgence: "orange", categorie: "compte", escalade_at: "2026-11-11T07:00:00Z", en_retard: true }),
      ligne({ id: "q", type: "question" }),
      ligne({ id: "s", statut: "resolu" }),
    ];
    const vide = { plateforme: "" as const, categorie: "", statut: "" as const, retard: false };
    expect(filtrer(l, "probleme", vide).map((x) => x.id)).toEqual(["r", "o", "g"]);
    // 12/11 (Support propre) : le niveau ; sans niveau, la demande est pour Adrien.
    const niveaux = new Map<string, string | null>([["r", "max"], ["o", "adrien"]]);
    expect(filtrer(l, "probleme", { ...vide, niveau: "max" }, niveaux).map((x) => x.id)).toEqual(["r"]);
    expect(filtrer(l, "probleme", { ...vide, niveau: "adrien" }, niveaux).map((x) => x.id)).toEqual(["o", "g"]);
    expect(filtrer(l, "probleme", { ...vide, plateforme: "ruul" }).map((x) => x.id)).toEqual(["r"]);
    expect(filtrer(l, "probleme", { ...vide, retard: true }).map((x) => x.id)).toEqual(["o"]);
    expect(filtrer(l, "probleme", { ...vide, statut: "resolu" }).map((x) => x.id)).toEqual(["s"]);
    expect(filtrer(l, "question", vide).map((x) => x.id)).toEqual(["q"]);
  });

  it("âge court", () => {
    const t0 = new Date("2026-11-11T10:00:00Z").getTime();
    expect(age("2026-11-11T09:30:00Z", t0)).toBe("30 min");
    expect(age("2026-11-11T05:00:00Z", t0)).toBe("5 h");
    expect(age("2026-11-08T10:00:00Z", t0)).toBe("3 d");
  });
});

describe("PageHelp (posteur)", () => {
  it("Ruul : « Ruul account », jamais « Upwork contract » ; la question reçoit la réponse du bot et deux boutons", async () => {
    api.lireMaPlateforme.mockResolvedValue("ruul");
    api.lireMesDemandes.mockResolvedValue([]);
    api.poserQuestion.mockResolvedValue({ id: "q1", reponse: "You are paid every Monday.", envoye_equipe: false });
    rendu(<PageHelp />);
    fireEvent.click(await screen.findByTestId("help-signaler"));
    await waitFor(() => expect(screen.getByTestId("categorie-compte")).toHaveTextContent("Ruul account"));
    expect(screen.getByTestId("form-probleme")).not.toHaveTextContent("Upwork");

    fireEvent.click(screen.getByTestId("help-demander"));
    fireEvent.change(screen.getByPlaceholderText("Write your question…"), { target: { value: "When am I paid?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const rep = await screen.findByTestId("reponse-bot");
    expect(rep).toHaveTextContent("You are paid every Monday.");
    expect(within(rep).getByRole("button", { name: "This solved it" })).toBeInTheDocument();
    fireEvent.click(within(rep).getByRole("button", { name: "I still need help" }));
    await waitFor(() => expect(api.actionPosteur).toHaveBeenCalledWith("q1", "aide"));
  });

  it("Upwork : « Upwork contract » ; le problème part avec sa catégorie ; mes problèmes avec statut et fil", async () => {
    api.lireMaPlateforme.mockResolvedValue("upwork");
    api.lireMesDemandes.mockResolvedValue([
      { id: "d1", type: "probleme", categorie: "paiement", texte: "Not paid", statut: "attente_posteur", equipe_a_repondu: true,
        cree_at: "2026-11-11T08:00:00Z", resolu_at: null, messages: [{ auteur: "equipe", texte: "Paid today.", cree_at: "2026-11-11T09:00:00Z" }] },
    ]);
    api.signalerProbleme.mockResolvedValue({ id: "d2", reponse: "ok" });
    rendu(<PageHelp />);
    const mes = await screen.findByTestId("mes-problemes");
    await waitFor(() => expect(within(mes).getByTestId("statut")).toHaveTextContent("In progress"));
    expect(mes).toHaveTextContent("Paid today.");
    fireEvent.click(screen.getByTestId("help-signaler"));
    await waitFor(() => expect(screen.getByTestId("categorie-compte")).toHaveTextContent("Upwork contract"));
    fireEvent.click(screen.getByTestId("categorie-paiement"));
    fireEvent.change(screen.getByPlaceholderText("Explain what happens and what you already tried."), { target: { value: "My milestone was not paid" } });
    fireEvent.click(within(screen.getByTestId("form-probleme")).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(api.signalerProbleme).toHaveBeenCalledWith({ categorie: "paiement", texte: "My milestone was not paid", capture: null }));
  });
});

describe("PageSupport (admin)", () => {
  it("onglets avec compteur, pastille, Late, panneau : fiche, brouillon modifiable, Send reply + Add to official answers", async () => {
    api.lireNiveaux.mockResolvedValue(new Map([["a", "max"], ["b", null]]));
    api.lireSupport.mockResolvedValue([
      ligne({ id: "a", urgence: "rouge", categorie: "paiement", en_retard: true, nom: "Ana", plateforme: "ruul" }),
      ligne({ id: "b", type: "question", nom: "Bo" }),
    ]);
    api.lireDetail.mockResolvedValue({
      id: "a", type: "probleme", categorie: "paiement", plateforme: "ruul", source: "help", statut: "ouvert", texte: "Not paid",
      capture: null, brouillon: "We are checking your payment.", bot_reponse: null, auto_action: null, auto_resultat: null, slack_user: null,
      escalade_at: "2026-11-11T08:00:00Z", urgence: "rouge", en_retard: true, poster_id: "p",
      messages: [],
      fiche: { poster_id: "p", nom: "Ana B", plateforme: "ruul", debut: "2026-11-16", premiere_connexion: null, slack_relie: true, tiktok: "ana.x",
        ruul: { statut: "invite", email_ruul: true, pret_at: null, premier_paiement_at: null }, contrat_upwork: null,
        parrainages: { declares: 1, invites: 0, recrues: 0 }, derniere_paie: null, manque: ["finish your Ruul account"] },
    });
    api.envoyerReponse.mockResolvedValue({ envois: { email: "ok" } });
    api.versOfficielles.mockResolvedValue(undefined);
    rendu(<PageSupport />);
    const l = await screen.findByTestId("support-ligne");
    expect(screen.getByTestId("onglet-probleme")).toHaveTextContent("1");
    expect(screen.getByTestId("onglet-question")).toHaveTextContent("1");
    expect(within(l).getByTestId("pastille-rouge")).toBeInTheDocument();
    expect(l).toHaveTextContent("Late");
    fireEvent.click(l);
    const p = await screen.findByTestId("support-panneau");
    expect(within(p).getByTestId("support-fiche")).toHaveTextContent("finish your Ruul account");
    expect(within(p).getByTestId("support-reponse")).toHaveValue("We are checking your payment.");
    fireEvent.click(within(p).getByTestId("support-officielle"));
    fireEvent.click(within(p).getByTestId("support-envoyer"));
    await waitFor(() => expect(api.envoyerReponse).toHaveBeenCalledWith("a", "We are checking your payment."));
    await waitFor(() => expect(api.versOfficielles).toHaveBeenCalledWith({ question: "Not paid", reponse: "We are checking your payment.", portee: "ruul", categorie: "paiement" }));
    // 12/11 : la paie a son badge rouge et passe en premier.
    expect(within(l).getByTestId("badge-paie")).toHaveTextContent("Paie");
  });

  it("12/11 : « Envoyer en ticket à l'OS » (avec une note) et « Avoir le contexte »", async () => {
    api.lireNiveaux.mockResolvedValue(new Map([["a", null]]));
    api.lireSupport.mockResolvedValue([ligne({ id: "a", categorie: "bug", nom: "Leidy" })]);
    api.lireDetail.mockResolvedValue({
      id: "a", type: "probleme", categorie: "bug", plateforme: "upwork", source: "slack_salon", statut: "ouvert", texte: "Blank screen again",
      capture: null, brouillon: null, bot_reponse: null, auto_action: null, auto_resultat: null, slack_user: "Leidy",
      escalade_at: "2026-11-11T08:00:00Z", urgence: "orange", en_retard: false, poster_id: "p", messages: [], fiche: null,
      ticket_at: null, contexte_analyse: null, contexte_at: null,
    });
    api.envoyerTicket.mockResolvedValue({ ticket_at: "2026-11-12T18:00:00Z" });
    api.analyserContexte.mockResolvedValue({ analyse: "- Upwork, actif depuis le 26/10\n- Écran blanc signalé 2 fois", contexte_at: "2026-11-12T18:00:00Z" });
    rendu(<PageSupport />);
    fireEvent.click(await screen.findByTestId("support-ligne"));
    const p = await screen.findByTestId("support-panneau");
    fireEvent.change(within(p).getByLabelText("Note pour le ticket"), { target: { value: "2e fois" } });
    fireEvent.click(within(p).getByTestId("support-ticket"));
    await waitFor(() => expect(api.envoyerTicket).toHaveBeenCalledWith("a", "2e fois"));
    fireEvent.click(within(p).getByTestId("support-contexte"));
    await waitFor(() => expect(api.analyserContexte).toHaveBeenCalledWith("a"));
    expect(await within(p).findByTestId("support-analyse")).toHaveTextContent("Écran blanc signalé 2 fois");
  });
});
