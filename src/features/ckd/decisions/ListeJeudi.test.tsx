import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { CompteSemaine } from "./semaineComptes";
import { compte } from "./semaineComptes.test";

const api = vi.hoisted(() => ({
  lireSemaineComptes: vi.fn<(lundi: string, jusqu: string) => Promise<CompteSemaine[]>>(async () => []),
  validerNudgesJeudi: vi.fn<(lundi: string, comptes: string[]) => Promise<{ prepares: number; deja: number; sans_canal: number }>>(
    async () => ({ prepares: 1, deja: 0, sans_canal: 0 }),
  ),
  lireBrouillonsJeudi: vi.fn(async () => new Map<string, unknown>()),
}));
const pb = vi.hoisted(() => ({ lireResumeProblemes: vi.fn(async () => new Map<string, unknown>()) }));
vi.mock("@/features/problemes/api", async (orig) => ({ ...(await orig<typeof import("@/features/problemes/api")>()), ...pb }));
vi.mock("./semaineComptes", async (orig) => ({ ...(await orig<typeof import("./semaineComptes")>()), ...api }));
const file = vi.hoisted(() => ({ envoyerFile: vi.fn(async () => ({ ok: true, envoyes: 1, perimes: 0, doublons: 0, upwork_bloque: 0 })) }));
vi.mock("@/features/auto/sent/attenteApi", async (orig) => ({ ...(await orig<typeof import("@/features/auto/sent/attenteApi")>()), ...file }));
const ckd = vi.hoisted(() => ({
  deciderCkd: vi.fn<(id: string, decision: string, note: string | null) => Promise<void>>(async () => undefined),
  recreerShadowban: vi.fn<(compteId: string) => Promise<{ id: string }>>(async () => ({ id: "n" })),
}));
vi.mock("@/features/ckd/api", async (orig) => ({ ...(await orig<typeof import("@/features/ckd/api")>()), ...ckd }));
const statut = vi.hoisted(() => ({ lireExtras: vi.fn(async () => new Map()) }));
vi.mock("./statutCompte", async (orig) => ({ ...(await orig<typeof import("./statutCompte")>()), ...statut }));
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));

import { ListeJeudi } from "./ListeJeudi";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ListeJeudi maintenant={new Date("2026-10-29T12:00:00Z")} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ligne = (handle: string) => document.querySelector<HTMLElement>(`[data-compte="${handle}"]`)!;
const presse = (handle: string, nom: string) => within(ligne(handle)).getByRole("button", { name: nom }).getAttribute("aria-pressed");

describe("Weekly decisions → Thursday (prompt 25, partie 3 ; prompt 12 : la nouvelle cohorte seulement)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("fr");
    api.lireSemaineComptes.mockResolvedValue([
      compte({ compte_id: "a", handle: "manque", cohorte_lundi: "2026-10-26", lien_passes: 4, lien_total: 4 }),
      compte({ compte_id: "b", handle: "complet", cohorte_lundi: "2026-10-26" }),
      compte({ compte_id: "c", handle: "mort", cohorte_lundi: "2026-10-26", shadowban: "vues_basses", recreer: "shadowban" }),
      compte({ compte_id: "d", handle: "deja", cohorte_lundi: "2026-10-26", lien_passes: 2, lien_total: 2, nudge_envoye_at: "2026-10-29T15:00:00Z" }),
      compte({ compte_id: "e", handle: "proposeckd", cohorte_lundi: "2026-10-26", ckd_jeudi_id: "prop-1", ckd_jeudi_action: "recreer", recreer: "ckd" }),
    ]);
  });

  it("tous les comptes ; pré-cochés : Nudge si un post manque, Recreate pour un compte mort ; déjà nudgé : rien", async () => {
    rendu();
    await waitFor(() => expect(document.querySelectorAll("[data-compte]")).toHaveLength(5));
    expect(presse("manque", "Nudge")).toBe("true");
    expect(presse("complet", "Rien")).toBe("true");
    expect(presse("mort", "Recreate")).toBe("true");
    expect(presse("deja", "Rien")).toBe("true");
    expect(within(ligne("deja")).getByRole("button", { name: "Nudge" })).toBeDisabled();
    expect(within(ligne("complet")).getByRole("button", { name: "Recreate" })).toBeDisabled();
    expect(within(ligne("manque")).getByText("4/6")).toBeInTheDocument();
    expect(screen.getByText("1 nudges · 2 recreates")).toBeInTheDocument();
  });

  it("Send : rien avant le clic ; les Nudge dans la file, puis l'envoi ; les Recreate par leur chemin", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    rendu();
    await waitFor(() => expect(document.querySelectorAll("[data-compte]")).toHaveLength(5));
    expect(api.validerNudgesJeudi).not.toHaveBeenCalled();
    // Je change : « complet » en Nudge, « mort » en rien.
    fireEvent.click(within(ligne("complet")).getByRole("button", { name: "Nudge" }));
    fireEvent.click(within(ligne("mort")).getByRole("button", { name: "Rien" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(ckd.deciderCkd).toHaveBeenCalledWith("prop-1", "recreer", null));
    expect(api.validerNudgesJeudi).toHaveBeenCalledWith("2026-10-26", ["a", "b"]);
    expect(file.envoyerFile).toHaveBeenCalled();
    expect(ckd.recreerShadowban).not.toHaveBeenCalled();
  });

  it("0531 : Recréer décidé dans Problèmes pré-coché ; Kill samedi prévu : ligne grisée, badge ⚠ problèmes", async () => {
    api.lireSemaineComptes.mockResolvedValue([
      compte({ compte_id: "x", poster_id: "px", handle: "arecreer", cohorte_lundi: "2026-10-26", lien_passes: 4, lien_total: 4, recreer: "shadowban" }),
      compte({ compte_id: "y", poster_id: "py", handle: "stoppe", cohorte_lundi: "2026-10-26", lien_passes: 2, lien_total: 2 }),
    ]);
    api.lireBrouillonsJeudi.mockResolvedValue(new Map([["x", { choix: "recreate", raison: { source: "problemes", decide_le: "2026-10-27" } }]]));
    pb.lireResumeProblemes.mockResolvedValue(new Map([
      ["py", { poster_id: "py", n: 2, probleme_id: "pb9", diagnostic: "STOP le 27/10", kill_samedi_lundi: "2026-10-26", rituel_choix: null, rituel_lundi: null }],
    ]));
    rendu();
    await waitFor(() => expect(within(ligne("arecreer")).getByTestId("recreer-problemes")).toBeInTheDocument());
    expect(presse("arecreer", "Recreate")).toBe("true");
    expect(within(ligne("arecreer")).getByTestId("recreer-problemes").textContent).toBe("Recreate · décidé le 27/10 dans Problèmes");
    await waitFor(() => expect(within(ligne("stoppe")).getByTestId("badge-problemes")).toBeInTheDocument());
    // 0538 : la décision se prend ici (Weekly decisions) ; le lien vers Problèmes n'apparaît que pour un message en attente.
    expect(within(ligne("stoppe")).getByText("⚠ 2 problèmes ouverts")).toBeTruthy();
    expect(within(ligne("stoppe")).getByTestId("kill-samedi-prevu").textContent).toBe("Kill prévu samedi 31/10");
    expect(presse("stoppe", "Kill Saturday")).toBe("true");
    expect(within(ligne("stoppe")).getByRole("button", { name: "Nudge" })).toBeDisabled();
  });

  it("filtre par nombre de posts", async () => {
    rendu();
    await waitFor(() => expect(document.querySelectorAll("[data-compte]")).toHaveLength(5));
    fireEvent.change(screen.getByRole("combobox", { name: "Posts" }), { target: { value: "manque" } });
    expect([...document.querySelectorAll("[data-compte]")].map((e) => e.getAttribute("data-compte")).sort()).toEqual(["deja", "manque"]);
  });

  it("prompt 25 MAJ : Lucia (Head of Ops) choisit compte par compte et envoie, comme Max", async () => {
    auth.role = "head_of_ops";
    rendu();
    await waitFor(() => expect(document.querySelectorAll("[data-compte]")).toHaveLength(5));
    expect(within(ligne("manque")).getByRole("button", { name: "Nudge" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("prompt 12 : seulement la nouvelle cohorte ; les anciens n'apparaissent pas ; rien à signaler en bas", async () => {
    api.lireSemaineComptes.mockResolvedValue([
      compte({ compte_id: "a", handle: "manque", cohorte_lundi: "2026-10-26", lien_passes: 4, lien_total: 4 }),
      compte({ compte_id: "v", handle: "ancien", cohorte_lundi: "2026-10-12", lien_passes: 0, lien_total: 0 }),
      compte({ compte_id: "c", handle: "complet", cohorte_lundi: "2026-10-26", jours: [{ jour: "2026-10-26", prevus: 2, lien: 2 }] }),
    ]);
    rendu();
    await waitFor(() => expect(document.querySelector('[data-compte="manque"]')).not.toBeNull());
    expect(document.querySelector('[data-compte="ancien"]')).toBeNull();
    expect(screen.getByTestId("section-rien")).toHaveTextContent("Rien à signaler (1)");
  });
});
