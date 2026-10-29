/** Prompt 25 MAJ : les freins d'envoi, en haut d'Overview, avec « Resume » pour l'admin. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const base = vi.hoisted(() => {
  const leves: string[] = [];
  return {
    leves,
    rpc: vi.fn(async (_n: string, a: { p_id: string }) => {
      leves.push(a.p_id);
      return { data: true, error: null };
    }),
    lignes: [{ id: "f1", type: "relance", motif: "plafond_heure", detail: "41 messages « relance » en une heure (plafond 40)", cree_at: "2026-10-30T09:00:00Z" }],
  };
});
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ is: () => ({ order: async () => ({ data: base.lignes, error: null }) }) }) }),
    rpc: base.rpc,
  },
}));
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ role: auth.role }) }));

import { FreinsEnvoi } from "./FreinsEnvoi";

function rendu() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FreinsEnvoi />
    </QueryClientProvider>,
  );
}

describe("les freins d'envoi", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    auth.role = "admin";
    await i18n.changeLanguage("en");
  });

  it("le type en pause, la raison ; Resume (confirmé) lève le frein", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    rendu();
    expect(await screen.findByText("“Daily reminder (new recruits)” messages paused")).toBeInTheDocument();
    expect(screen.getByText(/hourly cap reached · 41 messages/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(base.rpc).toHaveBeenCalledWith("frein_lever", { p_id: "f1" }));
  });

  it("le Head of Ops voit le frein, sans Resume", async () => {
    auth.role = "head_of_ops";
    rendu();
    await screen.findByTestId("freins-envoi");
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
  });
});
