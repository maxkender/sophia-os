import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lireMonOnboardingRuul: vi.fn(),
  jeSuisPretRuul: vi.fn(),
  enregistrerMonEmailRuul: vi.fn(),
}));
vi.mock("./api", () => api);
vi.mock("@/features/moteur/api", () => ({ enregistrerIdentiteRuul: vi.fn() }));
vi.mock("@/features/onboarding/cinqEtapesApi", () => ({ lireMesDeclarations: vi.fn().mockResolvedValue([]) }));
vi.mock("@/features/regles/api", () => ({ useRegles: () => ({ slack: "https://join.slack/x" }) }));
vi.mock("@/features/onboarding/BoutonDeclarer", () => ({ BoutonDeclarer: ({ libelle }: { libelle: string }) => <button type="button">{libelle}</button> }));

import i18n from "@/locales";
import { ChecklistRuul, etapesRuulFaites, etatRuul, onboardingRuulFini } from "./ChecklistRuul";
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
  it("13/11 : l'étape Ruul selon le statut ; jamais « ready » tant que le compte n'est pas Active", async () => {
    expect(etatRuul({ ...base })).toBe("attente");
    expect(etatRuul({ ...base, ruul_invite: true })).toBe("invite");
    expect(etatRuul({ ...base, ruul_invite: true, ruul_compte: "invited" })).toBe("invite");
    expect(etatRuul({ ...base, ruul_invite: true, ruul_compte: "active" })).toBe("pret");
    expect(etatRuul({ ...base, ruul_invite: true, ruul_pret: true })).toBe("pret");
    api.lireMonOnboardingRuul.mockResolvedValue({ ...base });
    const { unmount } = rendu();
    const attente = await screen.findByTestId("ruul-etape-ruul");
    expect(attente).toHaveTextContent("Ruul invitation on its way");
    expect(attente).toHaveTextContent("You can already set up your Ruul account now (5 minutes)");
    // 13/11 (Max) : le guide pas à pas, dépliable, avec l'email exact ; Open Ruul → app.ruul.io/register ; pas encore « It's done ».
    const guide = within(attente).getByTestId("guide-ruul");
    expect(guide).toHaveTextContent("How to set up Ruul");
    expect(guide).toHaveTextContent("Set up Ruul — required to get paid (5 minutes)");
    expect(guide).toHaveTextContent("Do it before your first post: before Sunday midnight (Paris time).");
    expect(guide).toHaveTextContent("Choose « Contractor » (not Business).");
    expect(guide).toHaveTextContent("Email: use exactly ana@test.zz (the one in your dashboard).");
    expect(guide).toHaveTextContent("Role: choose « Digital Creator ».");
    expect(guide).toHaveTextContent("go to « Payment accounts » → « Add my ID »");
    expect(guide).toHaveTextContent("Problem with Ruul? Click Help in your dashboard.");
    expect(within(attente).getByTestId("ouvrir-ruul")).toHaveAttribute("href", "https://app.ruul.io/register");
    expect(within(attente).queryByTestId("ruul-pret")).toBeNull();
    unmount();
    api.lireMonOnboardingRuul.mockResolvedValue({ ...base, ruul_invite: true, ruul_compte: "invited" });
    rendu();
    const invite = await screen.findByTestId("ruul-etape-ruul");
    expect(invite).toHaveTextContent("Finish your Ruul account");
    // 13/11 (règle Ruul) : il s'inscrit lui-même avec l'email exact, sans attendre d'email de Ruul.
    expect(invite).toHaveTextContent(
      "Go to app.ruul.io and sign up with this exact email: ana@test.zz. Then add your ID and bank details (5 minutes). You don't need to wait for an email from Ruul.",
    );
    expect(within(invite).getByTestId("ouvrir-ruul")).toHaveAttribute("href", "https://app.ruul.io/register");
    expect(within(invite).getByTestId("guide-ruul")).toBeInTheDocument();
    // Le warm-up : le compteur et « I've started the warm-up ».
    expect(screen.getByTestId("ruul-etape-warmup").textContent).toContain("I've started the warm-up");
  });

  it("6 étapes dans l'ordre, la date du lundi de cohorte, l'email de candidature pré-rempli, aucun texte Upwork", async () => {
    api.lireMonOnboardingRuul.mockResolvedValue(base);
    const { container } = rendu();
    expect(await screen.findByTestId("checklist-ruul")).toBeInTheDocument();
    const etapes = [...container.querySelectorAll("[data-testid^='ruul-etape-']")].map((e) => e.getAttribute("data-testid"));
    expect(etapes).toEqual(["identite", "email", "tiktok", "warmup", "slack", "ruul"].map((e) => `ruul-etape-${e}`));
    expect(screen.getByDisplayValue("ana@test.zz")).toBeInTheDocument();
    expect(container.textContent).toContain("Finish before Sunday 15 November, midnight (Paris time), to start on Monday 16 November.");
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
