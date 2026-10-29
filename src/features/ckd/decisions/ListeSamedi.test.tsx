import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { CompteSemaine, DemandeArret, RecrueSansReaction } from "./semaineComptes";
import { compte } from "./semaineComptes.test";
import type { ExtrasCompte } from "./statutCompte";

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
const ckd = vi.hoisted(() => ({
  deciderCkd: vi.fn<(id: string, decision: string, note: string | null) => Promise<void>>(async () => undefined),
  recreerShadowban: vi.fn<(compteId: string) => Promise<{ id: string }>>(async () => ({ id: "n" })),
}));
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

const statut = vi.hoisted(() => ({
  lireExtras: vi.fn<(lundi: string) => Promise<Map<string, ExtrasCompte>>>(async () => new Map()),
  lireSeuilsConfiance: vi.fn(async () => ({ semaines: 3, posts: 6 })),
  noterPause: vi.fn(async () => undefined),
}));
vi.mock("./statutCompte", async (orig) => ({ ...(await orig<typeof import("./statutCompte")>()), ...statut }));

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

// Prompt 12 : les données du statut (0454), un compte de confiance par défaut.
const extras = (compte_id: string, o: Partial<ExtrasCompte> = {}): ExtrasCompte => ({
  compte_id, poster_id: "p1", sans_contrat: false, contrat_id: "123", freelance_nom: "Ana S.", profil_nom: "Ana Silva",
  message_recu_at: null, message_apercu: null, reponse_apres_nudge: false, liens_a_verifier: 0, vues_baisse: false,
  actif_semaines: 6, fiable_semaines: 5, dernier_nudge_at: null, needs_you_n: 0, disputes_n: 0, to_read_n: 0,
  connecte: true, sur_slack: true, tiktok_trouve: true, start_warmup: true, abonnements: 10, relances: 0, derniere_reaction_at: null, ...o,
});
const complets = [{ jour: "2026-10-26", prevus: 2, lien: 2 }, { jour: "2026-10-27", prevus: 2, lien: 2 }, { jour: "2026-10-28", prevus: 2, lien: 2 }];
const vides = [{ jour: "2026-10-26", prevus: 2, lien: 0 }, { jour: "2026-10-27", prevus: 2, lien: 0 }, { jour: "2026-10-28", prevus: 2, lien: 0 }];

describe("Weekly decisions → Saturday, la masterlist v2 (prompts 12 et 14)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("fr");
    api.lireSemaineComptes.mockResolvedValue([
      compte({ compte_id: "a", handle: "absent", jours: vides, prevus_passes: 6, lien_passes: 0, lien_total: 0,
        ckd_samedi_id: "s1", ckd_samedi_action: "ne_pas_renouveler", ckd_samedi_regle: "absent", nudge_envoye_at: "2026-10-29T15:00:00Z" }),
      compte({ compte_id: "b", handle: "bon", ckd_samedi_id: "s2", ckd_samedi_action: "doubler", ckd_samedi_regle: "doubler" }),
      compte({ compte_id: "c", handle: "calme", jours: complets }),
      compte({ compte_id: "d", handle: "fait", ckd_samedi_id: "s4", ckd_samedi_action: "ne_pas_renouveler", ckd_samedi_regle: "absent", ckd_samedi_decision: "garder" }),
      compte({ compte_id: "h", handle: "hussein", jours: vides, prevus_passes: 6, lien_passes: 0, lien_total: 0 }),
      compte({ compte_id: "r", handle: "recrue1", cohorte_lundi: "2026-11-02", jours: [], prevus_passes: 0, lien_passes: 0, lien_total: 0 }),
    ]);
    statut.lireExtras.mockResolvedValue(new Map([
      ["a", extras("a")], ["b", extras("b")], ["c", extras("c")], ["d", extras("d")],
      ["h", extras("h", { sans_contrat: true, contrat_id: null })],
      ["r", extras("r", { connecte: false, sur_slack: false, tiktok_trouve: false, start_warmup: false, relances: 3 })],
    ]));
    api.lireRecruesSansReaction.mockResolvedValue([recrue({ poster_id: "r2", nom: "Ola N", compte_id: null })]);
  });

  it("le statut en direct : « À traiter » d'abord, la phrase et la proposition ; de confiance en bas ; plus jamais « Nothing to report » à 0 post", async () => {
    rendu();
    await waitFor(() => expect(document.querySelector('[data-compte="absent"]')).not.toBeNull());
    expect(presse("absent", "Kill & pay")).toBe("true");
    expect(within(ligne("absent")).getByText("0 post avec lien depuis lundi, nudgé jeudi, pas de réponse.")).toBeInTheDocument();
    expect(presse("bon", "Double")).toBe("true");
    // Pas de contrat : badge, Kill bloqué.
    expect(within(ligne("hussein")).getByText("Pas de contrat")).toBeInTheDocument();
    expect(within(ligne("hussein")).getByRole("button", { name: "Kill & pay" })).toBeDisabled();
    // La recrue : ses étapes à la place des jours, Kill proposé (aucune réaction).
    expect(within(ligne("recrue1")).getByTestId("etapes-recrue")).toHaveTextContent("3 relance(s) · aucune réaction");
    expect(presse("recrue1", "Kill & pay")).toBe("true");
    // De confiance : dans la section fermée, sur Keep.
    const section = screen.getByTestId("section-confiance");
    expect(section).toHaveTextContent("De confiance : rien à vérifier (1)");
    expect(within(section).getByRole("button", { name: "Keep" })).toBeInTheDocument();
    expect(screen.getByTestId("compteurs-statut")).toHaveTextContent("3 à traiter · 2 à surveiller · 1 de confiance");
    // Déjà décidé : figé.
    expect(within(ligne("fait")).getByRole("button", { name: "Kill & pay" })).toBeDisabled();
    // Les onglets et leur nombre à traiter.
    expect(screen.getByRole("tab", { name: "Recrues de la cohorte qui arrive (1)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Recrues de la cohorte qui arrive (1)" }));
    expect(document.querySelector('[data-compte="absent"]')).toBeNull();
    expect(document.querySelector('[data-compte="recrue1"]')).not.toBeNull();
  });

  it("Validate : le récap d'abord ; Kill et Double décidés, Keep refuse, Autre → Recreate ; recrue sans compte reportée", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    rendu();
    await waitFor(() => expect(document.querySelector('[data-compte="absent"]')).not.toBeNull());
    expect(ckd.deciderCkd).not.toHaveBeenCalled();
    fireEvent.click(within(ligne("bon")).getByRole("button", { name: "Keep" }));
    fireEvent.change(within(ligne("hussein")).getByRole("combobox", { name: "Autre…" }), { target: { value: "recreate" } });
    const ola = (await screen.findByTestId("samedi-recrues")).querySelector<HTMLElement>('[data-recrue="r2"]')!;
    fireEvent.click(within(ola).getByRole("button", { name: "Reporter" }));
    expect(screen.getByTestId("recap-samedi")).toHaveTextContent("Récap : 2 Kill & pay, 1 Recreate");
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(confirm.mock.calls[0]![0]).toContain("2 Kill & pay, 1 Recreate");
    await waitFor(() => expect(cohortes.reporterRecrue).toHaveBeenCalledWith("r2"));
    expect(ckd.deciderCkd).toHaveBeenCalledWith("s1", "ne_pas_renouveler", null);
    expect(ckd.deciderCkd).toHaveBeenCalledWith("s2", "pas_maintenant", null);
    expect(ckd.recreerShadowban).toHaveBeenCalledWith("h");
    expect(api.choisirSamedi).toHaveBeenCalledWith("r", "ne_pas_renouveler");
    expect(ckd.deciderCkd).not.toHaveBeenCalledWith("s4", expect.anything(), null);
    await waitFor(() => expect(moteur.invoke).toHaveBeenCalledWith("upwork", { action: "arrets" }));
  });

  it("décisions finales : une demande d'arrêt arrive Kill pré-coché avec sa raison ; Keep la classe « garder »", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    api.lireSemaineComptes.mockResolvedValue([
      compte({ compte_id: "c", handle: "calme", poster_id: "pc", cohorte_lundi: "2026-10-19", jours: complets }),
      compte({ compte_id: "e", handle: "envie", poster_id: "pe", cohorte_lundi: "2026-10-19", jours: complets }),
    ]);
    statut.lireExtras.mockResolvedValue(new Map([["c", extras("c", { poster_id: "pc" })], ["e", extras("e", { poster_id: "pe" })]]));
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
    const zoe = (await screen.findByTestId("samedi-recrues")).querySelector<HTMLElement>('[data-recrue="r3"]')!;
    expect(within(zoe).getByRole("button", { name: "Kill" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(zoe).getByText("Demande d'arrêt (message)")).toBeInTheDocument();
    fireEvent.click(within(ligne("envie")).getByRole("button", { name: "Keep" }));
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() => expect(api.garderMalgreDemande).toHaveBeenCalledWith("pe"));
    expect(api.garderMalgreDemande).toHaveBeenCalledTimes(1);
    expect(api.choisirSamedi).toHaveBeenCalledWith("c", "ne_pas_renouveler");
    expect(cohortes.arreterRecrueSamedi).toHaveBeenCalledWith("r3");
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
