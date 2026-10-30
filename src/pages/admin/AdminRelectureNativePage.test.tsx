import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
const lireExemple = vi.fn();
const majLabelExemple = vi.fn();

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
  lireExempleNatif: (...a: unknown[]) => lireExemple(...a),
  majLabelExemple: (...a: unknown[]) => majLabelExemple(...a),
  supprimerExempleNatif: vi.fn(),
  URL_NOTION_RELECTEURS: "https://www.notion.so/relecteurs",
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
      <AdminRelectureNativePage />
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
    lireExemple.mockResolvedValue({ statut: "pret" });
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

  it("écrit une fiche appli à partir du modèle et l'enregistre", async () => {
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Fiches appli" }));
    const carte = await screen.findByTestId(`fiche-appli-${MICABO}`);
    fireEvent.click(within(carte).getByRole("button", { name: "Partir du modèle" }));
    const contenu = within(carte).getByLabelText("Fiche complète (Markdown)") as HTMLTextAreaElement;
    expect(contenu.value.startsWith("# micabo")).toBe(true);
    fireEvent.change(within(carte).getByLabelText("Présentation pour les relecteurs"), {
      target: { value: "micabo turns your notes into quizzes." },
    });
    fireEvent.click(within(carte).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(enregistrerFiche).toHaveBeenCalledWith(MICABO, contenu.value, "micabo turns your notes into quizzes."),
    );
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

  it("banque d'exemples natifs : couverture par label, ajout de liens puis lecture un par un", async () => {
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

    // Ajout : chaque paquet revient au fil de l'eau, s'écrit au journal et
    // lance sa lecture ; le formulaire reste libre pour la niche suivante.
    const resume = {
      ajoutes: 2,
      deja: 0,
      comptes: [
        { pseudo: "zitatxplorer", posts: 60, slideshows: 1, verifies: true },
        { pseudo: "videos.only", posts: 30, slideshows: 10, verifies: false },
        { pseudo: "prive", posts: 0, slideshows: 0, erreur: "Profil privé" },
      ],
      ignorees: ["n'importe quoi"],
    };
    ajouterExemples.mockImplementation(
      (_l: string, _label: string | null, _texte: string, onPaquet?: (r: typeof resume) => void) => {
        onPaquet?.(resume);
        return Promise.resolve(resume);
      },
    );
    lireExemple.mockImplementation((id: string) =>
      Promise.resolve(id === "e3" ? { statut: "erreur", erreur: "Pas un slideshow (aucune image) : c'est sans doute une vidéo." } : { statut: "pret", slides: 7 }),
    );
    const attente = (id: string) => ({ ...pret, id, statut: "en_attente", slides: [], vues: null, label_id: "l-alpha" });
    listerExemples.mockResolvedValue([pret, attente("e2"), attente("e3")]);
    fireEvent.change(within(section).getByRole("combobox", { name: "Label" }), { target: { value: "l-alpha" } });
    const zone = within(section).getByRole("textbox");
    fireEvent.change(zone, { target: { value: "https://www.tiktok.com/@x/photo/2\n@zitatxplorer\nn'importe quoi" } });
    fireEvent.click(within(section).getByRole("button", { name: "Ajouter et lire" }));
    await waitFor(() =>
      expect(ajouterExemples).toHaveBeenCalledWith(
        "de",
        "l-alpha",
        "https://www.tiktok.com/@x/photo/2\n@zitatxplorer\nn'importe quoi",
        expect.any(Function),
      ),
    );
    // Le champ se vide et reste disponible pour l'envoi suivant.
    expect(zone).toHaveValue("");
    fireEvent.change(zone, { target: { value: "@suivant" } });
    expect(within(section).getByRole("button", { name: "Ajouter et lire" })).toBeEnabled();

    const journal = within(section).getByTestId("journal-exemples");
    expect(journal).toHaveTextContent("alpha_male · 3 ligne(s) envoyée(s) en Allemand");
    expect(journal).toHaveTextContent("@zitatxplorer : 60 posts lus, 1 slideshow(s) retenu(s)");
    expect(journal).toHaveTextContent("@videos.only : 30 posts lus, aucun reconnu comme slideshow d’avance.");
    expect(journal).toHaveTextContent("@prive : Profil privé");
    expect(journal).toHaveTextContent("Lignes non reconnues : n'importe quoi");
    await waitFor(() => expect(lireExemple).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(journal).toHaveTextContent("Lecture terminée : 1 prêt(s), 1 écarté(s) ou en erreur"));
    expect(journal).toHaveTextContent("slideshow lu, 7 slides avec du texte");
    expect(journal).toHaveTextContent("Pas un slideshow (aucune image)");
    expect(lireExemple.mock.calls.map((c) => c[0]).sort()).toEqual(["e2", "e3"]);
  });
});
