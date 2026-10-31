import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  trouverPosteur: vi.fn(async () => [
    { poster_id: "p1", nom: "Ana Silva", cohorte_lundi: "2026-11-02", hm_nom: "Rana Barakli", contrat_id: "44805016" },
  ]),
}));
vi.mock("./creationCoupee", async (orig) => ({ ...(await orig<typeof import("./creationCoupee")>()), ...api }));

import { CreationCoupee } from "./CreationCoupee";
import { creationCoupeePour, lienMaCohorte } from "./creationCoupee";

describe("1/11 : les HM ne créent plus de posteurs", () => {
  it("le message exact, « My cohort », et le lien direct vers le posteur qui existe déjà", async () => {
    await i18n.changeLanguage("en");
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <CreationCoupee />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("creation-coupee-message")).toHaveTextContent(
      "You don't create posters anymore. The OS creates the poster and sends the welcome automatically when the offer is accepted. Your recruit is probably already created: check My cohort.",
    );
    expect(screen.getByRole("link", { name: "My cohort" })).toHaveAttribute("href", "/manager/accueil");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://www.upwork.com/nx/wm/workroom/44805016/overview" } });
    fireEvent.click(screen.getByRole("button", { name: "Find my recruit" }));
    await waitFor(() => expect(screen.getByTestId("posteurs-trouves")).toHaveTextContent("Ana Silva"));
    expect(screen.getAllByRole("link", { name: "My cohort" })[1]).toHaveAttribute("href", "/manager/accueil?posteur=p1");
  });

  it("HM et DM bloquées ; admin et Head of Ops non", () => {
    expect([creationCoupeePour("hiring_manager"), creationCoupeePour("directing_manager")]).toEqual([true, true]);
    expect([creationCoupeePour("admin"), creationCoupeePour("head_of_ops")]).toEqual([false, false]);
    expect(lienMaCohorte("x")).toBe("/manager/accueil?posteur=x");
  });
});
