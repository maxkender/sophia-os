import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "i18next";

import "@/locales";
import type { ReponseSuiviRc } from "@/features/revenuecat/types";

const chargerSuiviRc = vi.fn();
const listerComptes = vi.fn();

vi.mock("@/features/moteur/api", () => ({
  chargerSuiviRc: () => chargerSuiviRc(),
  listerComptes: () => listerComptes(),
}));

import { AdminSuiviRcPage } from "./AdminSuiviRcPage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminSuiviRcPage />
    </QueryClientProvider>,
  );
}

const snapshotOk: ReponseSuiviRc = {
  ok: true,
  secret_manquant: false,
  depuis_cache: true,
  snapshot: {
    fetched_at: "2026-09-03T12:00:00.000Z",
    project_id: "proj3f496a80",
    charts: {
      trials_new: {
        display_name: "New Trials",
        resolution: "day",
        values: [
          { cohort: 1787788800, incomplete: false, measure: 0, segment: 1, value: 41 },
        ],
        segments: [
          { display_name: "Total", is_total: true },
          { display_name: "Türkiye" },
        ],
        measures: [{ display_name: "New Trials", unit: "#", decimal_precision: 0 }],
        summary: { total: { Türkiye: { "New Trials": 341 } } },
      },
      trial_conversion_rate: {
        display_name: "Trial Conversion Rate",
        resolution: "week",
        values: [
          { cohort: 1785628800, incomplete: false, measure: 4, segment: 1, value: 21.65 },
        ],
        segments: [
          { display_name: "Total", is_total: true },
          { display_name: "Türkiye" },
        ],
        measures: [
          { display_name: "Trial Starts", unit: "#" },
          { display_name: "Conversions", unit: "#" },
          { display_name: "Expirations", unit: "#" },
          { display_name: "Pending", unit: "#" },
          { display_name: "Conversion Rate", unit: "%", decimal_precision: 1 },
        ],
        summary: {
          total: { Türkiye: { "Conversion Rate": 21.3, "Trial Starts": 1498 } },
        },
      },
      initial_conversion: {
        display_name: "Initial Conversion",
        resolution: "week",
        values: [
          { cohort: 1785628800, incomplete: false, measure: 0, segment: 1, value: 18.2 },
        ],
        segments: [
          { display_name: "Total", is_total: true },
          { display_name: "France" },
        ],
        measures: [{ display_name: "Conversion Rate", unit: "%", decimal_precision: 1 }],
        summary: { total: { France: { "Conversion Rate": 18.2 } } },
      },
    },
  },
};

describe("AdminSuiviRcPage", () => {
  beforeEach(() => {
    void i18n.changeLanguage("fr");
    chargerSuiviRc.mockReset();
    listerComptes.mockReset();
    listerComptes.mockResolvedValue([]);
  });

  it("affiche l'état secret manquant", async () => {
    chargerSuiviRc.mockResolvedValueOnce({
      ok: true,
      secret_manquant: true,
      depuis_cache: false,
      snapshot: null,
    } satisfies ReponseSuiviRc);
    renderPage();
    expect(await screen.findByText("Clé RevenueCat absente")).toBeInTheDocument();
    expect(screen.getByText(/REVENUECAT_SECRET_API_KEY/)).toBeInTheDocument();
  });

  it("affiche les trois blocs et un pays du snapshot", async () => {
    chargerSuiviRc.mockResolvedValue(snapshotOk);
    renderPage();
    expect(await screen.findByText("Conversion paywall (proxy)")).toBeInTheDocument();
    expect(screen.getByText("Suivi metrics RC")).toBeInTheDocument();
    expect(screen.getByText("Conversion trial → payant")).toBeInTheDocument();
    expect(screen.getByText("Free trials par jour")).toBeInTheDocument();
    expect(screen.getAllByText("Türkiye").length).toBeGreaterThan(0);
    expect(screen.getByText("France")).toBeInTheDocument();
  });

  it("affiche le ratio trials / créateurs par langue", async () => {
    chargerSuiviRc.mockResolvedValue(snapshotOk);
    listerComptes.mockResolvedValue([
      { id: "c1", poster_id: "p1", langue: "tr", application_slug: "sophia", is_active: true },
    ]);
    renderPage();
    expect(await screen.findByText("Performance des créateurs")).toBeInTheDocument();
    expect(screen.getByText("Turc")).toBeInTheDocument();
    expect(screen.getByText("41,0")).toBeInTheDocument();
    expect(screen.getByText("41,00")).toBeInTheDocument();
  });
});
