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
import { texteAvecGras } from "./gras";

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

describe("20/11 : le gras dans une annonce", () => {
  it("met en gras ce qui est entre deux « ** », et garde les retours à la ligne", () => {
    render(<p data-testid="t">{texteAvecGras("Hi Ana.\n\n**Do NOT post anything**, and keep your old posts.")}</p>);
    const p = screen.getByTestId("t");
    expect(p.textContent).toBe("Hi Ana.\n\nDo NOT post anything, and keep your old posts.");
    expect(p.querySelector("strong")?.textContent).toBe("Do NOT post anything");
    expect(p.querySelectorAll("strong")).toHaveLength(1);
  });

  it("laisse tel quel un texte sans gras, ou avec un « ** » pas refermé", () => {
    expect(texteAvecGras("Plain text.")).toEqual(["Plain text."]);
    expect(texteAvecGras("Rated **5 stars")).toEqual(["Rated **5 stars"]);
  });
});
