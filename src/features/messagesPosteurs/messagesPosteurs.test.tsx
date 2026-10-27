import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  mesMessages: vi.fn(),
  repondreDouble: vi.fn(),
  lireMessagesPosteurs: vi.fn(),
  creerCompteDouble: vi.fn(),
  lireReglagesMessages: vi.fn(),
  enregistrerReglagesMessages: vi.fn(),
}));
vi.mock("./api", () => api);
const auth = vi.hoisted(() => ({ roleReel: "poster" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

import { PopupMessagesPosteur } from "./PopupMessagesPosteur";
import { ReglagesMessages } from "./ReglagesMessages";
import { SuiviMessages } from "./SuiviMessages";

function rendu(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const offre = {
  id: "m1",
  type: "double",
  texte: "You post really well! Do you want a second TikTok account?",
  expire_at: "2026-11-04T22:59:00Z",
  created_at: "2026-10-31T10:00:00Z",
};

describe("PopupMessagesPosteur", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.roleReel = "poster";
    await i18n.changeLanguage("fr");
  });

  it("l'offre Double, en anglais, Yes envoie oui", async () => {
    api.mesMessages.mockResolvedValue([offre]);
    api.repondreDouble.mockResolvedValue(undefined);
    rendu(<PopupMessagesPosteur />);
    expect(await screen.findByText(/second TikTok account/)).toBeInTheDocument();
    expect(screen.getByText(/Answer before Wednesday 4 November/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(api.repondreDouble).toHaveBeenCalledWith("m1", "oui"));
    expect(await screen.findByText(/second account is being set up/)).toBeInTheDocument();
  });

  it("No envoie non", async () => {
    api.mesMessages.mockResolvedValue([offre]);
    api.repondreDouble.mockResolvedValue(undefined);
    rendu(<PopupMessagesPosteur />);
    fireEvent.click(await screen.findByRole("button", { name: "No" }));
    await waitFor(() => expect(api.repondreDouble).toHaveBeenCalledWith("m1", "non"));
  });

  it("le Kill en bandeau", async () => {
    api.mesMessages.mockResolvedValue([{ ...offre, id: "k", type: "kill", texte: "Hi Bo, thank you", expire_at: null }]);
    rendu(<PopupMessagesPosteur />);
    expect(await screen.findByTestId("bandeau-kill")).toHaveTextContent("Hi Bo, thank you");
  });

  it("rien pour l'admin qui traverse l'espace", () => {
    auth.roleReel = "admin";
    rendu(<PopupMessagesPosteur />);
    expect(api.mesMessages).not.toHaveBeenCalled();
  });
});

describe("SuiviMessages", () => {
  const ligne = {
    id: "m1", poster_id: "p", poster_nom: "Ana Silva", hm_id: "h", hm_prenom: "Kris", compte_id: "c",
    proposition_id: "prop", semaine: "2026-10-31", type: "double", texte: "x", statut: "acceptee_compte_a_creer",
    visible_de: "2026-10-31T23:00:00Z", expire_at: "2026-11-04T22:59:00Z", lu_at: null, reponse: "oui",
    repondu_at: "2026-11-01T10:00:00Z", slack_statut: null, slack_at: null, erreur: "aucun autre label",
    nouveau_compte_id: null, created_at: "2026-10-31T10:00:00Z",
  };
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
  });

  it("admin : statut, erreur et relance de la création", async () => {
    api.lireMessagesPosteurs.mockResolvedValue([ligne, { ...ligne, id: "k", type: "kill", statut: "envoye", slack_statut: "envoye", erreur: null }]);
    api.creerCompteDouble.mockResolvedValue(undefined);
    rendu(<SuiviMessages admin />);
    expect(await screen.findByText("Accepté, compte à créer")).toBeInTheDocument();
    expect(screen.getByText("aucun autre label")).toBeInTheDocument();
    expect(screen.getByText(/Slack envoyé/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Créer le 2ᵉ compte" }));
    await waitFor(() => expect(api.creerCompteDouble).toHaveBeenCalledWith("prop"));
  });

  it("HM : lecture seule", async () => {
    api.lireMessagesPosteurs.mockResolvedValue([ligne]);
    rendu(<SuiviMessages admin={false} />);
    expect(await screen.findByText("Accepté, compte à créer")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Rien à faire de ton côté/)).toBeInTheDocument();
  });
});

describe("ReglagesMessages", () => {
  it("enregistre les réglages modifiés", async () => {
    await i18n.changeLanguage("fr");
    api.lireReglagesMessages.mockResolvedValue({
      kill_message_auto: true,
      kill_message_texte: "Hi {prenom}",
      double_popup_texte: "Offer",
      double_popup_expire: { jour_iso: 3, heure: "23:59" },
    });
    api.enregistrerReglagesMessages.mockResolvedValue(undefined);
    rendu(<ReglagesMessages />);
    fireEvent.click(await screen.findByLabelText(/Message de Kill automatique/));
    fireEvent.change(screen.getByLabelText("Jour d'expiration"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(api.enregistrerReglagesMessages).toHaveBeenCalledWith({
        kill_message_auto: false,
        kill_message_texte: "Hi {prenom}",
        double_popup_texte: "Offer",
        double_popup_expire: { jour_iso: 4, heure: "23:59" },
      }),
    );
  });
});
