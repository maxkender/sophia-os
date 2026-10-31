import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import i18n from "@/locales";

import type { PointPret } from "./api";

const api = vi.hoisted(() => ({
  lirePretLundi: vi.fn<() => Promise<PointPret[]>>(async () => []),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));

import { PretLundi } from "./PretLundi";

const rendu = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <PretLundi />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe("Ready for Monday", () => {
  it("rouge ce qui manque (avec ce que ça doit être et le lien), vert ce qui est bon, gris l'information", async () => {
    await i18n.changeLanguage("en");
    api.lirePretLundi.mockResolvedValue([
      { ordre: 10, groupe: "interrupteurs", cle: "accueil_auto", ok: false, valeur: "off", attendu: "on", lien: "/admin/auto" },
      { ordre: 20, groupe: "contrats", cle: "a_relier", ok: true, valeur: "0", attendu: "0", lien: "/admin/auto/decisions?onglet=samedi" },
      { ordre: 41, groupe: "samedi", cle: "retirer_slack", ok: null, valeur: "5", attendu: null, lien: "/admin/auto/logs" },
    ]);
    rendu();
    await waitFor(() => expect(screen.getByTestId("pret-lundi")).toHaveTextContent("Ready for Monday: 1 thing(s) missing"));
    const accueil = document.querySelector('[data-pret="accueil_auto"]')!;
    expect(accueil).toHaveTextContent("Automatic onboarding");
    expect(accueil).toHaveTextContent("should be on");
    expect(accueil.querySelector("a")).toHaveAttribute("href", "/admin/auto");
    expect(document.querySelector('[data-pret="a_relier"]')).toHaveAttribute("data-ok", "true");
    expect(document.querySelector('[data-pret="retirer_slack"]')).toHaveAttribute("data-ok", "null");
    expect(document.querySelector('[data-pret="a_relier"]')).not.toHaveTextContent("should be");
  });

  it("tout vert : « everything is green »", async () => {
    await i18n.changeLanguage("en");
    api.lirePretLundi.mockResolvedValue([
      { ordre: 60, groupe: "needs_you", cle: "restant", ok: true, valeur: "0", attendu: "0", lien: "/admin/auto/needs-you" },
    ]);
    rendu();
    await waitFor(() => expect(screen.getByTestId("pret-lundi")).toHaveTextContent("Ready for Monday: everything is green"));
  });
});
