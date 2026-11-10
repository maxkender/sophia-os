import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lireMonOnboardingRuul: vi.fn(),
  jeSuisPretRuul: vi.fn(),
  enregistrerMonEmailRuul: vi.fn(),
}));
vi.mock("./api", () => api);
vi.mock("@/features/moteur/api", () => ({ enregistrerIdentiteRuul: vi.fn() }));
vi.mock("@/features/regles/api", () => ({ useRegles: () => ({ slack: "https://join.slack/x" }) }));
vi.mock("@/features/onboarding/BoutonDeclarer", () => ({ BoutonDeclarer: ({ libelle }: { libelle: string }) => <button type="button">{libelle}</button> }));

import i18n from "@/locales";
import { ChecklistRuul, etapesRuulFaites, onboardingRuulFini } from "./ChecklistRuul";
import { commentCaMarche } from "@/features/parrainageEmail/BlocParrainer";

const base = {
  ruul: true, cohorte_lundi: "2026-11-16", prenom_legal: null, nom_legal: null, ruul_email: null,
  email_candidature: "ana@test.zz", handle: "ana.x1", tiktok: false, warmup_lance: false, abonnements: 0,
  pret_warmup: false, slack: false, ruul_statut: "a_ajouter", ruul_invite: false, ruul_pret: false,
};

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ChecklistRuul /></QueryClientProvider>);
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
});

describe("ChecklistRuul (0592)", () => {
  it("6 étapes dans l'ordre, la date du lundi de cohorte, l'email de candidature pré-rempli, aucun texte Upwork", async () => {
    api.lireMonOnboardingRuul.mockResolvedValue(base);
    const { container } = rendu();
    expect(await screen.findByTestId("checklist-ruul")).toBeInTheDocument();
    const etapes = [...container.querySelectorAll("[data-testid^='ruul-etape-']")].map((e) => e.getAttribute("data-testid"));
    expect(etapes).toEqual(["identite", "email", "tiktok", "warmup", "slack", "ruul"].map((e) => `ruul-etape-${e}`));
    expect(screen.getByDisplayValue("ana@test.zz")).toBeInTheDocument();
    expect(container.textContent).toContain("Finish before Saturday 8 pm (Paris time) to start on Monday 16 November.");
    expect(container.textContent?.toLowerCase()).not.toMatch(/upwork|milestone/);
  });

  it("invité sur Ruul : « It's done » marque le compte prêt", async () => {
    api.lireMonOnboardingRuul.mockResolvedValue({ ...base, ruul_invite: true, ruul_statut: "invite" });
    api.jeSuisPretRuul.mockResolvedValue({ ok: true });
    rendu();
    fireEvent.click(await screen.findByTestId("ruul-pret"));
    await waitFor(() => expect(api.jeSuisPretRuul).toHaveBeenCalled());
  });

  it("pas Ruul, ou tout fait (Slack recommandé seulement) : rien", async () => {
    api.lireMonOnboardingRuul.mockResolvedValue({ ...base, ruul: false });
    const { container } = rendu();
    await waitFor(() => expect(api.lireMonOnboardingRuul).toHaveBeenCalled());
    expect(container.textContent).toBe("");
    const fini = { ...base, prenom_legal: "A", nom_legal: "B", ruul_email: "a@b.cc", tiktok: true, pret_warmup: true, ruul_pret: true };
    expect(onboardingRuulFini(fini)).toBe(true);
    expect(etapesRuulFaites(fini).slack).toBe(false);
  });

  it("parrainage d'un posteur Ruul : aucun texte Upwork", () => {
    expect(commentCaMarche(true).join(" ")).not.toMatch(/Upwork/);
    expect(commentCaMarche(false).join(" ")).toMatch(/Upwork/);
  });
});
