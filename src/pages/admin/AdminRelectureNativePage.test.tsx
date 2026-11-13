import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const SOPHIA = "00000000-0000-4000-8000-000000000001";
const MICABO = "00000000-0000-4000-8000-000000000002";

const lireReglage = vi.fn();
const ecrireEspace = vi.fn();
const listerRelecteurs = vi.fn();
const ajouterRelecteur = vi.fn();
const majRelecteur = vi.fn();
const supprimerRelecteur = vi.fn();
const listerFiches = vi.fn();
const enregistrerFiche = vi.fn();
const compterVersions = vi.fn();
const synchroniserNotion = vi.fn();
const listerExemples = vi.fn();
const ajouterExemples = vi.fn();
const listerComptes = vi.fn();
const relireExemple = vi.fn();
const listerFichesLangue = vi.fn();
const enregistrerFicheLangue = vi.fn();
const majLabelExemple = vi.fn();

vi.mock("@/features/relectureNative/apiBoucle", () => ({
  CLE_BOUCLE: ["boucle-etat"],
  etatBoucle: () => Promise.resolve([{ langue: "de", relecteurs: 1, envoyes_7j: 15, a_relire: 3, relus_7j: 12, duels_a_voter: 0, proposees: 7, retenues: 20, retenues_7j: 5, reprises_pct: 18, reprises_pct_avant: 31 }]),
}));
vi.mock("@/features/relectureNative/api", () => ({
  lireReglageRelecture: () => lireReglage(),
  ecrireEspaceOuvert: (...a: unknown[]) => ecrireEspace(...a),
  listerRelecteurs: () => listerRelecteurs(),
  ajouterRelecteur: (...a: unknown[]) => ajouterRelecteur(...a),
  majRelecteur: (...a: unknown[]) => majRelecteur(...a),
  supprimerRelecteur: (...a: unknown[]) => supprimerRelecteur(...a),
  listerFichesAppli: () => listerFiches(),
  enregistrerFicheAppli: (...a: unknown[]) => enregistrerFiche(...a),
  compterVersionsFiches: () => compterVersions(),
  synchroniserNotion: () => synchroniserNotion(),
  listerExemplesNatifs: () => listerExemples(),
  ajouterExemplesNatifs: (...a: unknown[]) => ajouterExemples(...a),
  listerComptesNatifs: () => listerComptes(),
  relireExempleNatif: (...a: unknown[]) => relireExemple(...a),
  effacerSuiviComptes: vi.fn(),
  listerFichesLangue: () => listerFichesLangue(),
  enregistrerFicheLangue: (...a: unknown[]) => enregistrerFicheLangue(...a),
  majLabelExemple: (...a: unknown[]) => majLabelExemple(...a),
  supprimerExempleNatif: vi.fn(),
  URL_NOTION_RELECTEURS: "https://www.notion.so/relecteurs",
}));

const listerDuels = vi.fn();
const listerVotesRelecteurs = vi.fn();
const etatLot = vi.fn();

vi.mock("@/features/abTraduction/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/abTraduction/api")>()),
  listerCircuits: () => Promise.resolve([{ id: "ancree", version: "ancree-1", nom: "Ancrée", applications: null }]),
  listerDuels: (...a: unknown[]) => listerDuels(...a),
  listerVotesRelecteurs: (...a: unknown[]) => listerVotesRelecteurs(...a),
  rapportVotesRelecteurs: () => Promise.resolve([]),
  etatLot: () => etatLot(),
  listerLots: () => Promise.resolve([{ numero: 1, nom: "Lot 1", candidat: "ancree", taille: 15, statut: "actif", envoi_auto: true }]),
  reglerEnvoiAutoLot: vi.fn(),
  composerLot: vi.fn(),
  servirLot: vi.fn(),
  envoyerAuxRelecteurs: vi.fn(),
}));

vi.mock("@/features/moteur/api", () => ({
  listerLabels: () =>
    Promise.resolve([
      { id: "l-smart", nom: "smart_girl" },
      { id: "l-alpha", nom: "alpha_male" },
    ]),
  listerPosters: () =>
    Promise.resolve([
      { id: "p1", prenom: "Ayşe", nom: "Yılmaz", email: "a@x.io", role: "poster", is_active: true, langues: [], comptes: [{ langue: "tr" }] },
      { id: "p2", prenom: "Admin", nom: "", email: "ad@x.io", role: "admin", is_active: true, langues: [], comptes: [] },
      { id: "p3", prenom: "Ancien", nom: "", email: "an@x.io", role: "poster", is_active: false, langues: [], comptes: [] },
    ]),
}));

vi.mock("@/features/moteur/ApplicationContext", () => ({
  useApplication: () => ({
    applications: [
      { id: SOPHIA, slug: "sophia", nom: "Sophia" },
      { id: MICABO, slug: "micabo", nom: "micabo" },
    ],
  }),
}));

import { AdminRelectureNativePage } from "./AdminRelectureNativePage";

function rendre() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminRelectureNativePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminRelectureNativePage", () => {
  beforeEach(() => {
    void i18n.changeLanguage("fr");
    vi.clearAllMocks();
    lireReglage.mockResolvedValue({ espace_ouvert: false, production: false });
    ecrireEspace.mockResolvedValue(undefined);
    listerRelecteurs.mockResolvedValue([]);
    ajouterRelecteur.mockResolvedValue(undefined);
    listerFiches.mockResolvedValue([]);
    compterVersions.mockResolvedValue({});
    enregistrerFiche.mockResolvedValue(undefined);
    synchroniserNotion.mockResolvedValue({ ok: true, ecrites: 2 });
    listerExemples.mockResolvedValue([]);
    listerComptes.mockResolvedValue([]);
    relireExemple.mockResolvedValue(undefined);
    listerFichesLangue.mockResolvedValue([]);
    enregistrerFicheLangue.mockResolvedValue(undefined);
    majLabelExemple.mockResolvedValue(undefined);
  });

  it("montre l'espace fermé et la production coupée, et ouvre l'espace", async () => {
    rendre();
    expect(await screen.findByText(/Fermé : les relecteurs désignés/)).toBeInTheDocument();
    expect(screen.getByText("Coupée")).toBeInTheDocument();
    const interrupteur = screen.getByRole("switch", { name: "Espace relecteur" });
    // Grisé tant que l'état n'est pas lu : on ne bascule pas à l'aveugle.
    await waitFor(() => expect(interrupteur.getAttribute("aria-disabled")).not.toBe("true"));
    const bouton = interrupteur.querySelector("input") ?? interrupteur.parentElement?.querySelector("input");
    fireEvent.click(bouton!);
    await waitFor(() => expect(ecrireEspace).toHaveBeenCalledWith(true));
  });

  it("ajoute un posteur actif comme relecteur, dans la langue de son compte", async () => {
    rendre();
    const choix = await screen.findByRole("combobox", { name: "Posteur" });
    await waitFor(() => expect(within(choix).getAllByRole("option")).toHaveLength(2));
    fireEvent.change(choix, { target: { value: "p1" } });
    expect(screen.getByRole("combobox", { name: "Langue" })).toHaveValue("tr");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(ajouterRelecteur).toHaveBeenCalledWith("p1", "tr"));
    // La table Notion suit tout de suite.
    await waitFor(() => expect(synchroniserNotion).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Table Notion à jour (2 ligne(s) réécrite(s)).")).toBeInTheDocument();
  });

  it("met la table Notion à jour à la demande, et dit pourquoi quand elle n'est pas partagée", async () => {
    rendre();
    expect(await screen.findByRole("link", { name: "Ouvrir dans Notion" })).toHaveAttribute(
      "href",
      "https://www.notion.so/relecteurs",
    );
    expect(screen.queryByTestId("etat-notion")).not.toBeInTheDocument();
    synchroniserNotion.mockRejectedValueOnce(new Error("La table Notion « Relecteurs natifs » n'est pas partagée"));
    fireEvent.click(screen.getByRole("button", { name: "Mettre à jour Notion" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("n'est pas partagée");
    fireEvent.click(screen.getByRole("button", { name: "Mettre à jour Notion" }));
    expect(await screen.findByText("Table Notion à jour (2 ligne(s) réécrite(s)).")).toBeInTheDocument();
  });

  it("n'a plus ni questionnaire ni kit, et compte relecteurs, langues et exemples", async () => {
    listerRelecteurs.mockResolvedValue([
      {
        id: "r1",
        profile_id: "p1",
        langue: "tr",
        statut: "actif",
        note: null,
        created_at: "2026-10-27T10:00:00Z",
        prenom: "Ayşe",
        nom: "Yılmaz",
        email: "a@x.io",
      },
    ]);
    const exemple = (id: string, langue: string, statut = "pret") => ({
      id,
      langue,
      source_url: `https://www.tiktok.com/@x/photo/${id}`,
      handle: "x",
      label_id: null,
      slides: [],
      vues: null,
      statut,
      erreur: null,
      created_at: "2026-10-29T10:00:00Z",
    });
    listerExemples.mockResolvedValue([
      ...["1", "2", "3", "4", "5"].map((id) => exemple(id, "de")),
      exemple("6", "tr"),
      exemple("7", "tr", "erreur"),
    ]);
    rendre();
    const ligne = await screen.findByTestId("relecteur-r1");
    expect(within(ligne).getByText("AY")).toBeInTheDocument();
    expect(within(ligne).queryByText(/questionnaire|rendus/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réponses au questionnaire" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Exemples natifs prêts").closest("div")).toHaveTextContent(/6/));
    expect(screen.getByText("Banques en service").closest("div")).toHaveTextContent(/1/);
  });

  it("banque d'exemples natifs : couverture par label, ajout, puis suivi du travail du serveur", async () => {
    const pret = {
      id: "e1",
      langue: "de",
      source_url: "https://www.tiktok.com/@motiversum/photo/1",
      handle: "motiversum",
      label_id: "l-smart",
      slides: [
        { position: 2, texte: "1. Sie hören zu" },
        { position: 1, texte: "8 psychologische Fakten" },
      ],
      vues: 12000,
      statut: "pret",
      erreur: null,
      created_at: "2026-10-29T10:00:00Z",
      updated_at: "2026-10-29T10:05:00Z",
    };
    listerExemples.mockResolvedValue([pret, { ...pret, id: "e9", langue: "tr", label_id: null }]);
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Exemples natifs" }));
    const section = await screen.findByTestId("exemples-natifs");
    expect(await within(section).findByText("1 / 20 exemples prêts")).toBeInTheDocument();
    const couverture = within(section).getByRole("list", { name: "Couverture par label" });
    await waitFor(() => expect(couverture).toHaveTextContent("smart_girl · 1"));
    expect(couverture).toHaveTextContent("alpha_male · 0");
    // Seul l'exemple allemand s'affiche ; son texte se déplie, slide par slide.
    expect(screen.queryByTestId("exemple-e9")).not.toBeInTheDocument();
    const ligne = screen.getByTestId("exemple-e1");
    expect(within(ligne).getByText("8 psychologische Fakten")).toBeInTheDocument();
    fireEvent.click(within(ligne).getByRole("button", { name: "Texte" }));
    expect(within(ligne).getByText("1. Sie hören zu")).toBeInTheDocument();

    // Ajout : le serveur note les comptes et répond aussitôt ; le champ se
    // vide pour la niche suivante, et la page suit l'avancement du serveur.
    ajouterExemples.mockResolvedValue({ ajoutes: 1, deja: 0, comptes: 1, dejaEnFile: 1, ignorees: ["n'importe quoi"] });
    const attente = (id: string, pris_le: string | null = null, erreur: string | null = null) => ({
      ...pret,
      id,
      statut: "en_attente",
      slides: [],
      vues: null,
      label_id: "l-alpha",
      pris_le,
      erreur,
    });
    const echec = { ...attente("e4"), statut: "erreur", erreur: "Pas un slideshow (aucune image) : c'est sans doute une vidéo." };
    const compte = (id: string, pseudo: string, champs: Record<string, unknown>) => ({
      id,
      langue: "de",
      pseudo,
      label_id: "l-alpha",
      statut: "fait",
      posts: null,
      slideshows: null,
      verifies: null,
      ajoutes: null,
      erreur: null,
      pris_le: null,
      created_at: "2026-10-30T09:00:00Z",
      ...champs,
    });
    listerExemples.mockResolvedValue([pret, attente("e2", "2026-10-30T09:01:00Z"), attente("e3", null, "Apify : 502"), echec]);
    listerComptes.mockResolvedValue([
      compte("c1", "zitatxplorer", { statut: "en_attente", pris_le: "2026-10-30T09:01:00Z" }),
      compte("c2", "attente", { statut: "en_attente" }),
      compte("c3", "motiversum", { posts: 60, slideshows: 10, verifies: true, ajoutes: 8 }),
      compte("c4", "videos.only", { posts: 30, slideshows: 10, verifies: false, ajoutes: 10 }),
      compte("c5", "prive", { statut: "erreur", erreur: "Apify : 500" }),
      compte("c6", "autre", { langue: "tr" }),
    ]);
    fireEvent.change(within(section).getByRole("combobox", { name: "Label" }), { target: { value: "l-alpha" } });
    const zone = within(section).getByRole("textbox");
    fireEvent.change(zone, { target: { value: "https://www.tiktok.com/@x/photo/2\n@zitatxplorer\nn'importe quoi" } });
    fireEvent.click(within(section).getByRole("button", { name: "Ajouter et lire" }));
    await waitFor(() =>
      expect(ajouterExemples).toHaveBeenCalledWith("de", "l-alpha", "https://www.tiktok.com/@x/photo/2\n@zitatxplorer\nn'importe quoi"),
    );
    expect(zone).toHaveValue("");
    fireEvent.change(zone, { target: { value: "@suivant" } });
    expect(within(section).getByRole("button", { name: "Ajouter et lire" })).toBeEnabled();

    const retours = await within(section).findByTestId("retours-exemples");
    expect(retours).toHaveTextContent("alpha_male · Allemand : 1 compte(s) mis en file, 1 lien(s) ajouté(s)");
    expect(retours).toHaveTextContent("Déjà là : 1 (dans la banque ou en file)");
    expect(retours).toHaveTextContent("Lignes non reconnues : n'importe quoi");

    const suivi = within(section).getByTestId("suivi-exemples");
    await waitFor(() =>
      expect(suivi).toHaveTextContent(
        "2 compte(s) à chercher · 2 slideshow(s) à lire, dont 1 en lecture en ce moment. Tu peux fermer la page.",
      ),
    );
    // La preuve que ça avance : l'heure de la dernière lecture finie.
    expect(suivi).toHaveTextContent(/Dernier slideshow lu à \d{2}:\d{2}\./);
    expect(suivi).toHaveTextContent("@zitatxplorer : recherche en cours…");
    expect(suivi).toHaveTextContent("@attente : en attente");
    expect(suivi).toHaveTextContent("@motiversum : 60 posts lus, 10 slideshow(s) retenu(s), 8 nouveau(x) dans la banque");
    expect(suivi).toHaveTextContent("@videos.only : 30 posts lus, aucun reconnu comme slideshow d’avance.");
    expect(suivi).toHaveTextContent("@prive : Apify : 500");
    expect(suivi).not.toHaveTextContent("@autre");

    // Les slideshows : en lecture, en nouvel essai, ou écartés (à relire à la main).
    expect(within(screen.getByTestId("exemple-e2")).getByText("En lecture")).toBeInTheDocument();
    expect(within(screen.getByTestId("exemple-e3")).getByText("Nouvel essai dans la minute : Apify : 502")).toBeInTheDocument();
    expect(within(screen.getByTestId("exemple-e3")).queryByRole("button", { name: "Relire" })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("exemple-e4")).getByRole("button", { name: "Relire" }));
    await waitFor(() => expect(relireExemple).toHaveBeenCalledWith("e4"));
  });

  it("onglet Duels : les duels envoyés, colonnes cachées puis révélées, et le vote de chaque relecteur avec sa remarque", async () => {
    lireReglage.mockResolvedValue({ espace_ouvert: true, production: false });
    listerRelecteurs.mockResolvedValue([
      { id: "r1", profile_id: "p-k", langue: "de", statut: "invite", note: null, created_at: "2026-10-27T10:00:00Z", prenom: "Bogdan", nom: "Kocsis", email: "b@x.io" },
    ]);
    const slide = (texte: string) => [{ position: 1, texte_overlay: texte, position_sophia: false }];
    listerDuels.mockResolvedValue([
      {
        id: "d1",
        post_id: null,
        langue: "de",
        candidat: "ancree",
        version: "ancree-1",
        statut: "pret",
        erreur: null,
        slides_source: slide("How to counter any insult"),
        slides_actuel: slide("So konterst du jede Beleidigung richtig elegant"),
        slides_candidat: slide("Wie du Kritik souverän entschärfst"),
        hashtags_actuel: null,
        hashtags_candidat: null,
        vues_actuel: null,
        gauche: "candidat",
        voie_cta: null,
        forme_cta: null,
        cta_refus: null,
        choix: null,
        remarque: null,
        relecteurs_le: "2026-11-02T22:00:00Z",
        lot_id: "lot-1",
        contenu_id: "c1",
        created_at: "2026-11-02T22:00:00Z",
      },
    ]);
    listerVotesRelecteurs.mockResolvedValue([
      {
        id: "v1",
        duel_id: "d1",
        profile_id: "p-k",
        choix: "actuel",
        note_actuel: 5,
        note_candidat: 3,
        remarque: "Version 2 is the clear winner because it sounds much more natural.",
        remarque_sur: "les_deux",
        type_erreur: null,
        updated_at: "2026-11-03T19:05:00Z",
      },
    ]);
    etatLot.mockResolvedValue({
      lot: { id: "lot-1", numero: 1, nom: "Lot 1", candidat: "ancree", taille: 15, statut: "actif", created_at: "2026-11-02T14:41:00Z" },
      contenus: [{ position: 1, contenu_id: "c1", titre: "t", label: "alpha_male_yellow", langue_source: "fr", nb_langues: 20, r_med: 4.28, publies: 21, accroche: "Comment désarmer une critique" }],
      langues: [{ langue: "de", relecteurs: 1, attendus: 15, prets: 1, echecs: 0, votes: 1, dernier: null }],
      duels: 1,
    });
    void i18n.changeLanguage("en");
    rendre();
    fireEvent.click(screen.getByRole("button", { name: /Duels/ }));

    const carte = await screen.findByTestId("duel-admin");
    expect(carte).toHaveTextContent("Duel 1");
    expect(carte).toHaveTextContent("alpha_male_yellow");
    expect(carte).toHaveTextContent("How to counter any insult");
    expect(carte).toHaveTextContent("So konterst du jede Beleidigung richtig elegant");
    expect(carte).not.toHaveTextContent(/Version 1 · /);
    const votes = await within(carte).findByTestId("duel-admin-votes");
    expect(votes).toHaveTextContent("Bogdan Kocsis");
    expect(votes).toHaveTextContent(/chose old circuit/);
    expect(votes).toHaveTextContent("ratings: old 5/5, new 3/5");
    expect(votes).toHaveTextContent("Version 2 is the clear winner");
    expect(votes).not.toHaveTextContent(/\(Version 2\)/);

    fireEvent.click(within(carte).getByRole("button", { name: "Reveal" }));
    expect(carte).toHaveTextContent(/Version 1 · new circuit/);
    expect(carte).toHaveTextContent(/Version 2 · old circuit \(posted\)/);
    expect(votes).toHaveTextContent(/chose old circuit \(Version 2\)/);
    fireEvent.click(within(carte).getByRole("button", { name: "Hide" }));
    expect(carte).not.toHaveTextContent(/Version 1 · /);

    fireEvent.click(screen.getByRole("button", { name: /Reveal the columns of every duel/ }));
    expect(carte).toHaveTextContent(/Version 1 · new circuit/);
  });

  it("renvoie aux fiches, qui ont leur page : plus d'onglet de fiches ni de CTA ici", () => {
    rendre();
    expect(screen.queryByRole("button", { name: "Fiches langue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fiches appli" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CTA" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fiches" })).toHaveAttribute("href", "/admin/fiches");
  });

  it("le bandeau de la boucle : les quatre étapes avec les chiffres, et une étape ouvre son onglet", async () => {
    rendre();
    const bandeau = await screen.findByTestId("bandeau-boucle");
    await waitFor(() => expect(within(bandeau).getByTestId("boucle-langue")).toBeInTheDocument());
    expect(bandeau.textContent).toMatch(/15 (cette semaine|this week) · 3/);
    expect(bandeau.textContent).toMatch(/7 (proposées|proposed)/);
    expect(bandeau.textContent).toMatch(/20 (retenues|kept)/);
    expect(within(bandeau).getByTestId("boucle-reprises").textContent).toMatch(/18 %.*31 %/);
    fireEvent.click(within(bandeau).getByTestId("boucle-corrections"));
    expect(await screen.findByTestId("section-corrections")).toBeInTheDocument();
  });
});
