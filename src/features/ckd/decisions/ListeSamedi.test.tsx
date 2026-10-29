import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { CompteSemaine, DemandeArret, RecrueSansReaction } from "./semaineComptes";
import { compte } from "./semaineComptes.test";

const api = vi.hoisted(() => ({
  lireSemaineComptes: vi.fn<(lundi: string, jusqu: string) => Promise<CompteSemaine[]>>(async () => []),
  lireRecruesSansReaction: vi.fn<(lundi: string) => Promise<RecrueSansReaction[]>>(async () => []),
  choisirSamedi: vi.fn<(compte: string, action: string) => Promise<string>>(async (c) => `manuel-${c}`),
  lireDemandesArret: vi.fn<() => Promise<DemandeArret[]>>(async () => []),
  garderMalgreDemande: vi.fn<(poster: string) => Promise<void>>(async () => undefined),
  lireFicheSamedi: vi.fn(async () => ({
    posts: [{ jour: "2026-10-26", handle: "calme", url: "https://www.tiktok.com/@calme/photo/1", vues: 120, statut: "resolu" }],
    nudges: [], messages: [], historique: { cohorte: "2026-10-19", comptes: [], pauses: [], kills_annules: 0 },
    contrat: { id: "123", url: "https://www.upwork.com/nx/wm/workroom/123/overview", freelance: "Ana P.", tarif: 14 },
    semaine: { faits: 3, prevus: 6, montant: 14, action: "payer", raison: null },
  })),
  noterKillSansPaie: vi.fn<(p: string, l: string, r: string, m: number | null) => Promise<void>>(async () => undefined),
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
    expect(presse("absent", "Kill & pay")).toBe("true");
    expect(presse("bon", "Double")).toBe("true");
    expect(presse("calme", "Keep")).toBe("true");
    expect(presse("fait", "Keep")).toBe("true");
    expect(within(ligne("fait")).getByRole("button", { name: "Kill & pay" })).toBeDisabled();
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
    fireEvent.click(within(ligne("calme")).getByRole("button", { name: "Kill & pay" }));
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

  it("décisions finales : une demande d'arrêt arrive Kill pré-coché avec sa raison ; Keep la classe « garder »", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    api.lireSemaineComptes.mockResolvedValue([
      compte({ compte_id: "c", handle: "calme", poster_id: "pc", cohorte_lundi: "2026-10-19" }),
      compte({ compte_id: "e", handle: "envie", poster_id: "pe", cohorte_lundi: "2026-10-19" }),
    ]);
    api.lireRecruesSansReaction.mockResolvedValue([recrue({ poster_id: "r3", nom: "Zoe K", compte_id: null, relances: 0 })]);
    api.lireDemandesArret.mockResolvedValue([
      { poster_id: "pc", source: "bouton", raison: "I want to stop (button)", demande_at: "2026-10-30T10:00:00Z" },
      { poster_id: "pe", source: "persona", raison: "I won't post this", demande_at: "2026-10-30T11:00:00Z" },
      { poster_id: "r3", source: "message", raison: "STOP", demande_at: "2026-10-30T12:00:00Z" },
    ]);
    rendu();
    await waitFor(() => expect(presse("calme", "Kill & pay")).toBe("true"));
    expect(presse("envie", "Kill & pay")).toBe("true");
    expect(within(ligne("envie")).getByText("Persona refusé")).toBeInTheDocument();
    expect(within(ligne("envie")).getByText("« I won't post this »")).toBeInTheDocument();
    const zoe = (await screen.findByTestId("samedi-recrues")).querySelector<HTMLElement>('[data-recrue="r3"]')!;
    expect(within(zoe).getByRole("button", { name: "Kill" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(zoe).getByText("Demande d'arrêt (message)")).toBeInTheDocument();
    // Max garde « envie » : la demande est classée, les relances reprennent ; les deux autres partent en Kill.
    fireEvent.click(within(ligne("envie")).getByRole("button", { name: "Keep" }));
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() => expect(api.garderMalgreDemande).toHaveBeenCalledWith("pe"));
    expect(api.garderMalgreDemande).toHaveBeenCalledTimes(1);
    expect(api.choisirSamedi).toHaveBeenCalledWith("c", "ne_pas_renouveler");
    expect(cohortes.arreterRecrueSamedi).toHaveBeenCalledWith("r3");
  });

  it("le Head of Ops lit la masterlist sans Validate", async () => {
    auth.role = "head_of_ops";
    rendu();
    await waitFor(() => expect(document.querySelectorAll("[data-compte]")).toHaveLength(4));
    expect(within(ligne("absent")).getByRole("button", { name: "Kill & pay" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Validate" })).toBeNull();
  });

  it("prompt 26 : Kill & don't pay demande une raison, montre le montant en jeu, puis la note pour lundi", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    rendu();
    await waitFor(() => expect(document.querySelectorAll("[data-compte]").length).toBeGreaterThan(0));
    fireEvent.click(within(ligne("calme")).getByRole("button", { name: "Kill & don't pay" }));
    expect(await screen.findByText("Montant en jeu : 14 $")).toBeInTheDocument();
    expect(screen.getByText("Si le freelance refuse le remboursement, Upwork ouvre un litige.")).toBeInTheDocument();
    const valider = document.querySelector<HTMLButtonElement>('[data-action="valider-samedi"]')!;
    expect(valider).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Raison (obligatoire)" }), { target: { value: "faux_liens" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Détail (obligatoire pour « Autre »)" }), { target: { value: "3 liens d'un autre compte" } });
    expect(valider).not.toBeDisabled();
    fireEvent.click(valider);
    await waitFor(() => expect(api.noterKillSansPaie).toHaveBeenCalledWith(expect.any(String), "2026-10-26", "Faux liens : 3 liens d'un autre compte", 14));
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("prompt 26 : la fiche du compte (contrat, montant, posts avec liens et vues, ce que fait chaque bouton)", async () => {
    rendu();
    await waitFor(() => expect(document.querySelectorAll("[data-compte]").length).toBeGreaterThan(0));
    fireEvent.click(within(ligne("calme")).getByRole("button", { name: "Détails" }));
    const fiche = await screen.findByTestId("fiche-samedi");
    expect(within(fiche).getByText("Cette semaine : 14 $ en jeu (3/6 posts avec lien)")).toBeInTheDocument();
    expect(within(fiche).getByRole("link", { name: "123" })).toHaveAttribute("href", "https://www.upwork.com/nx/wm/workroom/123/overview");
    expect(within(fiche).getByText("120 vues")).toBeInTheDocument();
    expect(within(fiche).getByText(/Kill & don't pay : rien n'est approuvé/)).toBeInTheDocument();
  });
});
