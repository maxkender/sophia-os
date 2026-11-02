import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: "admin" }) }));

import "@/locales";
import type { PostCalendrierAdmin } from "@/features/moteur/api";

const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
const ID_MICABO = "00000000-0000-4000-8000-000000000002";
const JOUR = "2026-10-12";

const postsCalendrierAdmin = vi.fn();

vi.mock("@/features/moteur/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/moteur/api")>()),
  aujourdhui: () => JOUR,
  postsCalendrierAdmin: (options: unknown) => postsCalendrierAdmin(options),
}));

vi.mock("@/features/moteur/apiMultiApp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/moteur/apiMultiApp")>()),
  listerApplicationsMulti: async () => [
    { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", created_at: "", langues: null, actif: true },
    { id: ID_MICABO, slug: "micabo", nom: "micabo", created_at: "", langues: null, actif: true },
  ],
}));

import { AdminCalendrierPage } from "./AdminCalendrierPage";

function post(
  id: string,
  compte: string,
  prenom: string,
  application_id: string | null,
  sur: Partial<PostCalendrierAdmin> = {},
): PostCalendrierAdmin {
  return {
    id,
    compte_id: compte,
    date_publication_prevue: JOUR,
    type: "slideshow",
    statut: "assigne",
    pipeline_statut: "pret",
    publie_at: null,
    publie_url: null,
    persona_nom: null,
    handle_tiktok: `${prenom.toLowerCase()}.tt`,
    avatar_url: null,
    classement: null,
    poster_prenom: prenom,
    poster_nom: null,
    sujet_titre: null,
    langue: "tr",
    ugc_ai: false,
    ugc_ai_video: false,
    nb_slides: 5,
    nb_media: 5,
    slideshow_vide: false,
    application_id,
    ...sur,
  };
}

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminCalendrierPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminCalendrierPage — applications", () => {
  beforeEach(() => {
    postsCalendrierAdmin.mockReset();
    postsCalendrierAdmin.mockResolvedValue([
      post("p1", "c-ayse", "Ayse", ID_MICABO, { statut: "publie" }),
      post("p2", "c-ayse", "Ayse", ID_MICABO),
      post("p3", "c-lea", "Lea", null),
      post("p4", "c-lea", "Lea", ID_SOPHIA),
      post("p5", "c-mixte", "Mixte", ID_MICABO),
      post("p6", "c-mixte", "Mixte", ID_SOPHIA),
    ]);
  });

  it("puces par application : postés / prévus, et filtre au clic", async () => {
    rendre();
    const groupe = await screen.findByRole("group", { name: "App" });
    const puceMicabo = within(groupe).getByRole("button", { name: /micabo/ });
    expect(puceMicabo).toHaveTextContent("micabo 1/3");
    // Post sans application (avant 0256) : compté pour Sophia.
    expect(within(groupe).getByRole("button", { name: /Sophia/ })).toHaveTextContent("Sophia 0/3");
    expect(within(groupe).getByRole("button", { name: /All apps/ })).toHaveTextContent("All apps 6");

    expect(screen.getByText("Lea")).toBeInTheDocument();
    fireEvent.click(puceMicabo);
    expect(puceMicabo).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Lea")).not.toBeInTheDocument();
    expect(screen.getByText("Ayse")).toBeInTheDocument();
    expect(screen.getByText("Mixte")).toBeInTheDocument();
  });

  it("tri par application : une section par application, un créateur mixte dans chacune", async () => {
    rendre();
    await screen.findByText("Ayse");
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "application" } });
    const titres = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titres).toEqual(["Sophia", "micabo"]);
    expect(screen.getAllByText("Mixte")).toHaveLength(2);
    const sectionMicabo = screen.getByRole("heading", { level: 2, name: "micabo" }).closest("section")!;
    expect(within(sectionMicabo).getByText("2 creator(s) · 1/3 posted")).toBeInTheDocument();
    expect(within(sectionMicabo).queryByText("Lea")).not.toBeInTheDocument();
  });

  it("ne demande QUE le jour affiché, jamais les N derniers posts", async () => {
    // Régression. La page prenait les 800 posts les plus récents, toutes
    // dates confondues, et filtrait sur le jour côté navigateur. Passé
    // 400 posts par jour le plafond tombait AU MILIEU d'une journée : les
    // créateurs dont le deuxième post était au-delà de la coupe
    // s'affichaient « 1/1 posté » alors qu'ils en avaient bien deux, et
    // les jours plus anciens sortaient vides. Une fenêtre de dates tronque
    // visiblement, un plafond de lignes tronque en silence.
    rendre();
    await screen.findByText("Ayse");
    expect(postsCalendrierAdmin).toHaveBeenCalledWith({ du: JOUR, au: JOUR });

    // Et elle suit la navigation : changer de jour redemande CE jour-là.
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await vi.waitFor(() =>
      expect(postsCalendrierAdmin).toHaveBeenCalledWith({
        du: "2026-10-11",
        au: "2026-10-11",
      }),
    );
  });
});
