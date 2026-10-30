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
const listerComptes = vi.fn();
const relireExemple = vi.fn();
const listerFichesLangue = vi.fn();
const enregistrerFicheLangue = vi.fn();
const listerFichesLabel = vi.fn();
const calculerFichesLabel = vi.fn();
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
  listerComptesNatifs: () => listerComptes(),
  relireExempleNatif: (...a: unknown[]) => relireExemple(...a),
  effacerSuiviComptes: vi.fn(),
  listerFichesLangue: () => listerFichesLangue(),
  enregistrerFicheLangue: (...a: unknown[]) => enregistrerFicheLangue(...a),
  listerFichesLabel: () => listerFichesLabel(),
  lireAvancementCta: () => Promise.resolve({ classes: 900, a_classer: 100 }),
  calculerFichesLabel: () => calculerFichesLabel(),
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
    listerComptes.mockResolvedValue([]);
    relireExemple.mockResolvedValue(undefined);
    listerFichesLangue.mockResolvedValue([]);
    enregistrerFicheLangue.mockResolvedValue(undefined);
    listerFichesLabel.mockResolvedValue([]);
    calculerFichesLabel.mockResolvedValue({ semaine: "2026-11-02", fiches: 9, lignes: 400 });
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

  it("fiches langue : une par langue, partie du modèle, enregistrée", async () => {
    listerFichesLangue.mockResolvedValue([
      { cle: "tr", contenu: "# Fiche langue : Turc", version: 2, auteur: "a@x.io", created_at: "2026-10-30T10:00:00Z", versions: 2 },
    ]);
    listerExemples.mockResolvedValue([
      { id: "e1", langue: "de", statut: "pret" },
      { id: "e2", langue: "de", statut: "en_attente" },
    ]);
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Fiches langue" }));
    const fiche = await screen.findByTestId("fiche-langue-de");
    expect(within(fiche).getByText("Fiche Allemand")).toBeInTheDocument();
    expect(within(fiche).getByText("À écrire")).toBeInTheDocument();
    await waitFor(() => expect(fiche).toHaveTextContent("1 exemples natifs prêts"));

    fireEvent.click(within(fiche).getByRole("button", { name: "Partir du modèle" }));
    const zone = within(fiche).getByRole("textbox", { name: "Fiche complète (Markdown)" });
    expect((zone as HTMLTextAreaElement).value).toContain("# Fiche langue : Allemand");
    expect((zone as HTMLTextAreaElement).value).toContain("### Études (");
    fireEvent.click(within(fiche).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(enregistrerFicheLangue).toHaveBeenCalledWith("de", expect.stringContaining("## L'essentiel en 8 règles")),
    );

    // Une autre langue : sa propre fiche, déjà écrite.
    fireEvent.change(within(screen.getByTestId("fiches-langue")).getByRole("combobox", { name: "Langue" }), {
      target: { value: "tr" },
    });
    const turc = await screen.findByTestId("fiche-langue-tr");
    expect(within(turc).getByText("Écrite")).toBeInTheDocument();
    expect(turc).toHaveTextContent("2 version(s)");
    expect(within(turc).getByRole("textbox", { name: "Fiche complète (Markdown)" })).toHaveValue("# Fiche langue : Turc");
  });

  it("CTA : les 7 formes, la règle de la slide, l'avancement et les fiches label", async () => {
    listerFichesLabel.mockResolvedValue([
      { cle: "alpha_male", contenu: "# Fiche label : alpha_male", version: 1, auteur: "cta-lundi", created_at: "2026-11-02T06:30:00Z", versions: 1 },
      { cle: "smart_girl", contenu: "# Fiche label : smart_girl\n## Sophia · 812 posts", version: 3, auteur: "cta-lundi", created_at: "2026-11-02T06:30:00Z", versions: 3 },
    ]);
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "CTA" }));
    const section = await screen.findByTestId("cta");
    const formes = within(section).getByRole("list", { name: "Les formes de CTA" });
    expect(within(formes).getAllByRole("listitem")).toHaveLength(7);
    expect(formes).toHaveTextContent("1. Dans le format du post");
    expect(formes).toHaveTextContent("7. Un point de la liste");
    expect(section).toHaveTextContent("le CTA va n’importe où à partir de la slide 4");
    await waitFor(() => expect(within(section).getByTestId("cta-avancement")).toHaveTextContent("900 textes classés · 100 à classer"));

    // Une fiche par label ; la première s'affiche, on passe à une autre.
    expect(await within(section).findByTestId("fiche-label-alpha_male")).toHaveTextContent("# Fiche label : alpha_male");
    fireEvent.change(within(section).getByRole("combobox", { name: "Label" }), { target: { value: "smart_girl" } });
    const fiche = within(section).getByTestId("fiche-label-smart_girl");
    expect(fiche).toHaveTextContent("Version 3");
    expect(fiche).toHaveTextContent("## Sophia · 812 posts");

    fireEvent.click(within(section).getByRole("button", { name: "Calculer maintenant" }));
    expect(await within(section).findByText("9 fiches label écrites (400 lignes de chiffres).")).toBeInTheDocument();
    expect(calculerFichesLabel).toHaveBeenCalledTimes(1);
  });
});
