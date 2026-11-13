import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageLienEmail } from "./PageLienEmail";

const page = (url: string) =>
  render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/r/:action" element={<PageLienEmail />} /></Routes></MemoryRouter>);

afterEach(() => vi.unstubAllGlobals());

describe("liens des emails (/r/…)", () => {
  it("password : confirmer, puis le nouveau mot de passe s'affiche", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, confirmer: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, login: "anao@sophia.com", mot_de_passe: "bake2345", dashboard: "https://os" })));
    vi.stubGlobal("fetch", f);
    page("/r/password?t=abcdefghijklmnopqrstuvwxyz");
    fireEvent.click(await screen.findByRole("button", { name: "Get a new password" }));
    expect(await screen.findByTestId("nouveau-mot-de-passe")).toBeTruthy();
    expect(screen.getByText("bake2345")).toBeTruthy();
    expect(String(f.mock.calls[1][0])).toContain("&confirme=1");
  });

  it("lien déjà utilisé : message, aucun bouton", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, raison: "utilise" }))));
    page("/r/stop?t=abcdefghijklmnopqrstuvwxyz");
    expect(await screen.findByText("This link has already been used.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
