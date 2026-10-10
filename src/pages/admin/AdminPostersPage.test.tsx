import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";
import type { PosterProfil } from "@/features/moteur/types";

const listerPosters = vi.fn();
const majZoneRecruteur = vi.fn();
const listerComptes = vi.fn();

vi.mock("@/features/auth/AuthContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/AuthContext")>()),
  useAuth: () => ({ user: { id: "admin-1" }, role: "admin" }),
}));

vi.mock("@/features/moteur/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/moteur/api")>()),
  listerPosters: () => listerPosters(),
  listerComptesAvecDormants: () => listerComptes(),
  listerLanguesReference: async () => ["fr", "tr", "es"],
  listerApplications: async () => [],
  listerLabels: async () => [],
  labelsDesComptes: async () => new Map(),
  majZoneRecruteur: (id: string, zone: string | null) => majZoneRecruteur(id, zone),
}));

vi.mock("@/features/moteur/apiMultiApp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/moteur/apiMultiApp")>()),
  listerLiensLabels: async () => [],
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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
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

    // Lien vers son DM, dans la fiche.
    const fiche = screen.getByRole("heading", { level: 2, name: "Kris" }).parentElement!.parentElement!;
    fireEvent.click(within(fiche).getByRole("button", { name: "Amanda" }));
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

  it("DM : total de toute son équipe (HM compris), comme l'ancien arbre", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });
    const section = sectionZone("Turkey + Israel");
    // Amanda : Beyza en direct + Marta via Kris (HM, autre zone).
    expect(within(section).getByText("1 HM · 2 creator(s) · 2 not created · 0 warmup · 0 active")).toBeTruthy();
    expect(
      within(section).getByText("Creators hired by the DM · 1 creator(s) · 1 not created · 0 warmup · 0 active"),
    ).toBeTruthy();

    fireEvent.click(within(section).getByRole("button", { name: "Amanda" }));
    const fiche = (await screen.findByRole("heading", { level: 2, name: "Amanda" })).parentElement!.parentElement!;
    expect(within(fiche).getByText("1 HM · 2 creator(s) · 2 not created · 0 warmup · 0 active")).toBeTruthy();
  });

  it("filtre de phase : les compteurs restent ceux de toute l'équipe, rien n'est dit « sans créateur »", async () => {
    const hmOff = profil({ id: "otto", role: "hiring_manager", prenom: "Otto", is_active: false, zone_recrutement: "France" });
    listerPosters.mockResolvedValue([...PROFILS, hmOff, profil({ id: "c6", role: "poster", prenom: "Cesar", manager_id: "otto" })]);
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });
    fireEvent.change(screen.getByLabelText("Phase"), { target: { value: "actif" } });

    const espagne = sectionZone("Spain + Portugal");
    expect(within(espagne).getByText("1 creator(s) · 1 not created · 0 warmup · 0 active")).toBeTruthy();
    expect(within(espagne).getByText("0 shown with these filters")).toBeTruthy();
    expect(within(espagne).getByText("No creator matches the filters (1 in total).")).toBeTruthy();
    // Désactivé avec un créateur : reste dans sa zone, pas replié « sans créateur ».
    expect(within(sectionZone("France")).getByRole("button", { name: "Otto" })).toBeTruthy();
    expect(screen.getByText(/Deactivated recruiters with no creators \(1\)/)).toBeTruthy();
  });

  it("recherche par l'email d'un recruteur : ses créateurs restent affichés", async () => {
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Turkey + Israel" });
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "kris@sophia" } });
    expect(screen.getByText("Marta")).toBeTruthy();
    expect(screen.queryByText("Beyza")).toBeNull();
  });
});
