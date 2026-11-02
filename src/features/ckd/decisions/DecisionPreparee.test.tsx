import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { ChoixSamedi } from "./semaineComptes";

const api = vi.hoisted(() => ({
  lireBrouillonsSamedi: vi.fn(async () => new Map()),
  noterBrouillonSamedi: vi.fn<(l: string, c: string, k: ChoixSamedi, r: unknown) => Promise<void>>(async () => undefined),
}));
vi.mock("./semaineComptes", async (orig) => ({ ...(await orig<typeof import("./semaineComptes")>()), ...api }));

import { DecisionPreparee } from "./DecisionPreparee";

function rendu(cohorte: string | null = "2026-10-19") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <DecisionPreparee comptes={[{ id: "c1", handle_tiktok: "terezia.pokrok157" }]} cohorteLundi={cohorte} maintenant={new Date("2026-11-03T10:00:00Z")} />
    </QueryClientProvider>,
  );
}

describe("Posters → fiche : préparer la décision du samedi (0492)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });

  it("Kill & pay avec une note : enregistré comme brouillon du samedi 7 Nov (semaine du 2 Nov)", async () => {
    rendu();
    expect(screen.getByText("Prepare a decision for Saturday Sat 7 Nov")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Decision"), { target: { value: "kill" } });
    fireEvent.change(screen.getByLabelText("Note (why)"), { target: { value: "no posts since Tuesday" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.noterBrouillonSamedi).toHaveBeenCalledWith("2026-11-02", "c1", "kill", { note: "no posts since Tuesday" }));
  });

  it("une cohorte qui n'a pas commencé : rien à préparer (décidé dimanche soir)", () => {
    rendu("2026-11-09");
    expect(screen.getByTestId("decision-a-venir")).toBeInTheDocument();
    expect(screen.getByLabelText("Decision")).toBeDisabled();
  });
});
