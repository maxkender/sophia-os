import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  slackLie: false,
  warmup: null as null | Record<string, unknown>,
  declarations: [] as { etape: string; statut: string; declare_at: string }[],
  declarer: vi.fn(async () => "en_attente" as const),
  // La niche du label du compte (19/11) : null = inconnue.
  niche: null as string | null,
  nicheDemandeePour: [] as (string | null | undefined)[],
}));

vi.mock("./cinqEtapesApi", () => ({
  lireMaPremiereSemaine: async () => ({ cohorteLundi: "2026-11-02", slackLie: api.slackLie }),
  lireMonWarmup: async () => api.warmup,
  lireMesDeclarations: async () => api.declarations,
  lireMesTextesDebut: async () => ({}),
  declarerEtape: (...a: unknown[]) => api.declarer(...(a as [])),
}));
vi.mock("@/features/regles/api", () => ({
  useRegles: () => ({ textes: { lien: "Link rule", warmup: "Warmup rule", bienvenue: "" }, paie: {}, slack: "https://join.slack.com/t/x" }),
}));
vi.mock("./ChangerHandle", () => ({ ChangerHandle: () => null }));
vi.mock("./maNiche", () => ({
  useMaNiche: (compteId: string | null | undefined) => {
    api.nicheDemandeePour.push(compteId);
    return api.niche;
  },
}));

import { CinqEtapes } from "./CinqEtapes";

// Samedi 1er nov., 19:00 Paris : le warm-up finit ce soir, 1er post lundi 2.
const maintenant = new Date("2026-11-01T18:00:00Z");

function afficher() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CinqEtapes
        handle="example.account"
        compteId="c1"
        warmupStartedAt="2026-10-30T09:00:00Z"
        warmupEndsAt="2026-11-01T23:00:00Z"
        maintenant={maintenant}
      />
    </QueryClientProvider>,
  );
}

const etape = (cle: string) => document.querySelector(`[data-etape="${cle}"]`);

describe("0497 : le dashboard des 5 étapes", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    api.slackLie = false;
    api.warmup = null;
    api.declarations = [];
    api.declarer.mockClear();
    api.niche = null;
    api.nicheDemandeePour = [];
  });

  it("étape 4 faite dès que le dernier relevé valide voit le compte prêt ; 1er post à 08:00 JST au Japon", async () => {
    api.slackLie = true;
    api.warmup = { compte_id: "c1", pret: true, abonnements: 7, existe: true, releve_at: "2026-11-01T17:01:00Z", warmup_started_at: "2026-10-30T09:00:00Z", pays: "JP" };
    afficher();
    await waitFor(() => expect(etape("warmup")?.getAttribute("data-etat")).toBe("fait"));
    expect(etape("slack")?.getAttribute("data-etat")).toBe("fait");
    expect(screen.getByTestId("slack-relie").textContent).toBe("Slack linked");
    expect(screen.getByTestId("heure-premier-post").textContent).toBe(
      "Your first post will be available on Monday 2 November at 08:00 (JST).",
    );
  });

  it("Slack pas vu : le message, Join Slack et « I've joined » qui relance la vérification", async () => {
    afficher();
    await screen.findByText("Join our Slack with your FULL NAME and your personal email. We link your account automatically within the hour.");
    expect(etape("slack")?.textContent).not.toMatch(/bot/i);
    fireEvent.click(screen.getByTestId("declarer-slack"));
    await waitFor(() => expect(api.declarer).toHaveBeenCalledWith("slack"));
  });

  it("19/11 : l'étape 4 nomme la niche du label de CE compte ; inconnue : rien de plus", async () => {
    api.warmup = { compte_id: "c1", pret: false, abonnements: 2, existe: true, releve_at: "2026-11-01T17:01:00Z", warmup_started_at: "2026-10-30T09:00:00Z", pays: "DE" };
    api.niche = "running";
    const a = afficher();
    const ligne = await screen.findByTestId("niche-warmup");
    expect(ligne.textContent).toBe("Scroll and follow accounts in your niche: running.");
    expect(etape("warmup")?.contains(ligne)).toBe(true);
    // La niche du compte affiché, pas celle d'un autre compte du posteur.
    expect(new Set(api.nicheDemandeePour)).toEqual(new Set(["c1"]));
    a.unmount();

    api.niche = null;
    afficher();
    await waitFor(() => expect(etape("warmup")?.getAttribute("data-etat")).toBe("en_cours"));
    expect(screen.queryByTestId("niche-warmup")).toBeNull();
  });

  it("19/11 : étape 4 faite : la niche ne s'affiche plus (le détail est replié)", async () => {
    api.warmup = { compte_id: "c1", pret: true, abonnements: 7, existe: true, releve_at: "2026-11-01T17:01:00Z", warmup_started_at: "2026-10-30T09:00:00Z", pays: "DE" };
    api.niche = "running";
    afficher();
    await waitFor(() => expect(etape("warmup")?.getAttribute("data-etat")).toBe("fait"));
    expect(screen.queryByTestId("niche-warmup")).toBeNull();
  });

  it("0 follow plus de 24 h après Start warmup : le conseil TikTok à l'étape 4", async () => {
    api.warmup = { compte_id: "c1", pret: false, abonnements: 0, existe: true, releve_at: "2026-11-01T17:01:00Z", warmup_started_at: "2026-10-30T09:00:00Z", pays: "DE" };
    afficher();
    expect((await screen.findByTestId("follows-bloques")).textContent).toMatch(/^TikTok sometimes limits new accounts\./);
    expect(etape("warmup")?.getAttribute("data-etat")).toBe("en_cours");
    expect(screen.getByTestId("heure-premier-post").textContent).toContain("at 00:00 (CET)");
  });

  it("« I did this step » déjà envoyé : étape faite, « we'll check »", async () => {
    api.declarations = [{ etape: "warmup", statut: "en_attente", declare_at: "2026-11-01T17:00:00Z" }];
    afficher();
    await waitFor(() => expect(etape("warmup")?.getAttribute("data-etat")).toBe("fait"));
    expect(screen.getByTestId("verification-warmup").textContent).toBe("(thanks! we're checking it)");
  });
});
