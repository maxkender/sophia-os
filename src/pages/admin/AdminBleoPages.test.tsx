import fs from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";

import i18next from "@/locales";

const RUN = "bc962101-7d50-4a5d-b198-451e4574278b";
const FAMILLE = "f0000000-0000-4000-8000-000000000001";
const LABEL = "1abe1000-0000-4000-8000-000000000001";

const resumePlan = {
  mode: "ombre",
  comptes: 249,
  creneaux: 498,
  creneaux_vides: 0,
  duree_s: 17.8,
  par_file: { juger: 149, rappel: 4, valeur: 345 },
  par_categorie: { juger: 149, rappel: 4, recolte: 244, gagnant_servi: 42, non_gagnant_neuve: 55, non_gagnant_servie: 4 },
  par_appli: { sophia: 392, unswipe: 64, micabo: 42 },
  relaches: { tout: 4, hors_file: 7 },
  tests_places: 142,
  testables_recents: 62,
  testables_recents_complets: 34,
  labels_file_juger: { RH: { utilise: 7, capacite: 7 } },
};

const changerModeBleo = vi.fn((mode: string) =>
  Promise.resolve({ mode, avant: "ombre", le: "2026-11-02T21:00:00Z", dernier_plan: null }),
);

vi.mock("@/features/auth/AuthContext", async (original) => ({
  ...(await original<typeof import("@/features/auth/AuthContext")>()),
  useAuth: () => ({ role: "admin" }),
}));

// Les lectures sont remplacées, les aides du module (runOfficiel, TAILLE_PAGE) restent les vraies.
vi.mock("@/features/bleo/api", async (original) => ({
  ...(await original<typeof import("@/features/bleo/api")>()),
  changerModeBleo: (mode: string) => changerModeBleo(mode),
  listerSuivi: () =>
    Promise.resolve([
      { jour: "2026-11-04", assignes: 500, publies: 450, mesures: 10, r_median: null, part_10k: 0.03, vues_par_post: 2100, plan_bleo: 470, tierlist: 30 },
      { jour: "2026-11-03", assignes: 500, publies: 460, mesures: 455, r_median: 1.21, part_10k: 0.09, vues_par_post: 5300, plan_bleo: 480, tierlist: 20 },
    ]),
  lireAlerteSuivi: () =>
    Promise.resolve({
      alerte: true,
      jour_fin: "2026-11-06",
      jours_recents: 3,
      jours_reference: 14,
      r_recent: 0.8,
      r_reference: 1,
      baisse: 0.2,
      seuil: 0.15,
    }),
  lireReglagesBleo: () =>
    Promise.resolve({ mode: "ombre", slide_marquee: false, boite: { generation_max: 2, declinaisons_par_parent: 3 } }),
  listerNuits: () =>
    Promise.resolve([
      {
        jour: "2026-10-29",
        demarre_le: "2026-10-29T11:43:00Z",
        fini_le: "2026-10-29T11:43:13Z",
        erreur: null,
        resume: { duree_s: 13.1, r_calcules: 22, juges: 2, etats: { juge: 2336, a_juger: 1904 }, familles_closes: 243 },
      },
    ]),
  listerRuns: () =>
    Promise.resolve([
      { id: RUN, jour_vise: "2026-10-30", mode: "ombre", demarre_le: "2026-10-29T13:00:00Z", fini_le: "2026-10-29T13:00:18Z", erreur: null, resume: resumePlan },
      { id: "essai", jour_vise: "2026-10-30", mode: "ombre", demarre_le: "2026-10-29T11:00:00Z", fini_le: null, erreur: "essai manuel", resume: null },
    ]),
  listerPlan: () =>
    Promise.resolve({
      total: 1,
      lignes: [
        {
          id: "p1",
          run_id: RUN,
          jour_vise: "2026-10-30",
          compte_id: "c1",
          handle_tiktok: "emma.inspira316",
          creneau: 1,
          contenu_id: "k1",
          titre: "9 mois à galérer",
          famille_id: FAMILLE,
          accroche: "6 erreurs debiles qui m ont gardee au chomage",
          langue: "ro",
          application: "sophia",
          label_id: LABEL,
          label: "rh",
          file_bleo: "valeur",
          categorie: "recolte",
          valeur_tirage: 3.21,
          relache: null,
          etat_bleo: "juge",
          verdict: "gagnant",
          reel_titres: null,
          identique_au_reel: false,
        },
      ],
    }),
  listerLabelsBleo: () => Promise.resolve([{ id: LABEL, slug: "rh", nom: "RH", voie: 1 }]),
  listerFamilles: () =>
    Promise.resolve({
      total: 1,
      familles: [
        {
          id: FAMILLE,
          label_id: LABEL,
          label: "rh",
          label_nom: "RH",
          voie: 1,
          accroche: "6 erreurs debiles qui m ont gardee au chomage",
          racine_contenu_id: "k0",
          racine_titre: "titre",
          verdict: "gagnante",
          verdict_le: "2026-10-29T11:06:41Z",
          close: false,
          close_le: null,
          created_at: "2026-09-10T13:51:16Z",
          n_contenus: 3,
          gen_max: 1,
          n_passages: 41,
          vues_max: 968500,
          vues_total: 2509832,
          r_median: 4.69,
          r_moyen: 5.12,
          dernier_passage: "2026-10-20T14:11:04Z",
        },
      ],
    }),
  lireFamille: () =>
    Promise.resolve({
      id: FAMILLE,
      label_id: LABEL,
      label: "rh",
      label_nom: "RH",
      voie: 1,
      accroche: "6 erreurs debiles qui m ont gardee au chomage",
      racine_contenu_id: "k0",
      racine_titre: "titre",
      verdict: "gagnante",
      verdict_le: "2026-10-29T11:06:41Z",
      close: true,
      close_le: "2026-10-29T12:00:00Z",
      created_at: "2026-09-10T13:51:16Z",
      n_contenus: 2,
      gen_max: 1,
      n_passages: 2,
      vues_max: 47000,
      vues_total: 60000,
      r_median: 2.1,
      dernier_passage: "2026-10-20T14:11:04Z",
      r_moyen: 2.4,
    }),
  listerContenusFamille: () =>
    Promise.resolve([
      {
        id: "k0",
        titre: "La racine",
        famille_id: FAMILLE,
        generation: 0,
        parent_bleo_id: null,
        type_bleo: "historique",
        classe_defaut: "import",
        etat_bleo: "juge",
        verdict: "gagnant",
        statut: "valide",
        created_at: "2026-09-10T13:51:16Z",
        juge_le: null,
        pod: null,
        source_url: "https://www.tiktok.com/@x/video/1",
        langue_source: "fr",
        n_passages: 2,
        vues_max: 47000,
        vues_moyenne: 30000,
        r_median: 2.1,
        dernier_passage: null,
        valeur_max: 3.2,
        n_langues: 4,
        r_moyen: 2.4,
        texte_slide1: "hobbies that will make you\ndisgustingly confident",
        texte_slide2: "voice journaling",
        image_slide1: "https://exemple.test/1.jpg",
      },
    ]),
  listerPassagesFamille: () =>
    Promise.resolve([
      {
        id: "pa1",
        contenu_id: "k0",
        compte_id: "c1",
        langue: "fr",
        date_publication_prevue: "2026-10-20",
        statut: "publie",
        vues: 47000,
        r: 2.1,
        publie_at: "2026-10-20T14:00:00Z",
        publie_url: "https://www.tiktok.com/@y/video/2",
        file_bleo: null,
        est_rappel: false,
        comptes: { handle_tiktok: "lea.etudes" },
      },
    ]),
  listerValeursFamille: () =>
    Promise.resolve([
      { contenu_id: "k0", langue: "fr", forme: 5, n_post: 3, n_accroche: 0, facteur_age: 1, valeur: 1.08, calcule_le: "2026-10-30T03:15:00Z" },
      { contenu_id: "k0", langue: "de", forme: 5, n_post: 0, n_accroche: 0, facteur_age: 1, valeur: 5, calcule_le: "2026-10-30T03:15:00Z" },
    ]),
  listerBoitePosts: () =>
    Promise.resolve([
      {
        rang: 1,
        sorte: "g2",
        accroche_attendue: "reformulee",
        accroche: "6 erreurs debiles qui m ont gardee au chomage",
        famille_id: FAMILLE,
        parent_contenu_id: "k1",
        faites: 0,
        au_budget: true,
        verdict_le: "2026-10-29T11:06:41Z",
        parent: { titre: "9 mois à galérer", langue_source: "fr", generation: 1, source_url: null },
        post: {
          langue: "fr",
          vues: 47000,
          r: 4.61,
          url: "https://www.tiktok.com/@x/photo/1",
          slides: [
            { position: 1, texte: "6 erreurs débiles", appli: false, image: "https://exemple.test/1.jpg", inspiration: null },
            { position: 4, texte: "Sophia m'a aidée", appli: true, image: "https://exemple.test/4.jpg", inspiration: null },
          ],
        },
        passages: [{ langue: "fr", vues: 47000, r: 4.61, url: "https://www.tiktok.com/@x/photo/1" }],
      },
    ]),
  listerJauge: () =>
    Promise.resolve([
      { label_id: LABEL, pod: "originaux_rh", familles_en_boite: 27, par_jour: 5.29, semaines: 2.2, part_full_test: 0.3 },
    ]),
  listerBoite: () =>
    Promise.resolve([
      {
        label_id: LABEL,
        famille_id: FAMILLE,
        accroche: "6 erreurs debiles qui m ont gardee au chomage",
        sorte: "g2",
        parent_contenu_id: "k1",
        faites: 0,
        verdict_le: "2026-10-29T11:06:41Z",
        au_budget: true,
        rang: 1,
        accroche_attendue: "reformulee",
      },
    ]),
}));

import { AdminBleoFamillePage } from "./AdminBleoFamillePage";
import { AdminBleoFamillesPage } from "./AdminBleoFamillesPage";
import { AdminBleoPage } from "./AdminBleoPage";
import { AdminBleoPlanPage } from "./AdminBleoPlanPage";
import { AdminBleoReglagesPage } from "./AdminBleoReglagesPage";
import { SectionBoitePodz } from "@/features/bleo/SectionBoitePodz";

function rendre(element: React.ReactElement, chemin = "/", motif = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[chemin]}>
        <Routes>
          <Route path={motif} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("section BLEO de l'OS", () => {
  beforeAll(async () => {
    await i18next.changeLanguage("fr");
  });

  it("vue d'ensemble : mode, dernier plan, dernière nuit, historique", async () => {
    rendre(<AdminBleoPage />);
    expect(await screen.findByText("Mode : à blanc")).toBeInTheDocument();
    expect(await screen.findByText(/Dernier plan/)).toBeInTheDocument();
    expect(screen.getAllByText("30 %").length).toBeGreaterThan(0); // 149 / 498 en file à juger
    expect(screen.getByText("243")).toBeInTheDocument(); // familles closes de la nuit
    expect(screen.getByText("Essai")).toBeInTheDocument();
    expect(screen.getByText(/Pas encore de rapport/)).toBeInTheDocument();
  });

  it("vue d'ensemble : l'interrupteur passe en actif après confirmation, plan suivi affiché", async () => {
    rendre(<AdminBleoPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Passer en actif" }));
    expect(await screen.findByText("Passer BLEO en actif ?")).toBeInTheDocument();
    expect(screen.getByText(/Plan suivi : celui du .*, 498 créneaux\./)).toBeInTheDocument();
    expect(changerModeBleo).not.toHaveBeenCalled();
    const boutons = screen.getAllByRole("button", { name: "Passer en actif" });
    fireEvent.click(boutons[boutons.length - 1]);
    await vi.waitFor(() => expect(changerModeBleo).toHaveBeenCalledWith("actif"));
    await vi.waitFor(() => expect(screen.queryByText("Passer BLEO en actif ?")).not.toBeInTheDocument());
  });

  it("vue d'ensemble : suivi avant/après, jour non mesuré en attente, alerte à −20 %", async () => {
    rendre(<AdminBleoPage />);
    expect(await screen.findByText("Alerte : le r médian baisse de 20 %")).toBeInTheDocument();
    expect(screen.getByText("1,21")).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.getByText("96 %")).toBeInTheDocument(); // 480 sur 500 servis par le plan
  });

  it("plan du jour : le tirage officiel par défaut, compte par compte", async () => {
    rendre(<AdminBleoPlanPage />);
    expect(await screen.findByText("@emma.inspira316")).toBeInTheDocument();
    expect(screen.getByText("6 erreurs debiles qui m ont gardee au chomage").closest("a")).toHaveAttribute(
      "href",
      `/admin/bleo/familles/${FAMILLE}`,
    );
    expect(screen.getByText("Pas encore assigné")).toBeInTheDocument();
  });

  it("familles : la liste mène à la fiche", async () => {
    rendre(<AdminBleoFamillesPage />);
    const lien = await screen.findByText("6 erreurs debiles qui m ont gardee au chomage");
    expect(lien.closest("a")).toHaveAttribute("href", `/admin/bleo/familles/${FAMILLE}`);
    expect(screen.getByText("969 k")).toBeInTheDocument();
    expect(screen.getByText("5,12")).toBeInTheDocument(); // r moyen plafonné, la mesure qui ferme (D36)
    expect(screen.getByText("1 familles")).toBeInTheDocument();
  });

  it("une famille : contenus par génération et passages", async () => {
    rendre(<AdminBleoFamillePage />, `/admin/bleo/familles/${FAMILLE}`, "/admin/bleo/familles/:id");
    // La slide 1 et la première ligne de la slide 2 remplacent la description TikTok (titre en infobulle).
    expect(await screen.findAllByText("hobbies that will make you disgustingly confident")).not.toHaveLength(0);
    expect(screen.getAllByText("→ voice journaling")).not.toHaveLength(0);
    expect(screen.getAllByText("G0").length).toBeGreaterThan(0);
    expect(screen.getByText("Close")).toBeInTheDocument();
    expect(await screen.findByText("@lea.etudes")).toBeInTheDocument();
    expect(await screen.findByText("Valeur par langue")).toBeInTheDocument();
    expect((await screen.findByText("1,08")).closest("td")).toHaveAttribute("title", expect.stringContaining("0,6^3"));
  });

  it("boîte des podz (en bas de Pods) : jauge, boîte, 2ᵉ déclinaison en tête avec accroche reformulée", async () => {
    rendre(<SectionBoitePodz />);
    expect(await screen.findByText("rh")).toBeInTheDocument();
    expect(await screen.findByText("2ᵉ déclinaison")).toBeInTheDocument();
    expect(screen.getByText("accroche reformulée")).toBeInTheDocument();
    expect(screen.getByText("Au budget")).toBeInTheDocument();
    expect(screen.getByText("0/3")).toBeInTheDocument();
    // D37 : une ligne s'ouvre sur le post parent tel que posté, slide d'appli marquée.
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    expect(await screen.findByText("6 erreurs débiles")).toBeInTheDocument();
    expect(screen.getByText("Sophia m'a aidée")).toBeInTheDocument();
    expect(screen.getByText("appli")).toBeInTheDocument();
  });

  it("réglages : en lecture, section par section", async () => {
    rendre(<AdminBleoReglagesPage />);
    expect(await screen.findByText("Boîte des podz")).toBeInTheDocument();
    expect(screen.getByText("declinaisons_par_parent")).toBeInTheDocument();
    expect(screen.getByText("ombre")).toBeInTheDocument();
  });

  it("menu : Pods et Allocation rangées dans BLEO, la boîte des podz sous le tableau de bord de Pods", () => {
    const lire = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
    const menu = lire("src/components/layout/AdminLayout.tsx");
    const bleo = menu.slice(menu.indexOf('title: t("navSection.bleo")'), menu.indexOf('title: t("navSection.tests")'));
    for (const r of ["/admin/bleo", "/admin/bleo/plan", "/admin/bleo/familles", "/admin/pods", "/admin/repartition", "/admin/bleo/reglages"]) {
      expect(bleo).toContain(`to: "${r}"`);
    }
    // Déplacées, pas copiées : une seule entrée chacune dans tout le menu.
    expect(menu.split('to: "/admin/pods"').length).toBe(2);
    expect(menu.split('to: "/admin/repartition"').length).toBe(2);
    // Juste sous le tableau de bord des podz, avant les livraisons à valider.
    const pods = lire("src/pages/admin/AdminPodsPage.tsx");
    const page = pods.slice(pods.indexOf("export function AdminPodsPage"));
    expect(page.indexOf("<SectionBoitePodz />")).toBeGreaterThan(page.indexOf("<TableauDeBord />"));
    expect(page.indexOf("<SectionBoitePodz />")).toBeLessThan(page.indexOf("slugs.map("));
  });
});
