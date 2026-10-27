import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const SOPHIA = "00000000-0000-4000-8000-000000000001";
const MICABO = "00000000-0000-4000-8000-000000000002";

const lireReglage = vi.fn();
const ecrireEspace = vi.fn();
const listerRelecteurs = vi.fn();
const listerToutesReponses = vi.fn();
const ajouterRelecteur = vi.fn();
const majRelecteur = vi.fn();
const supprimerRelecteur = vi.fn();
const listerFiches = vi.fn();
const enregistrerFiche = vi.fn();
const compterVersions = vi.fn();
const lireReponses = vi.fn();
const listerKit = vi.fn();
const listerEcrituresKit = vi.fn();
const majPostKit = vi.fn();

vi.mock("@/features/relectureNative/api", () => ({
  lireReglageRelecture: () => lireReglage(),
  ecrireEspaceOuvert: (...a: unknown[]) => ecrireEspace(...a),
  listerRelecteurs: () => listerRelecteurs(),
  listerToutesReponses: () => listerToutesReponses(),
  ajouterRelecteur: (...a: unknown[]) => ajouterRelecteur(...a),
  majRelecteur: (...a: unknown[]) => majRelecteur(...a),
  supprimerRelecteur: (...a: unknown[]) => supprimerRelecteur(...a),
  listerFichesAppli: () => listerFiches(),
  enregistrerFicheAppli: (...a: unknown[]) => enregistrerFiche(...a),
  compterVersionsFiches: () => compterVersions(),
  lireReponses: (...a: unknown[]) => lireReponses(...a),
  listerKit: () => listerKit(),
  listerEcrituresKit: (...a: unknown[]) => listerEcrituresKit(...a),
  majPostKit: (...a: unknown[]) => majPostKit(...a),
  ajouterPostKit: vi.fn(),
  supprimerPostKit: vi.fn(),
}));

vi.mock("@/features/reviews/TikTokEmbed", () => ({
  TikTokEmbed: ({ url }: { url: string }) => <iframe title="TikTok" src={url} />,
}));

const POST_KIT = {
  id: "k1",
  rang: 1,
  contenu_id: "c1",
  application_id: SOPHIA,
  voie: "reprise",
  slide_cta: 5,
  consigne_cta: "Slide 5 recommends unscroll.",
  a_adapter: "The weekly poem.",
  source_url: "https://www.tiktok.com/@brookeandbloom/video/7641213732919577887",
  slides_en: [
    { position: 1, texte: "6 hobbies that will make you noticeably smarter", image_url: "https://x/1.jpg" },
    { position: 5, texte: "i use unscroll", image_url: "https://x/5.jpg" },
  ],
  actif: true,
};

vi.mock("@/features/moteur/api", () => ({
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
    listerToutesReponses.mockResolvedValue([]);
    ajouterRelecteur.mockResolvedValue(undefined);
    listerFiches.mockResolvedValue([]);
    compterVersions.mockResolvedValue({});
    enregistrerFiche.mockResolvedValue(undefined);
    listerKit.mockResolvedValue([POST_KIT]);
    listerEcrituresKit.mockResolvedValue([]);
    majPostKit.mockResolvedValue(undefined);
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

  it("montre le kit en liste, ouvre un post et enregistre un changement de voie", async () => {
    rendre();
    fireEvent.click(screen.getByRole("button", { name: "Kit" }));
    const ligne = await screen.findByTestId("kit-admin-1");
    expect(within(ligne).getByText("6 hobbies that will make you noticeably smarter")).toBeInTheDocument();
    expect(within(ligne).getByText("Reprise")).toBeInTheDocument();
    expect(within(ligne).getByText("CTA slide 5")).toBeInTheDocument();
    expect(within(ligne).queryByRole("combobox", { name: "Voie du CTA" })).not.toBeInTheDocument();

    fireEvent.click(within(ligne).getByRole("button", { name: "Modifier" }));
    expect(within(ligne).getByTitle("TikTok")).toHaveAttribute("src", POST_KIT.source_url);
    const enregistrerBtn = within(ligne).getByRole("button", { name: "Enregistrer" });
    expect(enregistrerBtn).toBeDisabled();
    fireEvent.change(within(ligne).getByRole("combobox", { name: "Voie du CTA" }), { target: { value: "libre" } });
    fireEvent.click(enregistrerBtn);
    await waitFor(() =>
      expect(majPostKit).toHaveBeenCalledWith("k1", {
        rang: 1,
        application_id: SOPHIA,
        voie: "libre",
        slide_cta: 5,
        consigne_cta: "Slide 5 recommends unscroll.",
        a_adapter: "The weekly poem.",
        actif: true,
      }),
    );
  });

  it("montre les chiffres et l'avancement du kit de chaque relecteur", async () => {
    listerRelecteurs.mockResolvedValue([
      {
        id: "r1",
        profile_id: "p1",
        langue: "tr",
        statut: "invite",
        note: null,
        questionnaire_termine_at: "2026-10-27T11:00:00Z",
        created_at: "2026-10-27T10:00:00Z",
        prenom: "Ayşe",
        nom: "Yılmaz",
        email: "a@x.io",
      },
    ]);
    listerEcrituresKit.mockResolvedValue([
      { relecteur_id: "r1", kit_id: "k1", slides: [], remarque: "", rendu_at: "2026-10-27T12:00:00Z" },
    ]);
    rendre();
    const ligne = await screen.findByTestId("relecteur-r1");
    await waitFor(() => expect(within(ligne).getByText("1 / 1 rendus")).toBeInTheDocument());
    expect(within(ligne).getByLabelText("Kit fini")).toBeInTheDocument();
    expect(within(ligne).getByText("AY")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Posts écrits").closest("div")).toHaveTextContent(/1\s*\/ 1/));
  });
});
