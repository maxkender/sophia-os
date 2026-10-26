import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";
import type { PosterProfil } from "@/features/moteur/types";

const listerPosters = vi.fn();
const majZoneRecruteur = vi.fn();
const listerComptes = vi.fn();
const listerApplications = vi.fn();
const labelsDesComptes = vi.fn();
const listerLiensLabels = vi.fn();
const premiersJoursComptes = vi.fn();

vi.mock("@/features/auth/AuthContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/AuthContext")>()),
  useAuth: () => ({ user: { id: "admin-1" }, role: "admin" }),
}));

vi.mock("@/features/moteur/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/moteur/api")>()),
  listerPosters: () => listerPosters(),
  listerComptesAvecDormants: () => listerComptes(),
  listerLanguesReference: async () => ["fr", "tr", "es"],
  listerApplications: () => listerApplications(),
  listerLabels: async () => [],
  labelsDesComptes: (ids: string[]) => labelsDesComptes(ids),
  majZoneRecruteur: (id: string, zone: string | null) => majZoneRecruteur(id, zone),
  premiersJoursComptes: () => premiersJoursComptes(),
}));

vi.mock("@/features/moteur/apiMultiApp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/moteur/apiMultiApp")>()),
  listerLiensLabels: () => listerLiensLabels(),
}));

import { AdminPostersPage } from "./AdminPostersPage";

function profil(over: Partial<PosterProfil> & { id: string; role: PosterProfil["role"] }): PosterProfil {
  return {
    prenom: over.id,
    nom: null,
    email: `${over.id}@sophia.com`,
    langues: ["fr"],
    nationalite: null,
    upwork_url: null,
    cout_mensuel: null,
    compte_id: null,
    handle_tiktok: null,
    reference_handle: null,
    persona_nom: null,
    persona_bio: null,
    avatar_url: null,
    classement: null,
    classement_maj_at: null,
    warmup_started_at: null,
    warmup_ends_at: null,
    manager_id: null,
    manager_nom: null,
    is_active: true,
    must_change_password: false,
    hm_ugc_ai_video: false,
    comptes: [],
    ...over,
  };
}

const PROFILS = [
  profil({ id: "admin-1", role: "admin", prenom: "Max" }),
  profil({ id: "amanda", role: "directing_manager", prenom: "Amanda", zone_recrutement: "Turkey + Israel" }),
  profil({
    id: "kris",
    role: "hiring_manager",
    prenom: "Kris",
    zone_recrutement: "Spain + Portugal",
    manager_id: "amanda",
    manager_nom: "Amanda",
  }),
  profil({ id: "remi", role: "hiring_manager", prenom: "Rémi" }),
  profil({ id: "taimoor", role: "hiring_manager", prenom: "Taimoor", is_active: false }),
  profil({ id: "beyza", role: "poster", prenom: "Beyza", manager_id: "amanda", manager_nom: "Amanda" }),
  profil({ id: "marta", role: "poster", prenom: "Marta", manager_id: "kris", manager_nom: "Kris" }),
  profil({ id: "elodie", role: "poster", prenom: "Élodie", manager_id: "remi", manager_nom: "Rémi" }),
  profil({ id: "seule", role: "poster", prenom: "Solo" }),
];

function renderPage(adresse = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[adresse]}>
        <AdminPostersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** La section d'une zone, par son titre. */
function sectionZone(titre: string): HTMLElement {
  const h2 = screen.getByRole("heading", { level: 2, name: titre });
  return h2.closest("section") as HTMLElement;
}

describe("AdminPostersPage — par zone", () => {
  beforeEach(() => {
    listerPosters.mockReset();
    listerPosters.mockResolvedValue(PROFILS);
    majZoneRecruteur.mockReset();
    majZoneRecruteur.mockResolvedValue(undefined);
    listerComptes.mockReset();
    listerComptes.mockResolvedValue([]);
    listerApplications.mockReset();
    listerApplications.mockResolvedValue([]);
    labelsDesComptes.mockReset();
    labelsDesComptes.mockResolvedValue(new Map());
    listerLiensLabels.mockReset();
    listerLiensLabels.mockResolvedValue([]);
    premiersJoursComptes.mockReset();
    premiersJoursComptes.mockResolvedValue(new Map());
  });

  it("range chaque créateur sous la zone de son recruteur", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });

    const titres = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titres.indexOf("Spain + Portugal")).toBeLessThan(titres.indexOf("Turkey + Israel"));

    expect(within(sectionZone("Turkey + Israel")).getByText("Beyza")).toBeTruthy();
    expect(within(sectionZone("Turkey + Israel")).queryByText("Marta")).toBeNull();
    expect(within(sectionZone("Spain + Portugal")).getByText("Marta")).toBeTruthy();
    // Recruteur sans zone : groupe « Sans zone », pas perdu.
    expect(within(sectionZone("No zone")).getByText("Élodie")).toBeTruthy();
    // Créateur sans recruteur : section à part.
    expect(screen.getByText("Solo")).toBeTruthy();
    // Recruteur désactivé sans créateur : replié à part.
    expect(screen.getByText(/Deactivated recruiters with no creators \(1\)/)).toBeTruthy();
  });

  it("filtre de zone par puce, et recherche sans accent", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });

    const puces = screen.getByRole("group", { name: "Zone" });
    fireEvent.click(within(puces).getByRole("button", { name: /Spain \+ Portugal/ }));
    expect(screen.queryByRole("heading", { level: 2, name: "Turkey + Israel" })).toBeNull();
    expect(screen.getByText("Marta")).toBeTruthy();

    fireEvent.click(within(puces).getByRole("button", { name: /Spain \+ Portugal/ }));
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "elodie" } });
    expect(screen.getByText("Élodie")).toBeTruthy();
    expect(screen.queryByText("Beyza")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "Turkey + Israel" })).toBeNull();
  });

  it("la fiche d'un recruteur enregistre sa zone", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Rémi" }));

    const champ = await screen.findByLabelText("Zone", { selector: "input" });
    fireEvent.change(champ, { target: { value: "  France  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(majZoneRecruteur).toHaveBeenCalledWith("remi", "France"));
  });

  it("une zone renommée pendant qu'on la filtre : le filtre tombe, personne ne disparaît", async () => {
    let donnees = PROFILS.map((p) => ({ ...p }));
    listerPosters.mockImplementation(async () => donnees);
    majZoneRecruteur.mockImplementation(async (id: string, zone: string | null) => {
      donnees = donnees.map((p) => (p.id === id ? { ...p, zone_recrutement: zone } : p));
    });
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });

    fireEvent.click(
      within(screen.getByRole("group", { name: "Zone" })).getByRole("button", { name: /Spain \+ Portugal/ }),
    );
    expect(screen.queryByText("Beyza")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Kris" }));
    fireEvent.change(await screen.findByLabelText("Zone", { selector: "input" }), {
      target: { value: "Spain" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(majZoneRecruteur).toHaveBeenCalledWith("kris", "Spain"));

    await screen.findByRole("heading", { level: 2, name: "Spain" });
    expect(screen.getByRole("heading", { level: 2, name: "Turkey + Israel" })).toBeTruthy();
    expect(screen.getByText("Beyza")).toBeTruthy();
    expect((screen.getByLabelText("Zone", { selector: "select" }) as HTMLSelectElement).value).toBe("");
  });

  it("filtre de phase : tous les recruteurs restent visibles et cliquables", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });
    fireEvent.change(screen.getByLabelText("Phase"), { target: { value: "warmup" } });

    for (const nom of ["Amanda", "Kris", "Rémi"]) {
      expect(screen.getByRole("button", { name: nom })).toBeTruthy();
    }
    expect(screen.queryByText("Marta")).toBeNull();
    expect(screen.getByText(/Deactivated recruiters with no creators \(1\)/)).toBeTruthy();
  });

  it("recherche : un recruteur sans créateur se trouve par son nom", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "taimoor" } });
    expect(screen.getByRole("button", { name: "Taimoor" })).toBeTruthy();
    expect(screen.queryByText("No creator matches these filters.")).toBeNull();
  });

  it("recherche : « @handle » trouve le compte TikTok (stocké sans @)", async () => {
    listerComptes.mockResolvedValue([
      {
        id: "c-beyza",
        poster_id: "beyza",
        handle_tiktok: "beyzareads",
        persona_nom: "Beyza",
        langue: "tr",
        type_compte: "perso",
        is_active: true,
        classement: "passable",
        warmup_started_at: null,
        warmup_ends_at: null,
        avatar_url: null,
        parts_applications: null,
        ugc_ai_video: false,
      },
    ]);
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });
    await screen.findByText("@beyzareads");
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "@beyzareads" } });
    expect(screen.getByText("@beyzareads")).toBeTruthy();
    expect(screen.getByText("beyza@sophia.com")).toBeTruthy();
    expect(screen.queryByText("Marta")).toBeNull();
  });

  it("la puce « Sans zone » compte aussi les créateurs sans recruteur", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });
    const puce = within(screen.getByRole("group", { name: "Zone" })).getByRole("button", { name: /No zone/ });
    expect(puce.textContent).toBe("No zone 2");
    fireEvent.click(puce);
    expect(screen.getByText("Élodie")).toBeTruthy();
    expect(screen.getByText("Solo")).toBeTruthy();
    // Recruteur désactivé sans zone : dans le repli de « Sans zone ».
    expect(screen.getByText(/Deactivated recruiters with no creators \(1\)/)).toBeTruthy();
  });

  it("l'éditeur de zone ne garde pas l'état d'un autre recruteur", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Kris" }));
    fireEvent.change(await screen.findByLabelText("Zone", { selector: "input" }), {
      target: { value: "Spain + Portugal + Andorra" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(majZoneRecruteur).toHaveBeenCalledTimes(1));

    // Un autre recruteur, ouvert depuis la liste de la page.
    fireEvent.click(screen.getAllByRole("button", { name: "Amanda" })[0]);
    await screen.findByRole("heading", { level: 2, name: "Amanda" });
    expect(screen.queryByText("Zone saved.")).toBeNull();
    expect((screen.getByLabelText("Zone", { selector: "input" }) as HTMLInputElement).value).toBe(
      "Turkey + Israel",
    );
  });

  it("le bloc d'un recruteur garde le choix de ses langues", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });
    const section = sectionZone("Spain + Portugal");
    expect(within(section).getByRole("combobox")).toBeTruthy();
  });

  it("en-tête d'un recruteur : les pays de ses comptes, pas ceux de ses langues", async () => {
    listerPosters.mockResolvedValue([
      ...PROFILS,
      profil({
        id: "erla",
        role: "hiring_manager",
        prenom: "Erla",
        langues: ["fi", "ru", "et"],
        zone_recrutement: "Estonia + Finland + Russian-speaking",
      }),
      profil({ id: "alua", role: "poster", prenom: "Alua", manager_id: "erla", manager_nom: "Erla" }),
      profil({ id: "kaisi", role: "poster", prenom: "Kaisi", manager_id: "erla", manager_nom: "Erla" }),
    ]);
    const compte = (id: string, poster_id: string, langue: string, pays: string) => ({
      id,
      poster_id,
      handle_tiktok: id,
      persona_nom: id,
      langue,
      pays,
      type_compte: "perso",
      is_active: true,
      classement: "passable",
      warmup_started_at: null,
      warmup_ends_at: null,
      avatar_url: null,
      parts_applications: null,
      ugc_ai_video: false,
    });
    listerComptes.mockResolvedValue([compte("c-alua", "alua", "ru", "KZ"), compte("c-kaisi", "kaisi", "et", "EE")]);
    renderPage();
    const section = await waitFor(() => sectionZone("Estonia + Finland + Russian-speaking"));
    await waitFor(() => expect(within(section).getByLabelText("Estonia, Kazakhstan")).toBeTruthy());
    expect(within(section).queryByTitle("Russian")).toBeNull();
  });

  it("DM : total de toute son équipe (HM compris), comme l'ancien arbre", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });
    const section = sectionZone("Turkey + Israel");
    // Amanda : Beyza en direct + Marta via Kris (HM, autre zone).
    expect(within(section).getByText("1 HM · 2 creator(s) · 2 not created · 0 warmup · 0 active")).toBeTruthy();
    // Ses créateurs directs : un compteur cliquable par étape.
    expect(within(section).getByText(/Creators hired by the DM/)).toBeTruthy();
    expect(within(section).getAllByRole("button", { name: "1 not created" }).length).toBeGreaterThan(0);

    fireEvent.click(within(section).getByRole("button", { name: "Amanda" }));
    const fiche = (await screen.findByRole("heading", { level: 2, name: "Amanda" })).parentElement!.parentElement!;
    expect(within(fiche).getByText("1 HM · 2 creator(s) · 2 not created · 0 warmup · 0 active")).toBeTruthy();
  });

  it("filtre de phase : les compteurs restent ceux de toute l'équipe, rien n'est dit « sans créateur »", async () => {
    const hmOff = profil({ id: "otto", role: "hiring_manager", prenom: "Otto", is_active: false, zone_recrutement: "France" });
    listerPosters.mockResolvedValue([...PROFILS, hmOff, profil({ id: "c6", role: "poster", prenom: "Cesar", manager_id: "otto" })]);
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });
    fireEvent.change(screen.getByLabelText("Phase"), { target: { value: "posting" } });

    const espagne = sectionZone("Spain + Portugal");
    // Les compteurs d'étapes restent ceux de toute l'équipe.
    expect(within(espagne).getByRole("button", { name: "1 not created" })).toBeTruthy();
    expect(within(espagne).getByText("0 shown with these filters")).toBeTruthy();
    expect(within(espagne).getByText("No creator matches the filters (1 in total).")).toBeTruthy();
    // Désactivé avec un créateur : reste dans sa zone, pas replié « sans créateur ».
    expect(within(sectionZone("France")).getByRole("button", { name: "Otto" })).toBeTruthy();
    expect(screen.getByText(/Deactivated recruiters with no creators \(1\)/)).toBeTruthy();
  });

  it("compteur d'étape cliquable : ne montre que cette étape, reclic pour tout revoir", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });
    const espagne = sectionZone("Spain + Portugal");
    const puce = within(espagne).getByRole("button", { name: "1 not created" });
    expect(puce.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(puce);
    expect(puce.getAttribute("aria-pressed")).toBe("true");
    expect(within(espagne).queryByText("No creator matches the filters (1 in total).")).toBeNull();
    fireEvent.click(puce);
    expect(puce.getAttribute("aria-pressed")).toBe("false");
  });

  it("recherche par l'email d'un recruteur : ses créateurs restent affichés", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "kris@sophia" } });
    expect(screen.getByText("Marta")).toBeTruthy();
    expect(screen.queryByText("Beyza")).toBeNull();
  });

  it("filtre « application promue » : ce que les comptes publient, pas ce que leurs labels permettent", async () => {
    const SOPHIA = "00000000-0000-4000-8000-000000000001";
    const MICABO = "00000000-0000-4000-8000-000000000002";
    const UNSWIPE = "00000000-0000-4000-8000-000000000003";
    listerApplications.mockResolvedValue([
      { id: SOPHIA, slug: "sophia", nom: "Sophia", actif: true, langues: null },
      { id: MICABO, slug: "micabo", nom: "micabo", actif: true, langues: ["tr"] },
      { id: UNSWIPE, slug: "unswipe", nom: "Unswipe", actif: true, langues: null },
    ]);
    // beau_smart_girl sert Sophia + micabo + Unswipe ; classic_study micabo + Unswipe.
    listerLiensLabels.mockResolvedValue([
      { label_id: "l-bsg", application_id: SOPHIA },
      { label_id: "l-bsg", application_id: MICABO },
      { label_id: "l-bsg", application_id: UNSWIPE },
      { label_id: "l-cs", application_id: MICABO },
      { label_id: "l-cs", application_id: UNSWIPE },
    ]);
    const compte = (id: string, poster_id: string, parts_applications: unknown) => ({
      id,
      poster_id,
      handle_tiktok: id,
      persona_nom: id,
      langue: "tr",
      type_compte: "perso",
      is_active: true,
      classement: "passable",
      warmup_started_at: null,
      warmup_ends_at: null,
      avatar_url: null,
      parts_applications,
      ugc_ai_video: false,
    });
    // Beyza : compte Sophia par défaut (label partagé). Omer : compte micabo 100 %.
    listerPosters.mockResolvedValue([
      ...PROFILS,
      profil({ id: "omer", role: "poster", prenom: "Omer", manager_id: "amanda", manager_nom: "Amanda" }),
    ]);
    listerComptes.mockResolvedValue([compte("c-beyza", "beyza", null), compte("c-omer", "omer", { micabo: 100 })]);
    labelsDesComptes.mockResolvedValue(
      new Map([
        ["c-beyza", [{ id: "l-bsg", nom: "beau_smart_girl", slug: "beau-smart-girl" }]],
        ["c-omer", [{ id: "l-cs", nom: "classic_study", slug: "classic-study" }]],
      ]),
    );
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });
    await waitFor(() => expect(labelsDesComptes).toHaveBeenCalled());
    const filtre = screen.getByLabelText("Promoted app") as HTMLSelectElement;
    await waitFor(() => expect(within(filtre).getByRole("option", { name: /micabo/ })).toBeTruthy());

    fireEvent.change(filtre, { target: { value: "micabo" } });
    await waitFor(() => expect(screen.queryByText("beyza@sophia.com")).toBeNull());
    expect(screen.getByText("omer@sophia.com")).toBeTruthy();
    // Recruteurs sans créateur correspondant masqués : Kris (Espagne) disparaît.
    expect(screen.queryByRole("heading", { level: 2, name: "Spain + Portugal" })).toBeNull();

    fireEvent.change(filtre, { target: { value: "unswipe" } });
    expect(screen.queryByText("beyza@sophia.com")).toBeNull();
    expect(screen.queryByText("omer@sophia.com")).toBeNull();
    expect(screen.getByText("No creator matches these filters.")).toBeTruthy();

    fireEvent.change(filtre, { target: { value: "sophia" } });
    expect(screen.getByText("beyza@sophia.com")).toBeTruthy();
    expect(screen.queryByText("omer@sophia.com")).toBeNull();
  });

  describe("cohortes du lundi", () => {
    const compte = (id: string, poster_id: string, warmup_ends_at: string | null = null) => ({
      id,
      poster_id,
      handle_tiktok: id,
      persona_nom: id,
      langue: "tr",
      type_compte: "perso",
      is_active: true,
      classement: "passable",
      warmup_started_at: warmup_ends_at ? "2026-10-20T10:00:00Z" : null,
      warmup_ends_at,
      avatar_url: null,
      parts_applications: null,
      ugc_ai_video: false,
    });

    beforeEach(() => {
      // Beyza : 1er post le mardi 20/10 (cohorte 19/10), puis un 2e compte (doublée) parti le 26/10.
      // Marta : partie le 12/10. Élodie : en warm-up jusqu'au lundi 26/10. Solo : aucun compte.
      listerComptes.mockResolvedValue([
        compte("c-beyza", "beyza"),
        compte("c-beyza-2", "beyza", "2026-10-25T23:00:00Z"),
        compte("c-marta", "marta"),
        compte("c-elodie", "elodie", "2026-10-25T23:00:00Z"),
      ]);
      premiersJoursComptes.mockResolvedValue(
        new Map([
          ["c-beyza", "2026-10-20"],
          ["c-marta", "2026-10-12"],
        ]),
      );
    });

    it("filtre par lundi de démarrage ; un posteur doublé reste dans sa cohorte d'origine", async () => {
      renderPage();
      await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });
      const filtre = screen.getByLabelText("Cohort (start Monday)") as HTMLSelectElement;
      await waitFor(() => expect(within(filtre).getByRole("option", { name: /19 Oct · W43 \(1\)/ })).toBeTruthy());
      expect(within(filtre).getByRole("option", { name: /12 Oct · W42 \(1\)/ })).toBeTruthy();
      expect(within(filtre).getByRole("option", { name: "Not started yet (1)" })).toBeTruthy();

      fireEvent.change(filtre, { target: { value: "2026-10-19" } });
      await waitFor(() => expect(screen.queryByText("marta@sophia.com")).toBeNull());
      expect(screen.getByText("beyza@sophia.com")).toBeTruthy();
      expect(screen.queryByText("elodie@sophia.com")).toBeNull();
      expect(screen.queryByText("seule@sophia.com")).toBeNull();
      // Chaque compte d'un posteur à plusieurs comptes garde son propre lundi.
      expect(screen.getByText("started 26 Oct")).toBeTruthy();

      fireEvent.change(filtre, { target: { value: "pas-demarre" } });
      await waitFor(() => expect(screen.getByText("seule@sophia.com")).toBeTruthy());
      expect(screen.queryByText("beyza@sophia.com")).toBeNull();
    });

    it("la cohorte se lit dans l'adresse : un lien partagé ouvre la même cohorte", async () => {
      renderPage("/admin/posters?cohorte=2026-10-12");
      await waitFor(() => expect(screen.getByText("marta@sophia.com")).toBeTruthy());
      expect(screen.queryByText("beyza@sophia.com")).toBeNull();
      expect((screen.getByLabelText("Cohort (start Monday)") as HTMLSelectElement).value).toBe("2026-10-12");
      expect(screen.getByText(/^Cohort 12 Oct · week \d+$/)).toBeTruthy();
    });
  });
});
