import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const api = vi.hoisted(() => ({ relierSlack: vi.fn() }));
vi.mock("./api", () => api);
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slack_user_id: "U0ABC123" }, error: null }) }) }),
    }),
  },
}));

import { BoutonDelierSlack } from "./BoutonDelierSlack";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BoutonDelierSlack posterId="p1" nom="José Perez" />
    </QueryClientProvider>,
  );
}

describe("BoutonDelierSlack (prompt 15, point 1)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    vi.clearAllMocks();
    api.relierSlack.mockResolvedValue(undefined);
  });

  it("montre le compte relié ; « Délier » demande confirmation, refusé rien ne change", async () => {
    const confirmer = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    rendu();
    expect(await screen.findByText("Slack : U0ABC123")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Délier Slack/ }));
    expect(confirmer).toHaveBeenCalledWith(expect.stringContaining("Délier José Perez"));
    expect(api.relierSlack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Délier Slack/ }));
    await waitFor(() => expect(api.relierSlack).toHaveBeenCalledWith("p1", null));
    confirmer.mockRestore();
  });
});
