import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn(async (nom: string) =>
  nom === "mes_annonces"
    ? { data: [{ id: "a1", texte: "Hi Ana, your setup isn't finished yet: click Start warmup. Finish it by Monday noon and you'll start posting on Tuesday 3 November.", cree_at: "2026-11-01T21:45:00Z" }], error: null }
    : { data: null, error: null }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ roleReel: "poster" }) }));

import { AnnoncesPopup } from "./AnnoncesPopup";

describe("1/11 : le pop-up Start Tuesday sur le dashboard", () => {
  it("montre le texte, « Got it » le marque vu", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AnnoncesPopup />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/you'll start posting on Tuesday 3 November/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("annonce_vue", { p_id: "a1" }));
  });
});
