import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lireMonEmailRuul: vi.fn(),
  enregistrerMonEmailRuul: vi.fn(),
}));
vi.mock("./api", () => api);
const auth = vi.hoisted(() => ({ roleReel: "poster" as string }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

import i18n from "@/locales";

import { BandeauEmailRuul, DELAI_MERCI_MS } from "./BandeauEmailRuul";

function rendu(element: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{element}</QueryClientProvider>);
}

beforeEach(async () => {
  vi.clearAllMocks();
  auth.roleReel = "poster";
  await i18n.changeLanguage("en");
});
afterEach(() => vi.useRealTimers());

describe("Bandeau email Ruul (espace posteur)", () => {
  beforeEach(async () => {
    auth.roleReel = "poster";
    await i18n.changeLanguage("en");
  });

  it("posteur Ruul sans email : le bandeau, l'erreur de la base, puis enregistré et caché", async () => {
    api.lireMonEmailRuul.mockResolvedValue({ ruul: true, email: null });
    api.enregistrerMonEmailRuul.mockResolvedValueOnce({ ok: false, erreur: "This email is not valid." }).mockResolvedValueOnce({ ok: true });
    rendu(<BandeauEmailRuul />);
    const bandeau = await screen.findByTestId("bandeau-email-ruul");
    expect(bandeau).toHaveTextContent("Add your Ruul email so we can pay you");
    const champ = within(bandeau).getByLabelText("Your Ruul email");
    fireEvent.change(champ, { target: { value: "ana" } });
    fireEvent.click(within(bandeau).getByRole("button", { name: "Save" }));
    expect(await within(bandeau).findByRole("alert")).toHaveTextContent("This email is not valid.");
    fireEvent.change(champ, { target: { value: " ana@ruul.zz " } });
    fireEvent.click(within(bandeau).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.enregistrerMonEmailRuul).toHaveBeenLastCalledWith("ana@ruul.zz"));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    await waitFor(() => expect(screen.queryByTestId("bandeau-email-ruul")).toBeNull(), { timeout: DELAI_MERCI_MS + 1500 });
  });

  it("rien si l'email est déjà là, si le posteur n'est pas Ruul, ou pour l'admin", async () => {
    api.lireMonEmailRuul.mockResolvedValue({ ruul: true, email: "ana@ruul.zz" });
    const { unmount } = rendu(<BandeauEmailRuul />);
    await waitFor(() => expect(api.lireMonEmailRuul).toHaveBeenCalled());
    expect(screen.queryByTestId("bandeau-email-ruul")).toBeNull();
    unmount();

    api.lireMonEmailRuul.mockResolvedValue({ ruul: false, email: null });
    const r2 = rendu(<BandeauEmailRuul />);
    await waitFor(() => expect(api.lireMonEmailRuul).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("bandeau-email-ruul")).toBeNull();
    r2.unmount();

    auth.roleReel = "admin";
    api.lireMonEmailRuul.mockClear();
    rendu(<BandeauEmailRuul />);
    expect(screen.queryByTestId("bandeau-email-ruul")).toBeNull();
    expect(api.lireMonEmailRuul).not.toHaveBeenCalled();
  });
});
