import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "i18next";

import "@/locales";
import type {
  RecrutementCreateur,
  RecrutementHm,
  RecrutementSuggestion,
  StatsCreateur10j,
} from "@/features/recrutements/types";

const useRecrutements = vi.fn();

vi.mock("@/features/recrutements/useRecrutements", () => ({
  useRecrutements: () => useRecrutements(),
}));

vi.mock("@/features/recrutements/api", () => ({
  majStatutSuggestion: vi.fn(async () => undefined),
  marquerAjoutUpwork: vi.fn(async () => undefined),
  enregistrerEmailPerso: vi.fn(async () => undefined),
  creerSuggestionManuelle: vi.fn(async () => undefined),
    majChampHm: vi.fn(async () => undefined),
  majChampCreateur: vi.fn(async () => undefined),
  majCibleCreateurs: vi.fn(async () => undefined),
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminRecrutementsPage } from "./AdminRecrutementsPage";
import { AdminRecrutementsPaysPage } from "./AdminRecrutementsPaysPage";

function hm(p: Partial<RecrutementHm> = {}): RecrutementHm {
  return {
    id: "h1",
    profile_id: "p1",
    upwork_freelancer_id: "uw1",
    upwork_profile_url: "https://www.upwork.com/freelancers/~hm",
    avatar_url: null,
    prenom: "Ada",
    nom: "Lovelace",
    nom_affiche: "Ada Lovelace",
    pays: ["fr"],
    email_os: "adal@sophia.com",
    email_perso: null,
    slack_user_id: null,
    talks_at: "2026-09-01T10:00:00Z",
    contrat_envoye_at: "2026-09-02T10:00:00Z",
    contrat_signe_at: "2026-09-03T10:00:00Z",
    codes_envoyes_at: null,
    slack_invite_envoyee_at: null,
    email_perso_demandee_at: null,
    rejoint_slack_at: null,
    rejoint_os_at: null,
    ajoute_upwork_at: null,
    job_post_at: null,
    job_post_id: null,
    job_post_titre: null,
    cible_createurs: 10,
    notes: null,
    dernier_message: null,
    dernier_message_at: null,
    dernier_message_auteur: null,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    ...p,
  };
}

function suggestion(p: Partial<RecrutementSuggestion> = {}): RecrutementSuggestion {
  return {
    id: "s1",
    hm_id: "h1",
    createur_id: null,
    pays: "fr",
    phase: 0,
    kind: "reponse",
    canal: "upwork",
    titre: "Répondre à Ada",
    corps: "Salut Ada, on continue ?",
    prompt_autom: {},
    empreinte: "reponse:room:1",
    statut: "en_attente",
    validee_at: null,
    ignoree_at: null,
    executee_at: null,
    execution_log: null,
    created_at: "2026-09-07T10:00:00Z",
    updated_at: "2026-09-07T10:00:00Z",
    ...p,
  };
}

function renderHub() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/admin/recrutements"]}>
          <AdminRecrutementsPage />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function renderPays(pays = "fr") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[`/admin/recrutements/${pays}`]}>
          <Routes>
            <Route path="/admin/recrutements/:pays" element={<AdminRecrutementsPaysPage />} />
            <Route path="/admin/recrutements" element={<div>hub</div>} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("AdminRecrutementsPage", () => {
  beforeEach(() => {
    void i18n.changeLanguage("fr");
    useRecrutements.mockReset();
    useRecrutements.mockReturnValue({
      hms: [hm()],
      createurs: [],
      suggestions: [suggestion()],
      run: { id: "r1", started_at: "2026-09-07T08:00:00Z", finished_at: "2026-09-07T08:05:00Z", resume: "ok" },
      stats: new Map(),
      fiches: new Map(),
      statsPending: false,
      isPending: false,
      error: null,
    });
  });

  it("affiche le hub pays et l'inbox", () => {
    renderHub();
    expect(screen.getByText("Recrutements")).toBeInTheDocument();
    expect(screen.getByText("France")).toBeInTheDocument();
    expect(screen.getByText("Royaume-Uni")).toBeInTheDocument();
    expect(screen.getByText("Inbox suggestions")).toBeInTheDocument();
    expect(screen.getByText("Répondre à Ada")).toBeInTheDocument();
    expect(screen.queryByText(/\/ 10/)).not.toBeInTheDocument();
    expect(screen.getByText("Valider")).toBeInTheDocument();
  });

  it("ouvre la page pays en phase 0", () => {
    renderPays("fr");
    expect(screen.getByText("France")).toBeInTheDocument();
    expect(screen.getAllByText(/Phase 0/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ada Lovelace").length).toBeGreaterThan(0);
    expect(screen.getByText("Ajouté à l’équipe Upwork (manuel)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Talks" })).toBeInTheDocument();
    expect(screen.getByText("Accès OS + Slack · En cours")).toBeInTheDocument();
  });

  it("redirige un pays inconnu", () => {
    renderPays("xx");
    expect(screen.getByText("hub")).toBeInTheDocument();
  });

  it("déplie la carte : dernier message, étapes manuelles, messages et actions", () => {
    useRecrutements.mockReturnValue({
      hms: [hm()],
      createurs: [],
      suggestions: [
        suggestion(),
        suggestion({
          id: "s2",
          kind: "action",
          titre: "Créer le compte OS",
          corps: "Créer adal@sophia.com et envoyer les codes.",
          empreinte: "acces_os:h1",
        }),
      ],
      run: null,
      stats: new Map(),
      fiches: new Map(),
      statsPending: false,
      isPending: false,
      error: null,
    });
    renderPays("fr");
    expect(screen.queryByText("Dernier message Upwork")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /détails/i }));
    expect(screen.getByText("Dernier message Upwork")).toBeInTheDocument();
    expect(screen.getByText("Étapes (coche à la main)")).toBeInTheDocument();
    expect(screen.getByText("Messages proposés")).toBeInTheDocument();
    expect(screen.getByText("Actions proposées")).toBeInTheDocument();
    expect(screen.getAllByText("Répondre à Ada").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Créer le compte OS").length).toBeGreaterThan(1);
  });

  it("affiche les stats OS phase 2 (posts / vues / $ / 1k)", () => {
    const stats = new Map<string, StatsCreateur10j>([
      [
        "c1",
        {
          posterId: "p1",
          prevus: 20,
          postes: 19,
          ratio: 19 / 20,
          flagVolume: false,
          vuesMoy10: 1601,
          vues10j: 30537,
          payeUsd: 20,
          usdPour1000: 0.655,
          ton: "ok",
        },
      ],
    ]);
    const createur: RecrutementCreateur = {
      id: "c1",
      hm_id: "h1",
      profile_id: "p1",
      pays: "fr",
      upwork_freelancer_id: null,
      upwork_profile_url: null,
      avatar_url: null,
      prenom: "Samsudeen",
      nom: "Wasiu",
      nom_affiche: "Samsudeen Wasiu",
      email_os: null,
      email_perso: null,
      slack_user_id: null,
      talks_at: null,
      contrat_envoye_at: null,
      contrat_signe_at: null,
      codes_envoyes_at: null,
      slack_invite_envoyee_at: null,
      rejoint_os_at: null,
      rejoint_slack_at: null,
      warmup_at: null,
      premier_post_at: "2026-08-20T10:00:00Z",
      dernier_message: null,
      dernier_message_at: null,
      dernier_message_auteur: null,
      created_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-08-01T10:00:00Z",
    };
    useRecrutements.mockReturnValue({
      hms: [hm()],
      createurs: [createur],
      suggestions: [],
      run: null,
      stats,
      fiches: new Map(),
      statsPending: false,
      isPending: false,
      error: null,
    });
    renderPays("fr");
    expect(screen.getByText("Samsudeen Wasiu")).toBeInTheDocument();
    expect(screen.getAllByText("19 / 20").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1,601").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.66 $").length).toBeGreaterThan(0);
  });
});
