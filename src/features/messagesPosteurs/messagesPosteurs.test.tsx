import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  mesMessages: vi.fn(),
  marquerMessageLu: vi.fn(),
  repondreDouble: vi.fn(),
  monTarifSemaine: vi.fn(),
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

  it("l'offre Double (0559) : texte de Max avec le tarif, Yes, I'm in envoie oui et confirme le @", async () => {
    await i18n.changeLanguage("en");
    api.mesMessages.mockResolvedValue([offre]);
    api.monTarifSemaine.mockResolvedValue(10);
    api.marquerMessageLu.mockResolvedValue(undefined);
    api.repondreDouble.mockResolvedValue({ handle: "lea.new" });
    rendu(<PopupMessagesPosteur />);
    expect(await screen.findByText(/You've been selected for a second account/)).toBeInTheDocument();
    expect(screen.getByTestId("popup-double-texte")).toHaveTextContent("your weekly pay goes from $10 to $20.");
    await waitFor(() => expect(api.marquerMessageLu).toHaveBeenCalledWith("m1"));
    fireEvent.click(screen.getByRole("button", { name: "Yes, I'm in" }));
    await waitFor(() => expect(api.repondreDouble).toHaveBeenCalledWith("m1", "oui"));
    expect(await screen.findByText(/Your second account @lea.new is on your dashboard/)).toBeInTheDocument();
  });

  it("No thanks envoie non ; « I'll decide later » referme sans répondre ; traduit en français", async () => {
    await i18n.changeLanguage("en");
    api.mesMessages.mockResolvedValue([offre]);
    api.monTarifSemaine.mockResolvedValue(7);
    api.marquerMessageLu.mockResolvedValue(undefined);
    api.repondreDouble.mockResolvedValue({ handle: null });
    const { unmount } = rendu(<PopupMessagesPosteur />);
    fireEvent.click(await screen.findByRole("button", { name: "No thanks, keep one account" }));
    await waitFor(() => expect(api.repondreDouble).toHaveBeenCalledWith("m1", "non"));
    expect(await screen.findByText(/No problem at all/)).toBeInTheDocument();
    unmount();

    rendu(<PopupMessagesPosteur />);
    fireEvent.click(await screen.findByRole("button", { name: "I'll decide later" }));
    await waitFor(() => expect(screen.queryByTestId("popup-double")).toBeNull());

    await i18n.changeLanguage("fr");
    rendu(<PopupMessagesPosteur />);
    expect(await screen.findByText(/Tu as été sélectionné/)).toBeInTheDocument();
    expect(screen.getByTestId("popup-double-texte")).toHaveTextContent("passe de $7 à $14.");
  });

  it("le Kill en bandeau", async () => {
    api.mesMessages.mockResolvedValue([{ ...offre, id: "k", type: "kill", texte: "Hi Bo, thank you", expire_at: null }]);
    rendu(<PopupMessagesPosteur />);
    expect(await screen.findByTestId("bandeau-kill")).toHaveTextContent("Hi Bo, thank you");
  });

  it("Recréer : bloquante, seul Got it la ferme, avant l'offre Double", async () => {
    api.mesMessages.mockResolvedValue([
      offre,
      { ...offre, id: "r", type: "recreer", texte: "There was a problem with your account. Here is the new account to create: @ana.new.", expire_at: null },
    ]);
    api.marquerMessageLu.mockResolvedValue(undefined);
    rendu(<PopupMessagesPosteur />);
    expect(await screen.findByTestId("popup-recreation")).toHaveTextContent("@ana.new");
    expect(screen.queryByTestId("popup-double")).toBeNull();
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(api.marquerMessageLu).toHaveBeenCalledWith("r"));
  });

  it("l'info parrainage (0568) : après les autres, Got it ou Refer a friend la ferme", async () => {
    api.mesMessages.mockResolvedValue([
      { ...offre, id: "i", type: "info", texte: "Don't forget: if you refer a friend, you can earn $10 per friend.", expire_at: null },
    ]);
    api.marquerMessageLu.mockResolvedValue(undefined);
    rendu(<PopupMessagesPosteur />);
    expect(await screen.findByTestId("popup-info")).toHaveTextContent("$10 per friend");
    fireEvent.click(screen.getByRole("button", { name: "Refer a friend" }));
    await waitFor(() => expect(api.marquerMessageLu).toHaveBeenCalledWith("i"));
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
      kill_message_texte: "Hi {prenom}",
      double_popup_texte: "Offer",
      double_popup_expire: { jour_iso: 3, heure: "23:59" },
      recreer_popup_texte: "New @{nouveau} on Monday {date}",
      nudge_regularite_texte: "Hi {prenom}, post",
    });
    api.enregistrerReglagesMessages.mockResolvedValue(undefined);
    rendu(<ReglagesMessages />);
    // Prompt 21, A6 : l'envoi du message de Kill est un interrupteur (carte Interrupteurs), plus une case ici.
    expect(await screen.findByLabelText(/Jour d'expiration/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Message de Kill automatique/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Jour d'expiration"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(/Jeudi, message Slack du Nudge/), { target: { value: "Hi {prenom}, please post" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(api.enregistrerReglagesMessages).toHaveBeenCalledWith({
        kill_message_texte: "Hi {prenom}",
        double_popup_texte: "Offer",
        double_popup_expire: { jour_iso: 4, heure: "23:59" },
        recreer_popup_texte: "New @{nouveau} on Monday {date}",
        nudge_regularite_texte: "Hi {prenom}, please post",
      }),
    );
  });
});
