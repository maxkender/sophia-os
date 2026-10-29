import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { CompteSemaine } from "./semaineComptes";
import { compte } from "./semaineComptes.test";

const api = vi.hoisted(() => ({
  lireSemaineComptes: vi.fn<(lundi: string, jusqu: string) => Promise<CompteSemaine[]>>(async () => []),
  validerNudgesJeudi: vi.fn<(lundi: string, comptes: string[]) => Promise<{ prepares: number; deja: number; sans_canal: number }>>(
    async () => ({ prepares: 1, deja: 0, sans_canal: 0 }),
  ),
}));
vi.mock("./semaineComptes", async (orig) => ({ ...(await orig<typeof import("./semaineComptes")>()), ...api }));
const file = vi.hoisted(() => ({ envoyerFile: vi.fn(async () => ({ ok: true, envoyes: 1, perimes: 0, doublons: 0, upwork_bloque: 0 })) }));
vi.mock("@/features/auto/sent/attenteApi", async (orig) => ({ ...(await orig<typeof import("@/features/auto/sent/attenteApi")>()), ...file }));
const ckd = vi.hoisted(() => ({
  deciderCkd: vi.fn<(id: string, decision: string, note: string | null) => Promise<void>>(async () => undefined),
  recreerShadowban: vi.fn<(compteId: string) => Promise<{ id: string }>>(async () => ({ id: "n" })),
}));
vi.mock("@/features/ckd/api", async (orig) => ({ ...(await orig<typeof import("@/features/ckd/api")>()), ...ckd }));
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));

import { ListeJeudi } from "./ListeJeudi";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ListeJeudi maintenant={new Date("2026-10-29T12:00:00Z")} />
    </QueryClientProvider>,
  );
}

const ligne = (handle: string) => document.querySelector<HTMLElement>(`[data-compte="${handle}"]`)!;
const presse = (handle: string, nom: string) => within(ligne(handle)).getByRole("button", { name: nom }).getAttribute("aria-pressed");

describe("Weekly decisions → Thursday (prompt 25, partie 3)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("fr");
    api.lireSemaineComptes.mockResolvedValue([
      compte({ compte_id: "a", handle: "manque", lien_passes: 4, lien_total: 4 }),
      compte({ compte_id: "b", handle: "complet" }),
      compte({ compte_id: "c", handle: "mort", shadowban: "vues_basses", recreer: "shadowban" }),
      compte({ compte_id: "d", handle: "deja", lien_passes: 2, lien_total: 2, nudge_envoye_at: "2026-10-29T15:00:00Z" }),
      compte({ compte_id: "e", handle: "proposeckd", ckd_jeudi_id: "prop-1", ckd_jeudi_action: "recreer", recreer: "ckd" }),
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

  it("filtre par nombre de posts", async () => {
    rendu();
    await waitFor(() => expect(document.querySelectorAll("[data-compte]")).toHaveLength(5));
    fireEvent.change(screen.getByRole("combobox", { name: "Posts" }), { target: { value: "manque" } });
    expect([...document.querySelectorAll("[data-compte]")].map((e) => e.getAttribute("data-compte"))).toEqual(["deja", "manque"]);
  });

  it("le Head of Ops lit la liste sans rien pouvoir envoyer", async () => {
    auth.role = "head_of_ops";
    rendu();
    await waitFor(() => expect(document.querySelectorAll("[data-compte]")).toHaveLength(5));
    expect(within(ligne("manque")).getByRole("button", { name: "Nudge" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });
});
