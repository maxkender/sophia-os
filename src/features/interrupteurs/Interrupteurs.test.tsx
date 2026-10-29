import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  lireInterrupteurs: vi.fn(async () => ({ accueil_auto: "test", relances_auto: "test", kill_auto: "test", arret_auto: "test", lundi_message_auto: "test", lundi_soir_auto: "test", reponses_auto: "test", kill_message_auto: "on" })),
  enregistrerInterrupteur: vi.fn(async () => undefined),
  lireRepriseRappels: vi.fn(async () => "2026-11-02"),
  enregistrerRepriseRappels: vi.fn(async () => undefined),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));

import { Interrupteurs } from "./Interrupteurs";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Interrupteurs />
    </QueryClientProvider>,
  );
}

describe("lireMode", () => {
  it("l'ancien oui / non de kill_message_auto devient on / off ; « simulation » = test", async () => {
    const { lireMode } = await vi.importActual<typeof import("./api")>("./api");
    expect(lireMode(true)).toBe("on");
    expect(lireMode(false)).toBe("off");
    expect(lireMode("simulation")).toBe("test");
    expect(lireMode("on")).toBe("on");
  });
});

describe("Réglages → Interrupteurs", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("fr");
  });

  it("test par défaut ; on demande une confirmation ; le Head of Ops ne peut pas changer", async () => {
    rendu();
    await screen.findByText("Relances des recrues");
    // Décisions finales : plus d'interrupteur de Kill automatique.
    expect(screen.queryByText("Kill automatique")).toBeNull();
    const ligne = within(document.querySelector<HTMLElement>('[data-interrupteur="accueil_auto"]')!);
    const on = ligne.getByRole("button", { name: "On" });
    expect(ligne.getByRole("button", { name: "Test" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll("[data-interrupteur]")).toHaveLength(7);
    // Prompt 21, A6 : le message de Kill du dimanche est un interrupteur, « on » au départ.
    const kill = within(document.querySelector<HTMLElement>('[data-interrupteur="kill_message_auto"]')!);
    await vi.waitFor(() => expect(kill.getByRole("button", { name: "On" }).getAttribute("aria-pressed")).toBe("true"));
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(on);
    expect(api.enregistrerInterrupteur).not.toHaveBeenCalled();
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    fireEvent.click(on);
    await vi.waitFor(() => expect(api.enregistrerInterrupteur).toHaveBeenCalledWith("accueil_auto", "on"));
  });

  it("prompt 25 MAJ : plus de position Approve, Off / Test / On partout ; un ancien « approve » se lit comme Test", async () => {
    const { lireMode } = await vi.importActual<typeof import("./api")>("./api");
    expect(lireMode("approve")).toBe("test");
    rendu();
    await screen.findByText("Relances des recrues");
    for (const cle of ["relances_auto", "lundi_soir_auto", "accueil_auto"]) {
      const ligne = within(document.querySelector<HTMLElement>(`[data-interrupteur="${cle}"]`)!);
      expect(ligne.getAllByRole("button").map((b) => b.textContent)).toEqual(["Off", "Test", "On"]);
    }
  });

  it("rappels en pause jusqu'au 2 nov. ; « Retirer la pause » vide la date", async () => {
    rendu();
    const zone = within(await screen.findByTestId("pause-rappels"));
    await vi.waitFor(() => expect(zone.getByLabelText("Rappels en pause jusqu'au")).toHaveValue("2026-11-02"));
    fireEvent.click(zone.getByRole("button", { name: "Retirer la pause" }));
    await vi.waitFor(() => expect(api.enregistrerRepriseRappels).toHaveBeenCalledWith(""));
  });

  it("Head of Ops : lecture seule", async () => {
    auth.role = "head_of_ops";
    rendu();
    expect((await screen.findAllByRole("button", { name: "Off" })).every((b) => b.hasAttribute("disabled"))).toBe(true);
  });
});
