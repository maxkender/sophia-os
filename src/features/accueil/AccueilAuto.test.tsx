import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  lireAccueils: vi.fn(),
  relierAccueil: vi.fn(),
  creerAccueil: vi.fn(),
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

  it("test : bandeau ; à relier : langue puis Relier ; le simulé montre son message", async () => {
    api.lireAccueils.mockResolvedValue([
      accueil({}),
      accueil({ contrat_id: "c2", prenom: "Bruno", statut: "simule", raison: "test : rien n'est créé ni envoyé", pays: "PT", langue: "pt", message_texte: "Hi Bruno, welcome to Vik Studios!" }),
      accueil({ contrat_id: "c3", prenom: "Carla", statut: "doublon", raison: "contrat déjà relié à un posteur" }),
    ]);
    api.relierAccueil.mockResolvedValue(undefined);
    rendu();
    const bloc = await screen.findByTestId("accueil-auto");
    expect(within(bloc).getByText(/Test : l'OS lit les nouveaux contrats/)).toBeTruthy();
    const ligne = (await within(bloc).findByText("Ana Silva")).closest("li") as HTMLElement;
    fireEvent.change(within(ligne).getByLabelText("Langue"), { target: { value: "pt" } });
    fireEvent.click(within(ligne).getByRole("button", { name: "Relier" }));
    await vi.waitFor(() => expect(api.relierAccueil).toHaveBeenCalledWith("c1", "PT", "pt", null, false));
    expect(within(bloc).getByText("Simulé (test)")).toBeTruthy();
    expect(within(bloc).getByText("Doublon")).toBeTruthy();
    expect(within(bloc).getByText("Hi Bruno, welcome to Vik Studios!", { exact: false })).toBeTruthy();
  });

  it("0470 : la carte montre l'équipe, où vit le freelance, la HM du contrat ; pays + HM → créer, l'erreur s'affiche", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    api.lireAccueils.mockResolvedValue([
      accueil({
        contrat_id: "44790806", prenom: "Gundika", nom: "Gundika", equipe: "Maximilien Kender", freelance_pays: "HR", freelance_ville: "Zagreb",
        hm_upwork_nom: "Lucia D.", raison: "HM du contrat (Lucia D.) pas dans l'OS : choisis la HM", pays: "HR",
      }),
    ]);
    api.creerAccueil.mockRejectedValueOnce(new Error("création du posteur : e-mail déjà pris"));
    rendu();
    const ligne = (await screen.findByText("Gundika Gundika")).closest("li") as HTMLElement;
    const infos = within(ligne).getByTestId("infos-contrat");
    expect(infos.textContent).toMatch(/Équipe : Maximilien Kender · hors VIk Studios/);
    expect(infos.textContent).toMatch(/Vit à Zagreb, Croatie/);
    expect(infos.textContent).toMatch(/HM du contrat : Lucia D\./);
    const carte = within(ligne).getByTestId("creer-pour-contrat");
    expect((within(carte).getByLabelText("Pays") as HTMLSelectElement).value).toBe("HR");
    const bouton = within(carte).getByRole("button", { name: "Créer le posteur et envoyer le welcome" }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    fireEvent.change(within(carte).getByLabelText("HM"), { target: { value: "hm1" } });
    fireEvent.click(bouton);
    await vi.waitFor(() => expect(api.creerAccueil).toHaveBeenCalledWith("44790806", "HR", "hm1"));
    expect((await within(carte).findByRole("alert")).textContent).toBe("création du posteur : e-mail déjà pris");
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
