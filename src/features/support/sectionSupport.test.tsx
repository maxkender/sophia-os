import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type * as React from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bot = vi.hoisted(() => ({
  simuler: vi.fn(),
  chercherPosteurs: vi.fn(),
  lireConsignes: vi.fn(),
  enregistrerConsigne: vi.fn(),
  lireHistoriqueConsigne: vi.fn(),
  restaurerConsigne: vi.fn(),
  lireTests: vi.fn(),
  lancerTests: vi.fn(),
  lireInfos: vi.fn(),
  lireHistoriqueInfos: vi.fn(),
  modifierInfo: vi.fn(),
  enregistrerEntree: vi.fn(),
}));
vi.mock("@/features/bot/api", async (orig) => ({ ...(await orig<typeof import("@/features/bot/api")>()), ...bot }));
const sup = vi.hoisted(() => ({
  lireSupport: vi.fn(), lireNiveaux: vi.fn(), lireDemandesDe: vi.fn(), lireMesDemandes: vi.fn(), lireMaPlateforme: vi.fn(),
  lireToutes: vi.fn(), lireCapacites: vi.fn(), lireDetail: vi.fn(), envoyerReponse: vi.fn(), changer: vi.fn(), envoyerTicket: vi.fn(),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...sup }));
vi.mock("@/features/auto/aujourdhui/api", () => ({ lireAujourdhui: vi.fn().mockResolvedValue({ pour_max: 2, pour_adrien: 14, ruul_a_inviter: 117 }) }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ user: { id: "admin" }, role: "admin" }) }));

import i18n from "@/locales";
import { cleRegle } from "@/features/bot/api";

import { SectionSupport } from "./SectionSupport";

function rendu(el: React.ReactElement, url = "/admin/auto/support") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[url]}>{el}</MemoryRouter></QueryClientProvider>);
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
  sup.lireSupport.mockResolvedValue([]);
  sup.lireToutes.mockResolvedValue([]);
  sup.lireCapacites.mockResolvedValue({ reponse: new Date().toISOString(), ticket: "2026-10-01T00:00:00Z" });
  sup.lireNiveaux.mockResolvedValue(new Map());
  bot.lireInfos.mockResolvedValue([{ cle: "jour_paie", titre: "Jour de paie", valeur: "Every Monday.", ordre: 5, maj_at: "2026-11-12T00:00:00Z" }]);
  bot.lireHistoriqueInfos.mockResolvedValue([{ id: "h1", cle: "jour_paie", avant: "Every Tuesday.", apres: "Every Monday.", at: "2026-11-11T00:00:00Z" }]);
  bot.lireConsignes.mockResolvedValue([]);
  bot.lireTests.mockResolvedValue([{ id: "t1", actif: true, dernier_ok: true }]);
  bot.lancerTests.mockResolvedValue({ total: 1, verts: 0, resultats: [{ id: "t1", ok: false, niveau: "bot", reponse: "", action: null }] });
});

describe("Support (OS clair)", () => {
  it("13/11 : À répondre (Max d'abord), la fiche, ce que le bot a répondu ; Envoyer + Apprendre au bot (règle)", async () => {
    const base = {
      poster_id: "p", type: "question" as const, source: "help", categorie: null, plateforme: "ruul", statut: "ouvert" as const, niveau: "adrien",
      bot_reponse: "Your posts are saved.", auto_action: null, auto_resultat: null, action_faite: null, ticket_at: null, equipe_at: null,
      resolu_par_bot: false, posteur_at: null, email: "ana@test.zz",
    };
    sup.lireToutes.mockResolvedValue([
      { ...base, id: "a", texte: "My link doesn't show", cree_at: "2026-11-13T08:00:00Z", escalade_at: "2026-11-13T08:00:00Z", nom: "Ana T." },
      { ...base, id: "m", texte: "Milestone not paid", niveau: "max", plateforme: "upwork", cree_at: "2026-11-13T10:00:00Z", escalade_at: "2026-11-13T10:00:00Z", nom: "Leo M." },
      { ...base, id: "r", texte: "Old", statut: "resolu" as const, cree_at: "2026-11-12T08:00:00Z", escalade_at: null, nom: "Zoe" },
    ]);
    sup.lireDetail.mockImplementation(async (id: string) => ({
      id, type: "question", categorie: null, plateforme: "ruul", source: "help", statut: "ouvert", texte: "x", capture: null,
      brouillon: id === "a" ? "We added your post." : null, bot_reponse: null, auto_action: null, auto_resultat: null, slack_user: null,
      escalade_at: null, urgence: "gris", en_retard: false, poster_id: "p",
      messages: [{ auteur: "bot", texte: "Your posts are saved.", cree_at: "2026-11-13T08:01:00Z" }],
      fiche: { poster_id: "p", nom: "Ana T.", plateforme: "ruul", debut: "2026-11-16", premiere_connexion: null, slack_relie: true, tiktok: "ana.x",
        ruul: { statut: "invite", email_ruul: true, pret_at: null, premier_paiement_at: null }, contrat_upwork: null, parrainages: null, derniere_paie: null, manque: [] },
    }));
    sup.envoyerReponse.mockResolvedValue({ envois: { email: "ok" } });
    bot.enregistrerConsigne.mockResolvedValue("c1");
    rendu(<SectionSupport />, "/admin/auto/support?onglet=repondre");
    const cartes = await screen.findAllByTestId("carte-a-repondre");
    expect(cartes).toHaveLength(2);
    // L'argent (Pour Max) d'abord.
    expect(cartes[0]).toHaveTextContent("Leo M.");
    expect(within(cartes[0]!).getByTestId("qui-a-agi")).toHaveTextContent("Pour Max");
    const a = cartes[1]!;
    expect(within(a).getByTestId("qui-a-agi")).toHaveTextContent("Répondu par le bot");
    expect(within(a).getByTestId("qui-a-agi")).toHaveTextContent("Renvoyée par le posteur");
    await waitFor(() => expect(within(a).getByTestId("reponse-admin")).toHaveValue("We added your post."));
    expect(within(a).getByTestId("fiche-posteur")).toHaveTextContent("Ruul");
    expect(within(a).getByTestId("apprendre")).toBeChecked();
    fireEvent.click(within(a).getByTestId("envoyer-admin"));
    await waitFor(() => expect(sup.envoyerReponse).toHaveBeenCalledWith("a", "We added your post."));
    await waitFor(() => expect(bot.enregistrerConsigne).toHaveBeenCalledWith(null, expect.stringContaining("My link doesn't show"), true));
  });

  it("13/11 : Toutes les demandes (filtre « qui a agi ») et le tableau « Ce que le bot peut faire tout seul »", async () => {
    sup.lireToutes.mockResolvedValue([
      { id: "t", poster_id: "p", type: "probleme", source: "help", categorie: "bug", plateforme: "upwork", statut: "ouvert", niveau: "adrien", texte: "White page",
        bot_reponse: null, auto_action: null, auto_resultat: null, action_faite: null, ticket_at: "2026-11-13T09:00:00Z", equipe_at: null, escalade_at: null,
        resolu_par_bot: null, cree_at: "2026-11-13T09:00:00Z", nom: "Eva L.", email: "eva@test.zz" },
      { id: "p2", poster_id: "q", type: "probleme", source: "help", categorie: "connexion", plateforme: "ruul", statut: "resolu", niveau: "bot", texte: "No password",
        bot_reponse: "Sent.", auto_action: "lien_mot_de_passe", auto_resultat: "envoyé", action_faite: "envoyé", ticket_at: null, equipe_at: null, escalade_at: null,
        resolu_par_bot: true, cree_at: "2026-11-13T08:00:00Z", nom: "Mia K.", email: "mia@test.zz" },
    ]);
    rendu(<SectionSupport />, "/admin/auto/support?onglet=toutes");
    expect(await screen.findAllByTestId("ligne-toutes")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Qui a agi"), { target: { value: "os_tickets" } });
    expect(screen.getAllByTestId("ligne-toutes")).toHaveLength(1);
    expect(screen.getByTestId("ligne-toutes")).toHaveTextContent("→ OS tickets");
    fireEvent.change(screen.getByLabelText("Qui a agi"), { target: { value: "mot_de_passe" } });
    expect(screen.getByTestId("ligne-toutes")).toHaveTextContent("Mia K.");
  });

  it("l'onglet vient de l'adresse (?onglet=regles) : une règle se modifie en 2 clics et garde son historique", async () => {
    bot.modifierInfo.mockResolvedValue(undefined);
    rendu(<SectionSupport />, "/admin/auto/support?onglet=regles");
    const ligne = await screen.findByTestId("regle-ligne");
    fireEvent.click(within(ligne).getByRole("button", { name: /Jour de paie/ }));
    fireEvent.change(within(ligne).getByLabelText("Jour de paie"), { target: { value: "Every Monday at noon." } });
    fireEvent.click(within(ligne).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(bot.modifierInfo).toHaveBeenCalledWith("jour_paie", "Jour de paie", "Every Monday at noon."));
    expect(within(ligne).getByText(/Historique \(1\)/)).toBeInTheDocument();
    // Les règles suggérées : Max met la valeur, rien n'est inventé.
    fireEvent.click(screen.getByRole("button", { name: "+ Posts par jour" }));
    expect(screen.getByLabelText("Nom de la règle")).toHaveValue("Posts par jour");
    expect(screen.getByLabelText("Valeur de la règle")).toHaveValue("");
    expect(cleRegle("Date limite de signature")).toBe("date_limite_de_signature");
  });

  it("Consignes : une phrase, appliquée, puis les tests relancés (et la régression signalée)", async () => {
    bot.enregistrerConsigne.mockResolvedValue("c1");
    rendu(<SectionSupport />, "/admin/auto/support?onglet=consignes");
    fireEvent.change(await screen.findByLabelText("Nouvelle consigne"), { target: { value: "Ne promets jamais une date de paie autre que le lundi." } });
    fireEvent.click(screen.getByTestId("consigne-ajouter"));
    await waitFor(() => expect(bot.enregistrerConsigne).toHaveBeenCalledWith(null, "Ne promets jamais une date de paie autre que le lundi.", true));
    const b = await screen.findByTestId("consigne-bilan");
    expect(b).toHaveTextContent("Tests relancés : 0/1 verts");
    expect(b).toHaveTextContent("1 test(s) qui passaient échouent maintenant");
  });

  it("Aperçu posteur : la page Help d'un faux profil Ruul, une question passe par le bot en simulation", async () => {
    bot.simuler.mockResolvedValue({
      decision: { langue: "en", categorie: "paie", personnel: true, reponse: "You're paid every Monday.", action: null, action_valeur: null, niveau: "bot", regle: null, risque: [], raison: "" },
      texte: "You're paid every Monday.\n\n— the Vik Studios team", regle_utilisee: null, plateforme: "ruul", action_prevue: null,
    });
    rendu(<SectionSupport />, "/admin/auto/support?onglet=apercu");
    fireEvent.click(screen.getByRole("button", { name: "Faux profil Ruul" }));
    const a = await screen.findByTestId("apercu-help");
    fireEvent.change(within(a).getByTestId("saisie-chat"), { target: { value: "When do I get paid?" } });
    fireEvent.click(within(a).getByRole("button", { name: "Send" }));
    await within(a).findByText(/You're paid every Monday/);
    expect(bot.simuler).toHaveBeenCalledWith(expect.objectContaining({ message: "When do I get paid?", poster_id: null, profil: expect.objectContaining({ plateforme: "ruul" }) }));
    expect(sup.lireMesDemandes).not.toHaveBeenCalled();
    // Un problème ne part pas depuis l'aperçu.
    fireEvent.click(within(a).getByTestId("help-signaler"));
    expect(within(a).getByText(/un problème n'est pas envoyé depuis l'aperçu/)).toBeInTheDocument();
  });
});
