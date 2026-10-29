import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import { messageRepondu, type MessageEnvoye } from "./api";
import { CLES_TEXTES, ecrireTexte, GROUPES_TEXTES, lireTexte, TEXTES } from "./catalogue";
import { filtrerMessages } from "./journal";
import { erreursTiming, lireTiming, valeursTiming } from "./timing";

const reglages = vi.hoisted(() => ({
  valeurs: {} as Record<string, unknown>,
  ecrireReglages: vi.fn<(v: Record<string, unknown>) => Promise<void>>(async () => undefined),
}));
vi.mock("@/features/reglagesOs/api", async (orig) => ({
  ...(await orig<typeof import("@/features/reglagesOs/api")>()),
  lireReglagesBruts: vi.fn(async (cles: readonly string[]) =>
    Object.fromEntries(cles.filter((c) => c in reglages.valeurs).map((c) => [c, reglages.valeurs[c]]))),
  ecrireReglages: reglages.ecrireReglages,
  lireJournal: vi.fn(async () => []),
}));
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));
const envois = vi.hoisted(() => ({ lireMessagesEnvoyes: vi.fn(async () => [] as MessageEnvoye[]) }));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...envois }));
vi.mock("@/features/nudges/PageNudges", () => ({
  StatsRelances: () => <div data-testid="stats-relances" />,
  Prevues: () => <div data-testid="relances-prevues" />,
}));
vi.mock("@/features/regles/ReglagesRegles", () => ({ ReglagesRegles: () => <div data-testid="reglages-regles" /> }));
const attente = vi.hoisted(() => ({
  envoyerFile: vi.fn(async () => ({ ok: true, envoyes: 1, perimes: 0, doublons: 0, upwork_bloque: 1 })),
}));
vi.mock("./attenteApi", async (orig) => ({ ...(await orig<typeof import("./attenteApi")>()), ...attente }));

import { PageMessagesEnvoyes } from "./PageMessagesEnvoyes";

function rendu(entree = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entree]}>
        <PageMessagesEnvoyes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const m = (o: Partial<MessageEnvoye>): MessageEnvoye => ({
  at: "2026-10-28T10:00:00Z", poster_id: "p1", poster_nom: "Ana Silva", type: "connexion", canal: "slack", etat: "envoye",
  texte: "Hi Ana", detail: null, reaction: null, reaction_at: null, source: "nudges", ref: "n1", ...o,
});

describe("Messages sent (prompt 22, partie 6)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    reglages.valeurs = {
      accueil_message_texte: "Hi {prenom}, welcome! {url}",
      relance_texte_compte_tiktok: "create @{handle} {oops}",
      lien_1000: { message: "Congrats @{handle}: {lien}", seuil: 1000, liens: { sophia: "taap.it/sophia.culture" } },
      reponse_texte_absent: "",
      etapes_delais: { kill_h: 48, kill_annulation_h: 12, autre: 7 },
      double_popup_expire: { jour_iso: 3, heure: "23:59" },
    };
    await i18n.changeLanguage("fr");
  });

  it("6 onglets : Journal, À la main, Prévu, Aperçu, Textes, Délais (plus de To approve) ; ?onglet= ouvre le bon", async () => {
    rendu("/?onglet=prevus");
    const onglets = await screen.findByRole("tablist", { name: "Onglets de Messages envoyés" });
    expect(within(onglets).getAllByRole("tab").map((o) => o.textContent)).toEqual(["Journal", "À la main (HM)", "Prévu", "Aperçu", "Textes", "Délais"]);
    expect(screen.getByTestId("relances-prevues")).toBeInTheDocument();
  });

  it("le journal : tous les messages, avec le canal, l'état et la réaction ; filtre par état", async () => {
    envois.lireMessagesEnvoyes.mockResolvedValue([
      m({ reaction: "repondu" }),
      m({ ref: "a1", source: "accueils", type: "bienvenue", canal: "upwork", etat: "simule", poster_nom: "Bruno" }),
      m({ ref: "b1", source: "actions_bloquees", type: "pause:lundi_soir", canal: "recrues-check", etat: "pause", texte: null, poster_nom: "Chloé" }),
      m({ ref: "k1", source: "posteur_messages", type: "kill", canal: "upwork", etat: "erreur", detail: "sans_contrat", poster_nom: "Dan" }),
    ]);
    rendu();
    const journal = await screen.findByTestId("journal-messages");
    await waitFor(() => expect(journal.querySelectorAll("[data-message]")).toHaveLength(4));
    const liste = journal.querySelector("ul")!;
    expect(within(liste).getByText("Bienvenue")).toBeInTheDocument();
    expect(within(liste).getByText("Simulé (test)")).toBeInTheDocument();
    expect(within(liste).getByText("Bloqué par la pause · lundi_soir")).toBeInTheDocument();
    expect(within(liste).getByText("A répondu")).toBeInTheDocument();
    expect(within(liste).getByText("sans_contrat")).toBeInTheDocument();    fireEvent.change(within(journal).getByRole("combobox", { name: "État" }), { target: { value: "pause" } });
    expect(within(journal).getByTestId("journal-messages-total")).toHaveTextContent("1 messages");
    expect(journal.querySelectorAll("[data-message]")).toHaveLength(1);
  });

  it("Textes : rangés dans l'ordre de la semaine, aperçu rempli, variable inconnue signalée ; un champ d'objet garde les autres", async () => {
    rendu("/?onglet=textes");
    const textes = await screen.findByTestId("textes-messages");
    expect([...textes.querySelectorAll("[data-groupe-texte]")].map((e) => e.getAttribute("data-groupe-texte"))).toEqual([...GROUPES_TEXTES]);
    expect(within(textes).getByTestId("apercu-accueil")).toHaveTextContent("Hi Ana, welcome! https://sophia-marketing-orga.vercel.app");
    expect(within(textes).getByText("Variables inconnues, laissées telles quelles : {oops}")).toBeInTheDocument();
    // Un texte pas encore en base (ici celui des abonnements de la relance du jour).
    const follows = textes.querySelector('[data-texte="relance_follows"]') as HTMLElement;
    expect(within(follows).getByText("Pas encore en base")).toBeInTheDocument();

    const lien = textes.querySelector("#texte-lien1000") as HTMLTextAreaElement;
    fireEvent.change(lien, { target: { value: "Well done @{handle}! {lien}" } });
    const bloc = textes.querySelector('[data-texte="lien1000"]') as HTMLElement;
    fireEvent.click(within(bloc).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(reglages.ecrireReglages).toHaveBeenCalledWith({
        lien_1000: { message: "Well done @{handle}! {lien}", seuil: 1000, liens: { sophia: "taap.it/sophia.culture" } },
      }),
    );
  });

  it("Textes : le Head of Ops les lit, sans pouvoir les changer", async () => {
    auth.role = "head_of_ops";
    rendu("/?onglet=textes");
    const textes = await screen.findByTestId("textes-messages");
    expect(within(textes).getByText("Lecture seule : les textes sont réservés à l'admin.")).toBeInTheDocument();
    const accueil = within(textes).getByLabelText(/^Message de bienvenue/);
    expect(accueil).toHaveAttribute("readonly");
    fireEvent.change(accueil, { target: { value: "x" } });
    expect(within(textes).queryByRole("button", { name: "Enregistrer" })).toBeNull();
  });

  it("Délais : le Kill sous 24 h est refusé ; enregistrer garde les autres champs d'etapes_delais", async () => {
    rendu("/?onglet=timing");
    const carte = await screen.findByTestId("timing-messages");
    const kill = within(carte).getByLabelText(/^Kill sans étape faite/);
    fireEvent.change(kill, { target: { value: "12" } });
    expect(within(carte).getByText("Le Kill ne peut pas partir avant 24 h.")).toBeInTheDocument();
    expect(within(carte).getByRole("button", { name: "Enregistrer" })).toBeDisabled();
    fireEvent.change(kill, { target: { value: "36" } });
    fireEvent.click(within(carte).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(reglages.ecrireReglages).toHaveBeenCalled());
    const ecrit = reglages.ecrireReglages.mock.calls[0]![0];
    expect(ecrit.etapes_delais).toMatchObject({ kill_h: 36, kill_annulation_h: 12, autre: 7 });
    expect(ecrit.double_popup_expire).toEqual({ jour_iso: 3, heure: "23:59" });
  });

  it("Délais : lecture seule pour le Head of Ops", async () => {
    auth.role = "head_of_ops";
    rendu("/?onglet=timing");
    const carte = await screen.findByTestId("timing-messages");
    expect(within(carte).getByLabelText(/^Kill sans étape faite/)).toBeDisabled();
    expect(within(carte).queryByRole("button", { name: "Enregistrer" })).toBeNull();
  });
});

describe("le catalogue des textes, les délais et le journal (sans base)", () => {
  it("tous les textes d'un message envoyé, une seule fois chacun", () => {
    expect(new Set(TEXTES.map((x) => x.id)).size).toBe(TEXTES.length);
    for (const cle of ["accueil_message_texte", "relance_texte_cadre", "relance_texte_connexion", "lundi_texte_tous", "lundi_soir_texte",
      "jeudi_nudge_texte", "kill_message_texte", "arret_message_texte", "double_popup_texte", "recreer_popup_texte",
      "nudge_regularite_texte", "lien_1000", "reponse_texte_upwork", "reponse_texte_augmentation", "reponse_texte_propre_compte",
      "reponse_texte_absent"]) {
      expect(CLES_TEXTES).toContain(cle);
    }
    expect(TEXTES.filter((x) => x.groupe === "reponses")).toHaveLength(4);
  });

  it("lire et écrire un champ de réglage objet", () => {
    expect(lireTexte({ message: "a" }, "message")).toBe("a");
    expect(lireTexte(undefined)).toBeNull();
    expect(ecrireTexte({ message: "a", seuil: 1 }, "message", "b")).toEqual({ message: "b", seuil: 1 });
    expect(ecrireTexte("vieux", undefined, "neuf")).toBe("neuf");
  });

  it("Délais : défauts, contrôles, fusion", () => {
    const t = lireTiming({});
    expect(t).toMatchObject({ kill_h: 48, kill_annulation_h: 12, fenetre_debut: 10, fenetre_fin: 20, lundi_soir_heure: 20 });
    expect(erreursTiming(t)).toEqual([]);
    expect(erreursTiming({ ...t, kill_h: 0 })).toContain("kill_min");
    expect(erreursTiming({ ...t, fenetre_debut: 20 })).toContain("fenetre");
    const v = valeursTiming(t, { semaine_heures: { fin: 20, autre: true } });
    expect(v.semaine_heures).toEqual({ fin: 20, autre: true, lundi_heure: 10, jeudi_heure: 12 });
    // Prompt 25 v4 : 5 relances Upwork au plus par recrue, puis Slack seulement.
    expect(t.relances_upwork_max).toBe(5);
    expect(lireTiming({ relances_upwork_max_par_recrue: 3 }).relances_upwork_max).toBe(3);
    expect(erreursTiming({ ...t, relances_upwork_max: -1 })).toContain("nombre");
    expect(v.relances_upwork_max_par_recrue).toBe(5);
  });

  it("filtres du journal et message auquel répond un message reçu", () => {
    const liste = [m({}), m({ type: "note:lien_1000", canal: "os", poster_nom: "Éva" })];
    expect(filtrerMessages(liste, { famille: "note", canal: "", etat: "", posteur: "" })).toHaveLength(1);
    expect(filtrerMessages(liste, { famille: "", canal: "", etat: "", posteur: "eva" })).toHaveLength(1);
    const envoyes = [
      m({ at: "2026-10-27T10:00:00Z", ref: "vieux" }),
      m({ at: "2026-10-28T09:00:00Z", ref: "bon" }),
      m({ at: "2026-10-28T09:30:00Z", ref: "auto", type: "reponse_auto" }),
      m({ at: "2026-10-28T11:00:00Z", ref: "apres" }),
    ];
    expect(messageRepondu(envoyes, "p1", "2026-10-28T10:00:00Z")?.ref).toBe("bon");
    expect(messageRepondu(envoyes, "p2", "2026-10-28T10:00:00Z")).toBeNull();
  });

  it("la base (0427) : le journal pour l'admin et le Head of Ops ; textes et heures d'envoi admin seulement", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/0427_p22_pages.sql"), "utf8");
    expect(sql).toContain("create or replace function public.messages_envoyes(p_depuis timestamptz)");
    expect(sql).toContain("if not public.is_admin() then");
    expect(sql).toContain("hub_posteurs");
    for (const cle of ["ckd_nudges", "nudge_messages", "semaine_heures", "double_popup_expire"]) {
      expect(sql).toContain(`'${cle}'`);
    }
    expect(sql).toMatch(/or public\.is_admin_strict\(\)/);
    // Aucun interrupteur ni réglage touché.
    expect(sql).not.toMatch(/update public\.reglages/i);
    expect(sql).not.toMatch(/insert into public\.reglages/i);
  });
});
