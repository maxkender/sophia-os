import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  lireAccueils: vi.fn(),
  relierAccueil: vi.fn(),
  creerAccueil: vi.fn(),
  ecarterAccueil: vi.fn(),
  localiserAccueils: vi.fn(async () => []),
  lireAnnonces: vi.fn(async () => []),
  enregistrerAnnonce: vi.fn(),
  amorcerAnnonces: vi.fn(async () => ({ ok: true, posteurs: 3, lus: 3, annonces: 2, avec_pays: 1, generiques: 1, deja_dites: 0, erreurs: [] })),
}));
vi.mock("./api", () => api);
vi.mock("@/features/ckd/api", () => ({ listerHms: async () => [{ profile_id: "hm1", nom: "Aram", zone: null, posters: 3, slack_user_id: null }] }));
vi.mock("@/features/interrupteurs/api", () => ({ lireInterrupteurs: async () => ({ accueil_auto: "test" }) }));
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));

import { AccueilAuto } from "./AccueilAuto";

const accueil = (o: Record<string, unknown>) => ({
  contrat_id: "c1", job_id: "J1", job_titre: "Post TikToks", prenom: "Ana", nom: "Silva", debut_at: "2026-10-29T10:00:00Z",
  statut: "a_relier", raison: "annonce générique", pays: null, langue: null, hm_id: null, poster_id: null, email: null,
  cohorte_lundi: null, message_texte: null, message_at: null, updated_at: "2026-10-29T10:00:00Z", ...o,
});

function rendu(props: { hmSeulement?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AccueilAuto {...props} />
    </QueryClientProvider>,
  );
}

describe("système du 2 nov., partie A : l'accueil automatique", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("fr");
  });

  it("test : bandeau ; pays introuvable : une seule question (pays), la règle fait le reste ; le simulé montre son message", async () => {
    api.lireAccueils.mockResolvedValue([
      accueil({}),
      accueil({ contrat_id: "c2", prenom: "Bruno", statut: "simule", raison: "test : rien n'est créé ni envoyé", pays: "PT", langue: "pt", message_texte: "Hi Bruno, welcome to Vik Studios!" }),
      accueil({ contrat_id: "c3", prenom: "Carla", statut: "doublon", raison: "contrat déjà relié à un posteur" }),
    ]);
    api.relierAccueil.mockResolvedValue(undefined);
    rendu();
    const bloc = await screen.findByTestId("accueil-auto");
    expect(within(bloc).getByText(/Test : l'OS lit les nouveaux contrats/)).toBeTruthy();
    const ligne = (await within(bloc).findByText("Dans quel pays vit Ana Silva ?")).closest("li") as HTMLElement;
    // Une seule question : pas de menu Langue ni HM.
    expect(within(ligne).queryByLabelText("Langue")).toBeNull();
    expect(within(ligne).queryByLabelText("HM")).toBeNull();
    fireEvent.change(within(ligne).getByLabelText("Pays"), { target: { value: "IL" } });
    fireEvent.click(within(ligne).getByRole("button", { name: "Valider" }));
    await vi.waitFor(() => expect(api.relierAccueil).toHaveBeenCalledWith("c1", "IL", "he", null, true));
    expect(within(bloc).getByText("Simulé (test)")).toBeTruthy();
    expect(within(bloc).getByText("Doublon")).toBeTruthy();
    expect(within(bloc).getByText("Hi Bruno, welcome to Vik Studios!", { exact: false })).toBeTruthy();
  });

  it("pays fermé : « Créer quand même » ou « Ne pas créer » ; les autres équipes et les contrats classés à part", async () => {
    api.lireAccueils.mockResolvedValue([
      accueil({ contrat_id: "44790807", prenom: "Rui", nom: "Costa", equipe: "VIk Studios", raison: "pays fermé (PT)", pays: "PT", langue: "pt" }),
      accueil({ contrat_id: "44790808", prenom: "Dewi", nom: "Sari", equipe: "VIk Studios", raison: "pays fermé (ID)", pays: "ID", langue: "id" }),
      // 0493 : une autre équipe (Calyra) n'est jamais à relier, même non classée ; classée : listée à part.
      accueil({ contrat_id: "44800558", prenom: "Edis", nom: "Krupinskas", equipe: "Maximilien Kender" }),
      accueil({ contrat_id: "44801090", prenom: "Ausra", nom: "Simutiene", equipe: "Maximilien Kender", classement: "autre_activite", classement_raison: "autre activité (Calyra) : ignoré" }),
      accueil({ contrat_id: "44805186", prenom: "Erla", nom: "Menaj", equipe: "VIk Studios", classement: "hm", classement_raison: "HM contract (Hiring Manager for TikTok Creators, hourly)" }),
    ]);
    api.relierAccueil.mockResolvedValue(undefined);
    api.ecarterAccueil.mockResolvedValue(undefined);
    rendu();
    const rui = (await screen.findByText(/Rui Costa vit en Portugal, un pays fermé/)).closest("li") as HTMLElement;
    expect(screen.getByText("Contrats à relier (2)", { exact: false })).toBeTruthy();
    expect(screen.queryByText("Edis Krupinskas")).toBeNull();
    const classes = screen.getByTestId("accueils-classes");
    expect(classes.textContent).toContain("Ausra Simutiene");
    expect(classes.querySelector('[data-classe="hm"]')?.textContent).toContain("Contrat de HM");
    fireEvent.click(within(rui).getByRole("button", { name: "Créer quand même" }));
    await vi.waitFor(() => expect(api.relierAccueil).toHaveBeenCalledWith("44790807", "PT", "pt", null, false));
    const dewi = screen.getByText(/Dewi Sari vit en Indonésie, un pays fermé/).closest("li") as HTMLElement;
    fireEvent.click(within(dewi).getByRole("button", { name: "Ne pas créer" }));
    await vi.waitFor(() => expect(api.ecarterAccueil).toHaveBeenCalledWith("44790808", "pays fermé (ID)"));
  });

  it("côté HM : seulement les contrats à relier, rien s'il n'y en a pas", async () => {
    auth.role = "hiring_manager";
    api.lireAccueils.mockResolvedValue([accueil({ statut: "envoye" })]);
    rendu({ hmSeulement: true });
    await vi.waitFor(() => expect(api.lireAccueils).toHaveBeenCalled());
    expect(screen.queryByTestId("accueil-auto")).toBeNull();
  });

  it("admin : « Remplir depuis les contrats existants » et son bilan", async () => {
    auth.role = "admin";
    api.lireAccueils.mockResolvedValue([]);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AccueilAuto />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Remplir depuis les contrats existants" }));
    expect(await screen.findByTestId("bilan-amorcage")).toHaveTextContent("2 annonces remplies : 1 avec pays, 1 génériques");
  });
});
