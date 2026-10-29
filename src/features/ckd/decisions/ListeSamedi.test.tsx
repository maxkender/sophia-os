import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { CompteSemaine, RecrueSansReaction } from "./semaineComptes";
import { compte } from "./semaineComptes.test";

const api = vi.hoisted(() => ({
  lireSemaineComptes: vi.fn<(lundi: string, jusqu: string) => Promise<CompteSemaine[]>>(async () => []),
  lireRecruesSansReaction: vi.fn<(lundi: string) => Promise<RecrueSansReaction[]>>(async () => []),
  choisirSamedi: vi.fn<(compte: string, action: string) => Promise<string>>(async (c) => `manuel-${c}`),
}));
vi.mock("./semaineComptes", async (orig) => ({ ...(await orig<typeof import("./semaineComptes")>()), ...api }));
const ckd = vi.hoisted(() => ({ deciderCkd: vi.fn<(id: string, decision: string, note: string | null) => Promise<void>>(async () => undefined) }));
vi.mock("@/features/ckd/api", async (orig) => ({ ...(await orig<typeof import("@/features/ckd/api")>()), ...ckd }));
const cohortes = vi.hoisted(() => ({
  arreterRecrueSamedi: vi.fn<(poster: string) => Promise<void>>(async () => undefined),
  reporterRecrue: vi.fn<(poster: string) => Promise<string>>(async () => "2026-11-09"),
}));
vi.mock("@/features/cohortes/api", async (orig) => ({ ...(await orig<typeof import("@/features/cohortes/api")>()), ...cohortes }));
const moteur = vi.hoisted(() => ({ invoke: vi.fn<(fn: string, body: unknown) => Promise<unknown>>(async () => ({ ok: true })) }));
vi.mock("@/features/moteur/api", async (orig) => ({ ...(await orig<typeof import("@/features/moteur/api")>()), ...moteur }));
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));

import { ListeSamedi } from "./ListeSamedi";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ListeSamedi maintenant={new Date("2026-10-31T10:00:00Z")} />
    </QueryClientProvider>,
  );
}

const ligne = (handle: string) => document.querySelector<HTMLElement>(`[data-compte="${handle}"]`)!;
const presse = (handle: string, nom: string) => within(ligne(handle)).getByRole("button", { name: nom }).getAttribute("aria-pressed");
const recrue = (o: Partial<RecrueSansReaction>): RecrueSansReaction => ({
  poster_id: "r1", nom: "Mia Rossi", hm_nom: "Lucia", pays: "IT", compte_id: "rc1", handle: "mia.libri1", cohorte_lundi: "2026-11-02",
  connecte: true, tiktok_trouve: false, start_warmup: false, abonnements: null, relances: 2, derniere_relance: "2026-10-30T10:00:00Z",
  repondu_at: null, ...o,
});

describe("Weekly decisions → Saturday, la masterlist (prompt 25, partie 4)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("fr");
    api.lireSemaineComptes.mockResolvedValue([
      compte({ compte_id: "a", handle: "absent", ckd_samedi_id: "s1", ckd_samedi_action: "ne_pas_renouveler", ckd_samedi_regle: "absent",
        ckd_samedi_donnees: { periode: { attendus: 12, publies: 2 } }, nudge_envoye_at: "2026-10-29T15:00:00Z" }),
      compte({ compte_id: "b", handle: "bon", ckd_samedi_id: "s2", ckd_samedi_action: "doubler", ckd_samedi_regle: "doubler",
        ckd_samedi_donnees: { periode: { bons: 4 }, seuil_bon_post: { valeur: 8000 } } }),
      compte({ compte_id: "c", handle: "calme" }),
      compte({ compte_id: "d", handle: "fait", ckd_samedi_id: "s4", ckd_samedi_action: "ne_pas_renouveler", ckd_samedi_regle: "absent", ckd_samedi_decision: "garder" }),
    ]);
    api.lireRecruesSansReaction.mockResolvedValue([recrue({}), recrue({ poster_id: "r2", nom: "Ola N", compte_id: null })]);
  });

  it("tous les comptes, pré-remplis avec la proposition de l'OS et sa raison ; nudgé jeudi ; déjà décidé figé", async () => {
    rendu();
    await waitFor(() => expect(document.querySelectorAll("[data-compte]")).toHaveLength(4));
    expect(presse("absent", "Kill")).toBe("true");
    expect(presse("bon", "Double")).toBe("true");
    expect(presse("calme", "Keep")).toBe("true");
    expect(presse("fait", "Keep")).toBe("true");
    expect(within(ligne("fait")).getByRole("button", { name: "Kill" })).toBeDisabled();
    expect(within(ligne("absent")).getByText("10 posts manqués sur 12")).toBeInTheDocument();
    expect(within(ligne("absent")).getByText("Nudgé")).toBeInTheDocument();
    expect(within(ligne("calme")).getByText("Rien à signaler")).toBeInTheDocument();
    expect(await screen.findByText("Mia Rossi")).toBeInTheDocument();
    expect(screen.getAllByText("Compte TikTok introuvable")).toHaveLength(2);
  });

  it("Validate : rien avant le clic ; Kill et Double proposés décidés, Keep refuse, choix à la main créé ; recrues Kill ou reportées", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    rendu();
    await waitFor(() => expect(document.querySelectorAll("[data-compte]")).toHaveLength(4));
    expect(ckd.deciderCkd).not.toHaveBeenCalled();
    // « bon » passe en Keep, « calme » en Kill (à la main).
    fireEvent.click(within(ligne("bon")).getByRole("button", { name: "Keep" }));
    fireEvent.click(within(ligne("calme")).getByRole("button", { name: "Kill" }));
    const recrues = await screen.findByTestId("samedi-recrues");
    const mia = recrues.querySelector<HTMLElement>('[data-recrue="r1"]')!;
    const ola = recrues.querySelector<HTMLElement>('[data-recrue="r2"]')!;
    fireEvent.click(within(mia).getByRole("button", { name: "Kill" }));
    fireEvent.click(within(ola).getByRole("button", { name: "Reporter" }));
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() => expect(cohortes.reporterRecrue).toHaveBeenCalledWith("r2"));
    expect(ckd.deciderCkd).toHaveBeenCalledWith("s1", "ne_pas_renouveler", null);
    expect(ckd.deciderCkd).toHaveBeenCalledWith("s2", "pas_maintenant", null);
    expect(api.choisirSamedi).toHaveBeenCalledWith("c", "ne_pas_renouveler");
    expect(ckd.deciderCkd).toHaveBeenCalledWith("manuel-c", "ne_pas_renouveler", null);
    expect(api.choisirSamedi).toHaveBeenCalledWith("rc1", "ne_pas_renouveler");
    expect(ckd.deciderCkd).not.toHaveBeenCalledWith("s4", expect.anything(), null);
    expect(cohortes.arreterRecrueSamedi).not.toHaveBeenCalled();
    // Prompt 25 v4 : les arrêts partent tout de suite (sans message), pas dimanche.
    await waitFor(() => expect(moteur.invoke).toHaveBeenCalledWith("upwork", { action: "arrets" }));
  });

  it("le Head of Ops lit la masterlist sans Validate", async () => {
    auth.role = "head_of_ops";
    rendu();
    await waitFor(() => expect(document.querySelectorAll("[data-compte]")).toHaveLength(4));
    expect(within(ligne("absent")).getByRole("button", { name: "Kill" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Validate" })).toBeNull();
  });
});
