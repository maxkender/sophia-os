/** Recruitment Automation → Cohorts : les tableaux de bord (lecture seule). */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { DonneesCohortes, PosteurCohorte, VuesCohorte } from "./api";
import {
  bloquesParEtape,
  comparaison,
  departs,
  entonnoir,
  entonnoirPar,
  graduations,
  listeCohortes,
  statsSemaines,
} from "./logique";

const api = vi.hoisted(() => ({ lireCohortes: vi.fn<() => Promise<DonneesCohortes>>() }));
vi.mock("./api", () => api);

import { PageCohortesTableau } from "./PageCohortesTableau";

const p = (o: Partial<PosteurCohorte>): PosteurCohorte => ({
  poster_id: "p", nom: "Ana", hm_id: "h1", hm_nom: "Lucia", pays: "PT", cohorte_lundi: "2026-11-02", reporte_de: null, actif: true,
  offre_at: "2026-10-26T10:00:00Z", bienvenue_at: null, connexion_at: null, slack_at: null, sur_slack: false, tiktok_at: null,
  warmup_at: null, pret: false, relances_slack: 0, relances_upwork: 0, main_hm: 0, en_file: 0, derniere_reaction: null,
  kill_at: null, kill_raison: null, arret_at: null, arret_raison: null, double_at: null, premier_post: null, semaines: [], ...o,
});

const AUJ = "2026-10-29";
const PROCHAINE = [
  p({ poster_id: "a", nom: "Ana", bienvenue_at: "2026-10-26T11:00:00Z", connexion_at: "2026-10-27T09:00:00Z", sur_slack: true, slack_at: "2026-10-27T10:00:00Z", tiktok_at: "2026-10-28T08:00:00Z", warmup_at: "2026-10-28T09:00:00Z", pret: true }),
  p({ poster_id: "b", nom: "Bob", hm_id: "h2", hm_nom: "Regina", pays: "NO", bienvenue_at: "2026-10-26T11:00:00Z", relances_slack: 0, relances_upwork: 2, reporte_de: "2026-10-26" }),
  p({ poster_id: "c", nom: "Cleo", bienvenue_at: "2026-10-26T11:00:00Z", connexion_at: "2026-10-27T09:00:00Z", relances_slack: 1, relances_upwork: 1, main_hm: 1, en_file: 2 }),
];
const s = (k: number, comptes: number, liens: number, comptes6 = 0) => ({ k, comptes, prevus: comptes * 14, liens, comptes6 });
const PASSEE = [
  p({ poster_id: "d", nom: "Dan", cohorte_lundi: "2026-10-19", premier_post: "2026-10-19", semaines: [s(1, 1, 8, 1), s(2, 1, 6, 1)], double_at: "2026-10-24T10:00:00Z" }),
  p({ poster_id: "e", nom: "Eva", cohorte_lundi: "2026-10-19", premier_post: "2026-10-20", semaines: [s(1, 1, 2)], actif: false, kill_at: "2026-10-24T10:00:00Z", kill_raison: "absent" }),
  p({ poster_id: "f", nom: "Fay", cohorte_lundi: "2026-10-19", hm_id: "h2", hm_nom: "Regina", actif: false, arret_raison: "je_ne_veux_plus", arret_at: "2026-10-18T10:00:00Z" }),
  p({ poster_id: "g", nom: "Gil", cohorte_lundi: "2026-10-19", reporte_de: "2026-10-12", premier_post: "2026-10-26", semaines: [s(2, 1, 5)] }),
];
const VUES: VuesCohorte[] = [
  { cohorte_lundi: "2026-10-19", niveau: "cohorte", hm_id: null, k: null, posts: 21, mediane: 1020 },
  { cohorte_lundi: "2026-10-19", niveau: "semaine", hm_id: null, k: 1, posts: 10, mediane: 900 },
  { cohorte_lundi: "2026-10-19", niveau: "semaine", hm_id: null, k: 2, posts: 11, mediane: 1100 },
];

describe("la logique des cohortes", () => {
  it("le sélecteur : la prochaine d'abord, puis les commencées, la plus récente d'abord", () => {
    expect(listeCohortes([...PROCHAINE, ...PASSEE, p({ cohorte_lundi: "2026-11-09" })], AUJ)).toEqual([
      { lundi: "2026-11-02", taille: 3, statut: "prochaine" },
      { lundi: "2026-10-19", taille: 4, statut: "passee" },
    ]);
  });

  it("l'entonnoir avec les %, par HM et par pays ; chaque bloquée à sa 1re étape pas faite", () => {
    expect(entonnoir(PROCHAINE).map((m) => `${m.etape}:${m.n}/${m.pct}`)).toEqual([
      "offre:3/100", "bienvenue:3/100", "connexion:2/67", "slack:1/33", "tiktok:1/33", "warmup:1/33", "pret:1/33",
    ]);
    expect(entonnoirPar(PROCHAINE, "hm").map((l) => `${l.libelle}:${l.total}:${l.n[2]}`)).toEqual(["Lucia:2:2", "Regina:1:0"]);
    expect(entonnoirPar(PROCHAINE, "pays").map((l) => l.cle)).toEqual(["PT", "NO"]);
    const b = bloquesParEtape(PROCHAINE);
    expect(b.get("connexion")!.map((x) => x.p.poster_id)).toEqual(["b"]);
    expect(b.get("connexion")![0]!.depuis).toBe("2026-10-26T11:00:00Z");
    expect(b.get("slack")!.map((x) => x.p.poster_id)).toEqual(["c"]);
    expect(b.get("pret")).toEqual([]);
  });

  it("une cohorte passée : rétention, posts par compte, part à 6, médiane ; Kills et arrêts par semaine", () => {
    const sem = statsSemaines(PASSEE, VUES, "2026-10-19", AUJ);
    expect(sem.map((x) => [x.k, x.retention, x.moyenne, x.part6, x.mediane, x.enCours])).toEqual([
      [1, 50, 5, 50, 900, false],
      [2, 50, 5.5, 50, 1100, true],
    ]);
    expect(departs(PASSEE, "2026-10-19").map((d) => `${d.type}:${d.k}:${d.raison}`)).toEqual(["arret:0:je_ne_veux_plus", "kill:1:absent"]);
    const c = comparaison([...PROCHAINE, ...PASSEE], VUES, AUJ);
    expect(c[0]).toMatchObject({ lundi: "2026-11-02", pret: 33, r1: null });
    expect(c[1]).toMatchObject({ lundi: "2026-10-19", taille: 4, pret: 50, r1: 50, r2: 50, r4: null, moyenneS1: 5, kills: 1, doubles: 1, mediane: 1020 });
  });

  it("des graduations rondes", () => {
    expect(graduations(100).ticks).toEqual([0, 25, 50, 75, 100]);
    expect(graduations(1100).haut).toBe(1500);
    expect(graduations(0).ticks[0]).toBe(0);
  });
});

function rendu(url = "/admin/auto/cohorts") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <PageCohortesTableau maintenant={new Date("2026-10-29T12:00:00Z")} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("la page Cohorts", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    api.lireCohortes.mockResolvedValue({ postes: [...PROCHAINE, ...PASSEE], vues: VUES, lu_at: "2026-10-29T11:58:00Z" });
  });

  it("la prochaine par défaut : compte à rebours, entonnoir, bloquées avec lien vers la carte, messages, reportées", async () => {
    rendu();
    expect(await screen.findByText(/Will they be ready\? Cohort of/)).toBeInTheDocument();
    expect(screen.getByTestId("compte-a-rebours").textContent).toMatch(/Sunday midnight in 3 d 11 h 0 min/);
    expect(screen.getByText(/Updated at/)).toBeInTheDocument();
    expect(document.querySelector('[data-etape="connexion"]')!.textContent).toMatch(/2 · 67 %/);
    const bloque = document.querySelector<HTMLElement>('[data-bloque="b"]')!;
    expect(within(bloque).getByRole("link", { name: "Bob" }).getAttribute("href")).toBe("/admin/auto/recruits#recrue-b");
    expect(within(bloque).getByText(/postponed from/)).toBeInTheDocument();
    expect(within(bloque).getByText("Slack 0 · Upwork 2")).toBeInTheDocument();
    expect(document.querySelector('[data-reporte="b"]')).not.toBeNull();
    expect(screen.getByText("Slack 1 · Upwork 3")).toBeInTheDocument();
  });

  it("une cohorte passée : chiffres, graphes, par HM ; cliquer une ligne de la comparaison l'ouvre", async () => {
    rendu();
    await screen.findByTestId("comparaison");
    fireEvent.click(document.querySelector('[data-cohorte="2026-10-19"]')!);
    await waitFor(() => expect(document.querySelector('[data-vue="passee"]')).not.toBeNull());
    const bilan = screen.getByTestId("bilan-passee");
    expect(within(bilan).getByText("Started").parentElement!.parentElement!.textContent).toMatch(/3\/ 4/);
    expect(screen.getByRole("img", { name: /Weekly retention : W1 50 %, W2 50 %/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Median views per post : W1 900, W2 1100/ })).toBeInTheDocument();
    expect(document.querySelector('[data-depart-semaine="0"]')!.textContent).toMatch(/asked to stop/);
    expect(document.querySelector('[data-depart-semaine="1"]')!.textContent).toMatch(/missed posts/);
    expect(document.querySelector('[data-hm="h2"]')!.textContent).toMatch(/Regina/);
    expect(screen.queryByRole("button", { name: /Validate|Send/ })).toBeNull();
  });
});
