import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  lireInterrupteurs: vi.fn(async () => ({ accueil_auto: "test", relances_auto: "test", kill_auto: "test", arret_auto: "test", lundi_message_auto: "test", reponses_auto: "test" })),
  enregistrerInterrupteur: vi.fn(async () => undefined),
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

describe("Réglages → Interrupteurs", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("fr");
  });

  it("test par défaut ; on demande une confirmation ; le Head of Ops ne peut pas changer", async () => {
    rendu();
    await screen.findByText("Kill automatique");
    const ligne = within(document.querySelector<HTMLElement>('[data-interrupteur="accueil_auto"]')!);
    const on = ligne.getByRole("button", { name: "On" });
    expect(ligne.getByRole("button", { name: "Test" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll("[data-interrupteur]")).toHaveLength(6);
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(on);
    expect(api.enregistrerInterrupteur).not.toHaveBeenCalled();
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    fireEvent.click(on);
    await vi.waitFor(() => expect(api.enregistrerInterrupteur).toHaveBeenCalledWith("accueil_auto", "on"));
  });

  it("Head of Ops : lecture seule", async () => {
    auth.role = "head_of_ops";
    rendu();
    expect((await screen.findAllByRole("button", { name: "Off" })).every((b) => b.hasAttribute("disabled"))).toBe(true);
  });
});
