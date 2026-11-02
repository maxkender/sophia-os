/** Décisions finales 4 : les compteurs de messages Upwork dans Health. */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({
  lireCompteursUpwork: vi.fn(async () => ({
    jours: [{ jour: "2026-10-29", type: "relance", upwork: 12, hm: 3 }, { jour: "2026-10-28", type: "accueil", upwork: 20, hm: 0 }],
    attente: [{ type: "relance", n: 5, main: 2 }],
  })),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));

import { CompteursUpwork } from "./CompteursUpwork";

describe("Health : messages Upwork par jour et par type", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
  });

  it("partis par l'OS · confiés aux HM, et ce qui attend", async () => {
    render(<QueryClientProvider client={new QueryClient()}><CompteursUpwork /></QueryClientProvider>);
    expect(await screen.findByText("12 · 3")).toBeInTheDocument();
    expect(screen.getByText("20 · 0")).toBeInTheDocument();
    expect(screen.getByTestId("compteurs-attente")).toHaveTextContent("5 en file, 2 chez les HM");
  });
});
