import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const SOPHIA = "00000000-0000-4000-8000-000000000001";
const MICABO = "00000000-0000-4000-8000-000000000002";

const listerFichesAppli = vi.fn();
const enregistrerFicheAppli = vi.fn();
const listerFichesLangue = vi.fn();
const enregistrerFicheLangue = vi.fn();
const listerFichesLabel = vi.fn();
const enregistrerFicheLabel = vi.fn();
const lireFicheCta = vi.fn();
const enregistrerFicheCta = vi.fn();

vi.mock("@/features/relectureNative/api", () => ({
  listerFichesAppli: () => listerFichesAppli(),
  compterVersionsFiches: () => Promise.resolve({ [SOPHIA]: 3 }),
  enregistrerFicheAppli: (...a: unknown[]) => enregistrerFicheAppli(...a),
  listerFichesLangue: () => listerFichesLangue(),
  enregistrerFicheLangue: (...a: unknown[]) => enregistrerFicheLangue(...a),
  listerFichesLabel: () => listerFichesLabel(),
  enregistrerFicheLabel: (...a: unknown[]) => enregistrerFicheLabel(...a),
  CLE_FICHE_CTA: "commune",
  lireFicheCta: () => lireFicheCta(),
  enregistrerFicheCta: (...a: unknown[]) => enregistrerFicheCta(...a),
  listerExemplesNatifs: () =>
    Promise.resolve([
      { id: "e1", langue: "de", statut: "pret" },
      { id: "e2", langue: "de", statut: "pret" },
      { id: "e3", langue: "de", statut: "erreur" },
    ]),
}));

vi.mock("@/features/moteur/api", () => ({
  listerLabels: () =>
    Promise.resolve([
      { id: "l-alpha", nom: "alpha_male" },
      { id: "l-smart", nom: "smart_girl" },
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

import { AdminFichesPage } from "./AdminFichesPage";

function rendre(url = "/admin/fiches") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <AdminFichesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminFichesPage", () => {
  beforeEach(() => {
    void i18n.changeLanguage("fr");
    vi.clearAllMocks();
    listerFichesAppli.mockResolvedValue([
      {
        application_id: SOPHIA,
        contenu: "# Sophia\n\n## Ce que fait l'appli\n- **Cours courts** de culture générale",
        presentation_relecteur: "Sophia is a general knowledge app.",
        updated_at: "2026-10-27T10:00:00Z",
      },
    ]);
    enregistrerFicheAppli.mockResolvedValue(undefined);
    listerFichesLangue.mockResolvedValue([
      { cle: "tr", contenu: "# Fiche langue : Turc\n\n## L'essentiel en 8 règles\n1. Tutoie.", version: 2, auteur: "a@x.io", created_at: "2026-10-30T10:00:00Z", versions: 2 },
    ]);
    enregistrerFicheLangue.mockResolvedValue(undefined);
    listerFichesLabel.mockResolvedValue([
      { cle: "smart_girl", contenu: "# Label sheet: smart_girl\n\n## Where the app goes\n- **Inside an item**, never as an extra item", version: 1, auteur: "premier-jet", created_at: "2026-10-30T16:00:00Z", versions: 1 },
    ]);
    enregistrerFicheLabel.mockResolvedValue(undefined);
    lireFicheCta.mockResolvedValue(null);
    enregistrerFicheCta.mockResolvedValue(undefined);
  });

  it("réunit les quatre sortes de fiches, avec leur avancement", async () => {
    rendre();
    const sortes = screen.getByRole("group", { name: "Sortes de fiches" });
    await waitFor(() => expect(within(sortes).getByRole("button", { name: /Applis/ })).toHaveTextContent("1 / 2"));
    expect(within(sortes).getByRole("button", { name: /Langues/ })).toHaveTextContent(/1 \/ \d+/);
    expect(within(sortes).getByRole("button", { name: /Labels/ })).toHaveTextContent("1 / 2");
    expect(within(sortes).getByRole("button", { name: /^CTA/ })).toHaveTextContent("0 / 1");
    // La fiche CTA d'abord : c'est l'intro.
    expect(within(sortes).getAllByRole("button")[0]).toHaveAccessibleName(/^CTA/);
    expect(within(sortes).getByRole("button", { name: /^CTA/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("applis : la fiche se lit mise en forme, puis se modifie et s'enregistre", async () => {
    rendre("/admin/fiches?sorte=appli");
    const fiche = await screen.findByTestId(`fiche-appli-${SOPHIA}`);
    // Lecture : le Markdown est mis en forme.
    expect(within(fiche).getByRole("heading", { name: "Ce que fait l'appli" })).toBeInTheDocument();
    expect(within(fiche).getByText("Cours courts").tagName).toBe("STRONG");
    expect(fiche).toHaveTextContent("Sophia is a general knowledge app.");
    expect(fiche).toHaveTextContent("3 versions");

    fireEvent.click(within(fiche).getByRole("button", { name: "Modifier" }));
    fireEvent.change(within(fiche).getByLabelText("Présentation pour les relecteurs"), {
      target: { value: "Sophia: short general knowledge courses." },
    });
    fireEvent.click(within(fiche).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(enregistrerFicheAppli).toHaveBeenCalledWith(
        SOPHIA,
        expect.stringContaining("## Ce que fait l'appli"),
        "Sophia: short general knowledge courses.",
      ),
    );
  });

  it("une fiche appli vide s'écrit à partir du modèle", async () => {
    rendre("/admin/fiches?sorte=appli");
    fireEvent.click(await screen.findByRole("button", { name: /micabo/ }));
    const fiche = await screen.findByTestId(`fiche-appli-${MICABO}`);
    expect(within(fiche).getByText("À écrire")).toBeInTheDocument();
    fireEvent.click(within(fiche).getByRole("button", { name: "Écrire la fiche" }));
    expect((within(fiche).getByLabelText("Fiche (Markdown)") as HTMLTextAreaElement).value.startsWith("# micabo")).toBe(true);
  });

  it("langues : une fiche par langue, la recherche, et l'écriture depuis le modèle", async () => {
    rendre("/admin/fiches?sorte=langue");
    const liste = await screen.findByRole("list", { name: "Langues" });
    fireEvent.change(screen.getByPlaceholderText("Chercher une langue…"), { target: { value: "turc" } });
    expect(within(liste).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(within(liste).getByRole("button", { name: /Turc/ }));
    const turc = await screen.findByTestId("fiche-langue-tr");
    expect(within(turc).getByRole("heading", { name: "L'essentiel en 8 règles" })).toBeInTheDocument();
    expect(turc).toHaveTextContent("Version 2");

    fireEvent.change(screen.getByPlaceholderText("Chercher une langue…"), { target: { value: "allemand" } });
    fireEvent.click(within(screen.getByRole("list", { name: "Langues" })).getByRole("button", { name: /Allemand/ }));
    const allemand = await screen.findByTestId("fiche-langue-de");
    expect(allemand).toHaveTextContent("2 exemples natifs");
    fireEvent.click(within(allemand).getByRole("button", { name: "Écrire la fiche" }));
    fireEvent.click(within(allemand).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(enregistrerFicheLangue).toHaveBeenCalledWith("de", expect.stringContaining("# Language sheet: German (de)")),
    );
  });

  it("labels : la fiche se lit, se modifie, et un label sans fiche s'écrit depuis le modèle", async () => {
    rendre("/admin/fiches?sorte=label&cle=smart_girl");
    const fiche = await screen.findByTestId("fiche-label-smart_girl");
    expect(within(fiche).getByRole("heading", { name: "Where the app goes" })).toBeInTheDocument();
    expect(within(fiche).queryByRole("button", { name: "Calculer maintenant" })).not.toBeInTheDocument();
    fireEvent.click(within(fiche).getByRole("button", { name: "Modifier" }));
    fireEvent.change(within(fiche).getByLabelText("Fiche (Markdown)"), { target: { value: "# Label sheet: smart_girl\n\nv2" } });
    fireEvent.click(within(fiche).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(enregistrerFicheLabel).toHaveBeenCalledWith("smart_girl", "# Label sheet: smart_girl\n\nv2"));

    fireEvent.click(within(screen.getByRole("list", { name: "Labels" })).getByRole("button", { name: /alpha_male/ }));
    const vide = await screen.findByTestId("fiche-label-alpha_male");
    expect(vide).toHaveTextContent("n’est pas encore écrite");
    fireEvent.click(within(vide).getByRole("button", { name: "Écrire la fiche" }));
    const texte = (within(vide).getByLabelText("Fiche (Markdown)") as HTMLTextAreaElement).value;
    expect(texte.startsWith("# Label sheet: alpha_male")).toBe(true);
    expect(texte).toContain("## The angle: what the app brings, by topic");
    expect(texte).toContain("## Placement examples");
  });

  it("CTA : l'intro commune s'écrit depuis le modèle, en anglais, sans forme tirée", async () => {
    rendre();
    const fiche = await screen.findByTestId("fiche-cta");
    expect(fiche).toHaveTextContent("Jamais enregistrée");
    fireEvent.click(within(fiche).getByRole("button", { name: "Écrire la fiche" }));
    const texte = (within(fiche).getByLabelText("Fiche (Markdown)") as HTMLTextAreaElement).value;
    expect(texte.startsWith("# CTA sheet")).toBe(true);
    expect(texte).toContain("Never before slide 4");
    expect(texte).toContain("## The hook stays as it is");
    expect(texte).toContain("## Never, in any language");
    expect(texte).not.toContain("Sophia");
    expect(texte).not.toMatch(/prouvee|essai|format_du_post/);
    fireEvent.click(within(fiche).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(enregistrerFicheCta).toHaveBeenCalledWith(expect.stringContaining("## The golden rule")));
    expect(screen.queryByTestId("cta")).not.toBeInTheDocument();
  });
});
