import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import { TooltipProvider } from "@/components/ui/tooltip";

const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";

const api = vi.hoisted(() => ({
  listerLabels: vi.fn(),
  majLabel: vi.fn(),
  creerLabel: vi.fn(),
  supprimerLabel: vi.fn(),
  definirApplicationsLabel: vi.fn(),
}));

vi.mock("@/features/moteur/api", () => ({
  listerLabels: () => api.listerLabels(),
  majLabel: (id: string, patch: unknown) => api.majLabel(id, patch),
  creerLabel: (nom: string, couleur: string, opts: unknown) => api.creerLabel(nom, couleur, opts),
  supprimerLabel: (id: string) => api.supprimerLabel(id),
}));
const bible = vi.hoisted(() => ({ lireSources: vi.fn(), lireCartes: vi.fn() }));
vi.mock("@/features/bible/sources", async (orig) => ({
  ...(await orig<typeof import("@/features/bible/sources")>()),
  lireSources: () => bible.lireSources(),
}));
vi.mock("@/features/bible/moodboard", async (orig) => ({
  ...(await orig<typeof import("@/features/bible/moodboard")>()),
  lireCartes: () => bible.lireCartes(),
}));
const angles = vi.hoisted(() => ({ listerAnglesPlacement: vi.fn() }));
vi.mock("@/features/moteur/apiAngles", async (orig) => ({
  ...(await orig<typeof import("@/features/moteur/apiAngles")>()),
  listerAnglesPlacement: () => angles.listerAnglesPlacement(),
}));
vi.mock("@/features/moteur/apiMultiApp", () => ({
  definirApplicationsLabel: (id: string, apps: string[]) => api.definirApplicationsLabel(id, apps),
  definirSeuilPertinenceLabel: vi.fn(),
}));
vi.mock("@/features/moteur/ApplicationContext", () => ({
  useApplication: () => ({
    applicationId: ID_SOPHIA,
    application: { id: ID_SOPHIA, slug: "sophia", nom: "Sophia" },
    slug: "sophia",
    applications: [
      { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", actif: true },
      { id: ID_UNSWIPE, slug: "unswipe", nom: "Unswipe", actif: true },
    ],
  }),
}));
const reserve = (label_id: string, reserve_jours: number | null) => ({
  label_id,
  nom: label_id,
  slug: label_id,
  application_id: ID_SOPHIA,
  application_slug: "sophia",
  contenus_prets: 10,
  passages_restants: 10,
  comptes: 2,
  demande_jour: 2,
  reserve_jours,
});
vi.mock("@/features/moteur/multiapp/useLabelsApplications", () => ({
  useLabelsApplications: () => ({
    multiDispo: true,
    schemaAbsent: false,
    erreurLiens: null,
    reservesHistoriques: null,
    liens: [
      { label_id: "l1", application_id: ID_SOPHIA, pertinence_min: 50 },
      { label_id: "l1", application_id: ID_UNSWIPE, pertinence_min: 60 },
      { label_id: "l2", application_id: ID_SOPHIA, pertinence_min: 50 },
    ],
    reservesParLabel: new Map([
      ["l1", new Map([[ID_SOPHIA, reserve("l1", 2)]])],
      ["l2", new Map([[ID_SOPHIA, reserve("l2", 18)]])],
    ]),
  }),
}));
// Ces deux cartes ont leurs propres tests.
vi.mock("@/features/moteur/multiapp/ApplicationsCard", () => ({ ApplicationsCard: () => null }));
vi.mock("@/features/moteur/multiapp/ReplisCard", () => ({ ReplisCard: () => null }));

import { AdminLabelsPage } from "./AdminLabelsPage";

const LABELS = [
  { id: "l1", nom: "RH", couleur: "#8b5cf6", genre: "femme", style_theme: "Ton direct", prompt_creation: null, exemples_feed: [] },
  { id: "l2", nom: "white_bg", couleur: "#64748b", genre: "femme", style_theme: null, prompt_creation: null, exemples_feed: [] },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TooltipProvider>
          <AdminLabelsPage />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const groupe = (slug: string) => within(screen.getByTestId(`groupe-labels-${slug}`));
/** La ligne d'un label dans le groupe d'une application (un label partagé est dans ses deux groupes). */
const ligne = (nom: string, slug = "sophia") => groupe(slug).getByText(nom).closest("tr") as HTMLElement;

describe("AdminLabelsPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    angles.listerAnglesPlacement.mockResolvedValue([]);
    bible.lireSources.mockResolvedValue({ sources: [], file: null, semaine: null, regles: null, labels: [] });
    bible.lireCartes.mockResolvedValue([]);
    Object.values(api).forEach((f) => f.mockReset());
    api.listerLabels.mockResolvedValue(LABELS);
    api.majLabel.mockResolvedValue(undefined);
    api.creerLabel.mockResolvedValue({ id: "l3", nom: "neuf" });
    api.definirApplicationsLabel.mockResolvedValue(undefined);
  });

  it("range les labels par application : un label partagé est dans ses deux groupes, avec le stock de chacune", async () => {
    renderPage();
    await screen.findByTestId("groupe-labels-sophia");
    expect(groupe("sophia").getByText(/culture générale · 2 labels/)).toBeInTheDocument();
    expect(groupe("sophia").getByText("RH")).toBeInTheDocument();
    expect(groupe("sophia").getByText("white_bg")).toBeInTheDocument();
    // Unswipe : RH seulement (white_bg ne la sert pas).
    expect(groupe("unswipe").getByText("RH")).toBeInTheDocument();
    expect(groupe("unswipe").queryByText("white_bg")).not.toBeInTheDocument();
    // Les logos des applis servies, sur chaque ligne.
    expect(within(ligne("RH")).getByRole("img", { name: "Unswipe" })).toBeInTheDocument();
    expect(within(ligne("white_bg")).queryByRole("img", { name: "Unswipe" })).not.toBeInTheDocument();
    // Sous 7 jours, en rouge, comme sur la page Allocation.
    expect(within(ligne("RH")).getByText("2,0")).toHaveClass("text-destructive");
    expect(within(ligne("white_bg")).getByText("18,0")).not.toHaveClass("text-destructive");
    // Aucun label sans application ici : pas de groupe « Sans application ».
    expect(screen.queryByTestId("groupe-labels-sans")).not.toBeInTheDocument();
  });

  it("une ligne se déplie sur les angles du label pour l'application de son groupe (plus de style d'écriture)", async () => {
    angles.listerAnglesPlacement.mockResolvedValue([
      { id: "a1", label_id: "l1", application_id: ID_SOPHIA, texte: "Le temps récupéré", statut: "actif", created_at: "2026-11-01T00:00:00Z" },
      { id: "a2", label_id: "l1", application_id: ID_UNSWIPE, texte: "Angle Unswipe", statut: "actif", created_at: "2026-11-01T00:00:00Z" },
      { id: "a3", label_id: "l2", application_id: ID_SOPHIA, texte: "Angle white_bg", statut: "actif", created_at: "2026-11-01T00:00:00Z" },
    ]);
    renderPage();
    await screen.findByTestId("groupe-labels-sophia");
    fireEvent.click(groupe("sophia").getByText("RH"));
    const carte = await screen.findByTestId("carte-angles");
    expect(await within(carte).findByText(/Le temps récupéré/)).toBeInTheDocument();
    expect(screen.queryByText(/Angle Unswipe/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Angle white_bg/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Thème / style")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enregistrer le style" })).not.toBeInTheDocument();
  });

  it("une ligne dépliée montre la DA du label en petit et ses comptes de référence", async () => {
    const src = (o: Record<string, unknown>) => ({
      id: "s1", handle: "une.source", langue: "fr", actif: true, labels: [{ id: "l1", nom: "RH" }], slides: [], importes: 10, valides: 5,
      perf: { posts: 10, r: 1, vuesMediane: 1000, rVsLabel: 1, labelNom: "RH" }, essaiMax: null, essaiVerdict: null, dernierImport: null,
      neuve: null, attente: null, sequence: null, restant: 0, semaine: null, etape: "weekly", ...o,
    });
    bible.lireSources.mockResolvedValue({
      sources: [
        src({ id: "s1", handle: "careers.emma", perf: { vuesMediane: 9000 }, slides: [{ url: "https://img.test/a.jpg", post: "https://www.tiktok.com/@careers.emma/photo/1" }] }),
        src({ id: "s2", handle: "vieux.compte", actif: false, etape: "arretees" }),
        src({ id: "s3", handle: "autre.label", labels: [{ id: "l2", nom: "white_bg" }] }),
      ],
      file: null, semaine: null, regles: null, labels: [],
    });
    bible.lireCartes.mockResolvedValue([{ id: "k1", label_id: "l1", description_da: "Fond crème, texte noir, conseils chiffrés" }]);
    renderPage();
    await screen.findByTestId("groupe-labels-sophia");
    fireEvent.click(groupe("sophia").getByText("RH"));
    const refs = await screen.findByTestId("references-label");
    expect(within(refs).getByText("Fond crème, texte noir, conseils chiffrés")).toBeInTheDocument();
    expect(within(refs).getByRole("img", { name: "Slide de @careers.emma" })).toHaveAttribute("src", "https://img.test/a.jpg");
    expect(within(refs).getByText("2 comptes de référence")).toBeInTheDocument();
    expect(within(refs).getAllByRole("link").map((a) => a.textContent)).toEqual(["", "@careers.emmaWeekly update", "@vieux.compteArrêtées"]);
    expect(within(refs).queryByText(/autre\.label/)).not.toBeInTheDocument();
  });

  it("changer le genre écrit le label sans déplier la ligne", async () => {
    renderPage();
    await screen.findByTestId("groupe-labels-sophia");
    fireEvent.change(within(ligne("RH")).getByRole("combobox", { name: "Genre" }), { target: { value: "homme" } });
    await waitFor(() => expect(api.majLabel).toHaveBeenCalledWith("l1", { genre: "homme" }));
    expect(screen.queryByLabelText("Thème / style")).not.toBeInTheDocument();
  });

  it("« Nouveau label » : il faut choisir l'application, puis le label la sert, elle seule", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Nouveau label/ }));
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "neuf" } });
    // Sans application choisie, rien ne part.
    expect(screen.getByRole("button", { name: "Créer" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Sophia/ }));
    fireEvent.click(screen.getByRole("button", { name: "Créer pour Sophia" }));
    await waitFor(() => expect(api.creerLabel).toHaveBeenCalledWith("neuf", "#2f6f4e", { genre: "femme" }));
    await waitFor(() => expect(api.definirApplicationsLabel).toHaveBeenCalledWith("l3", [ID_SOPHIA]));
    // Le formulaire reste ouvert sur la suite : sources, file des créateurs, style.
    expect(await screen.findByTestId("label-cree")).toHaveTextContent("Label « neuf » créé pour Sophia");
    expect(within(screen.getByTestId("label-cree")).getByRole("link", { name: "Sources" })).toHaveAttribute("href", "/admin/sources");
  });

  it("le bouton d'un groupe ouvre le formulaire sur son application ; le nom annonce l'identité des comptes", async () => {
    api.creerLabel.mockResolvedValue({ id: "l4", nom: "male_run" });
    renderPage();
    await screen.findByTestId("groupe-labels-unswipe");
    fireEvent.click(groupe("unswipe").getByRole("button", { name: "Label Unswipe" }));
    expect(groupe("unswipe").getByRole("radio", { name: /Unswipe/ })).toBeChecked();
    fireEvent.change(groupe("unswipe").getByLabelText("Nom"), { target: { value: "male_run" } });
    // « male_run » : genre homme proposé, et des @ tous différents (plus de « prenom.mot123 »).
    expect(groupe("unswipe").getByTestId("identite-label")).toHaveTextContent("homme");
    expect(groupe("unswipe").getByTestId("identite-label")).toHaveTextContent("des @ tous différents");
    expect(groupe("unswipe").getByTestId("identite-label")).toHaveTextContent("Ex. @emma.mrtn04, @itsleaa217");
    fireEvent.click(groupe("unswipe").getByRole("button", { name: "Créer pour Unswipe" }));
    await waitFor(() => expect(api.creerLabel).toHaveBeenCalledWith("male_run", "#2f6f4e", { genre: "homme" }));
    await waitFor(() => expect(api.definirApplicationsLabel).toHaveBeenCalledWith("l4", [ID_UNSWIPE]));
  });
});
