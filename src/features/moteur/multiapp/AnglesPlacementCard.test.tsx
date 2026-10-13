import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const SOPHIA = "00000000-0000-4000-8000-000000000001";
const UNSWIPE = "00000000-0000-4000-8000-000000000003";

let liens: Array<{ label_id: string; application_id: string; angle?: string | null }> = [];
const majAngleLabel = vi.fn();
const definirApplicationsLabel = vi.fn();

vi.mock("@/features/moteur/api", () => ({
  listerLabels: () =>
    Promise.resolve([
      { id: "w", nom: "weird_alpha", slug: "weird-alpha" },
      { id: "b", nom: "beau_smart_girl", slug: "beau-smart-girl" },
      { id: "h", nom: "hook", slug: "hook" },
    ]),
}));

vi.mock("@/features/moteur/apiMultiApp", () => ({
  listerLiensLabels: () => Promise.resolve(liens),
  majAngleLabel: (...args: unknown[]) => majAngleLabel(...args),
  definirApplicationsLabel: (...args: unknown[]) => definirApplicationsLabel(...args),
}));

import { AnglesPlacementCard } from "./AnglesPlacementCard";
import { LabelApplications } from "./LabelApplications";

function rendre(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("AnglesPlacementCard", () => {
  beforeEach(() => {
    liens = [
      { label_id: "w", application_id: SOPHIA, angle: null },
      { label_id: "w", application_id: UNSWIPE, angle: "insister sur la discipline" },
      { label_id: "b", application_id: UNSWIPE, angle: null },
      { label_id: "h", application_id: UNSWIPE, angle: "jamais affiché" },
    ];
    majAngleLabel.mockReset();
    majAngleLabel.mockResolvedValue(undefined);
  });

  it("un champ par label qui sert l'application (sans label système), angle enregistré prérempli", async () => {
    rendre(<AnglesPlacementCard applicationId={UNSWIPE} nom="Unswipe" sophia={false} />);
    const lignes = await screen.findAllByTestId("ligne-angle");
    expect(lignes.map((l) => within(l).getByRole("textbox").getAttribute("id"))).toEqual([
      `angle-b-${UNSWIPE}`,
      `angle-w-${UNSWIPE}`,
    ]);
    expect((screen.getByLabelText("weird_alpha") as HTMLTextAreaElement).value).toBe("insister sur la discipline");
    expect((screen.getByLabelText("beau_smart_girl") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByLabelText("beau_smart_girl") as HTMLTextAreaElement).maxLength).toBe(500);
    expect(screen.queryByLabelText("hook")).toBeNull();
  });

  it("enregistrer : n'envoie que la paire modifiée, bouton inactif tant que rien ne change", async () => {
    rendre(<AnglesPlacementCard applicationId={UNSWIPE} nom="Unswipe" sophia={false} />);
    const champ = (await screen.findByLabelText("beau_smart_girl")) as HTMLTextAreaElement;
    const ligne = champ.closest("[data-testid=ligne-angle]") as HTMLElement;
    const bouton = within(ligne).getByRole("button");
    expect(bouton).toBeDisabled();
    fireEvent.change(champ, { target: { value: "montrer la fierté d'avoir tenu" } });
    expect(bouton).not.toBeDisabled();
    fireEvent.click(bouton);
    await waitFor(() =>
      expect(majAngleLabel).toHaveBeenCalledWith("b", UNSWIPE, "montrer la fierté d'avoir tenu"),
    );
    expect(majAngleLabel).toHaveBeenCalledTimes(1);
  });

  it("Sophia : mêmes champs, et le rappel que le test à blanc ne la couvre pas", async () => {
    rendre(<AnglesPlacementCard applicationId={SOPHIA} nom="Sophia" sophia />);
    await screen.findByLabelText("weird_alpha");
    expect(screen.getByTestId("angles-placement").textContent).toMatch(/ne couvre pas Sophia|does not cover Sophia/);
  });
});

describe("LabelApplications : décocher une application qui a un angle", () => {
  const APPS = [
    { id: SOPHIA, slug: "sophia", nom: "Sophia", created_at: "2026-01-01", langues: null, actif: true },
    { id: UNSWIPE, slug: "unswipe", nom: "Unswipe", created_at: "2026-09-01", langues: null, actif: true },
  ];

  beforeEach(() => {
    definirApplicationsLabel.mockReset();
    definirApplicationsLabel.mockResolvedValue(undefined);
  });

  it("demande confirmation (et n'écrit rien si on refuse), pas de question sans angle", async () => {
    const confirmer = vi.spyOn(window, "confirm").mockReturnValue(false);
    const avecAngle = [
      { label_id: "w", application_id: SOPHIA, angle: null },
      { label_id: "w", application_id: UNSWIPE, angle: "insister sur la discipline" },
    ];
    const { unmount } = rendre(
      <LabelApplications
        labelId="w"
        applications={APPS}
        liens={avecAngle}
        reserves={undefined}
        applicationSelectionneeId={UNSWIPE}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Unswipe" }));
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(confirmer.mock.calls[0][0]).toContain("insister sur la discipline");
    expect(definirApplicationsLabel).not.toHaveBeenCalled();
    unmount();

    confirmer.mockClear();
    rendre(
      <LabelApplications
        labelId="w"
        applications={APPS}
        liens={avecAngle.map((l) => ({ ...l, angle: null }))}
        reserves={undefined}
        applicationSelectionneeId={UNSWIPE}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Unswipe" }));
    expect(confirmer).not.toHaveBeenCalled();
    await waitFor(() => expect(definirApplicationsLabel).toHaveBeenCalledWith("w", [SOPHIA]));
    confirmer.mockRestore();
  });
});
