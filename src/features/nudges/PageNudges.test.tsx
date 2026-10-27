import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import { etatNudge } from "./logique";

const api = vi.hoisted(() => ({
  apercuNudges: vi.fn(),
  envoyerNudges: vi.fn(),
  lireNudges: vi.fn(),
  lireARelancerUpwork: vi.fn(),
  marquerNudge: vi.fn(),
  lireMessagesNudge: vi.fn(),
  enregistrerMessagesNudge: vi.fn(),
  TYPES_BLOCAGE: ["warmup_pas_lance", "compte_introuvable", "reposts", "abonnements", "posts_manques"],
}));
vi.mock("./api", () => api);
vi.mock("@/features/ckd/vueHm/ChoixHm", () => ({
  ChoixHm: ({ onChange }: { onChange: (v: string) => void }) => (
    <button type="button" onClick={() => onChange("hm-kris")}>
      choisir-kris
    </button>
  ),
}));

import { PageNudges } from "./PageNudges";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PageNudges />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ligne = (o: Record<string, unknown>) => ({
  poster_id: "p1", poster_nom: "Ana Silva", hm_id: "h", hm_prenom: "Kris", compte_id: "c1", handle: "ana.tt",
  type: "warmup_pas_lance", n: 0, texte: "Hi Ana, your account @ana.tt is ready", slack: true, nudges_sans_reponse: 0, ...o,
});

describe("etatNudge", () => {
  it("résolu > répondu > Upwork > sans réponse", () => {
    expect(etatNudge({ reponse_at: "x", resolu_at: "y", upwork_relance_at: null })).toBe("resolu");
    expect(etatNudge({ reponse_at: "x", resolu_at: null, upwork_relance_at: "z" })).toBe("repondu");
    expect(etatNudge({ reponse_at: null, resolu_at: null, upwork_relance_at: "z" })).toBe("upwork");
    expect(etatNudge({ reponse_at: null, resolu_at: null, upwork_relance_at: null })).toBe("sans_reponse");
  });
});

describe("PageNudges", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
    api.lireNudges.mockResolvedValue([]);
    api.lireARelancerUpwork.mockResolvedValue([]);
    api.lireMessagesNudge.mockResolvedValue({
      warmup_pas_lance: "a", compte_introuvable: "b", reposts: "c", abonnements: "d", posts_manques: "e",
    });
  });

  it("aperçu avant envoi, on décoche, seuls les cochés partent", async () => {
    api.apercuNudges.mockResolvedValue([
      ligne({}),
      ligne({ poster_id: "p2", poster_nom: "Bo Lee", compte_id: "c2", handle: "bo.tt", slack: false, nudges_sans_reponse: 1 }),
    ]);
    api.envoyerNudges.mockResolvedValue({ envoyes: 1, slack: 1, os: 0, erreurs: [] });
    rendu();
    expect(api.apercuNudges).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu" }));
    const apercu = await screen.findByTestId("apercu-nudges");
    expect(api.apercuNudges).toHaveBeenCalledWith("warmup", null);
    expect(within(apercu).getByText("Pop-up OS")).toBeInTheDocument();
    expect(within(apercu).getByText("1 nudge(s) sans réponse")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Relancer Bo Lee"));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer 1 nudge" }));
    await waitFor(() => expect(api.envoyerNudges).toHaveBeenCalledWith("warmup", null, ["c1"]));
    expect(await screen.findByTestId("bilan-nudges")).toHaveTextContent("1 nudge(s) envoyé(s) : 1 sur Slack");
  });

  it("une HM : les actifs de cette HM", async () => {
    api.apercuNudges.mockResolvedValue([]);
    rendu();
    fireEvent.change(screen.getByLabelText("Qui relancer"), { target: { value: "hm" } });
    expect(screen.getByRole("button", { name: "Voir l'aperçu" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "choisir-kris" }));
    fireEvent.click(screen.getByRole("button", { name: "Voir l'aperçu" }));
    await waitFor(() => expect(api.apercuNudges).toHaveBeenCalledWith("actifs", "hm-kris"));
    expect(await screen.findByText("Personne n'est bloqué dans cette cible.")).toBeInTheDocument();
  });

  it("à relancer sur Upwork : lien du contrat et « Relancé »", async () => {
    api.lireARelancerUpwork.mockResolvedValue([
      { poster_id: "p1", poster_nom: "Ana Silva", hm_prenom: "Kris", upwork_contrat_url: "https://upwork/c/1", upwork_url: null, nudges: 2, dernier_at: "2026-10-27T10:00:00Z", types: ["posts_manques"] },
    ]);
    api.marquerNudge.mockResolvedValue(undefined);
    rendu();
    const bloc = await screen.findByTestId("relancer-upwork");
    expect(await within(bloc).findByRole("link", { name: /Ouvrir le contrat/ })).toHaveAttribute("href", "https://upwork/c/1");
    fireEvent.click(within(bloc).getByRole("button", { name: "Relancé" }));
    await waitFor(() => expect(api.marquerNudge).toHaveBeenCalledWith("p1", "upwork"));
  });

  it("historique : « A répondu » sur un nudge sans réponse", async () => {
    api.lireNudges.mockResolvedValue([
      { id: "n1", poster_id: "p1", poster_nom: "Ana Silva", hm_prenom: null, compte_id: "c1", handle: "ana.tt", type: "reposts", canal: "slack", texte: "x", envoye_at: "2026-10-27T10:00:00Z", reponse_at: null, resolu_at: null, upwork_relance_at: null, slack_erreur: null },
    ]);
    api.marquerNudge.mockResolvedValue(undefined);
    rendu();
    const bloc = await screen.findByTestId("historique-nudges");
    expect(await within(bloc).findByText("Sans réponse")).toBeInTheDocument();
    fireEvent.click(within(bloc).getByRole("button", { name: "A répondu" }));
    await waitFor(() => expect(api.marquerNudge).toHaveBeenCalledWith("n1", "repondu"));
  });
});
