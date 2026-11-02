import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAUTS_REGLES, lireReglesPaie, phrasesPaie, REGLE_LIEN } from "./textes";

vi.mock("./api", () => ({
  useRegles: () => ({
    textes: DEFAUTS_REGLES,
    paie: lireReglesPaie(6),
    slack: null,
  }),
}));

import { CarteCommentPaye, RegleTexte } from "./CartesRegles";

describe("les règles aux posteurs (28 oct.)", () => {
  it("« How you're paid » : les règles du 2 nov. (prompt 21, C8), puis la règle du lien", () => {
    render(<CarteCommentPaye />);
    const carte = screen.getByTestId("carte-comment-paye");
    expect(
      within(carte).getByText(
        "Paid every Monday for the week just finished (Monday to Sunday): 6 posts or more with their link = your full rate.",
      ),
    ).toBeInTheDocument();
    expect(
      within(carte).getByText("Below 6 posts with link in a week, we stop our collaboration. That last week is still paid in full."),
    ).toBeInTheDocument();
    expect(within(carte).getByText(/End of your first Monday \(midnight, Paris time\)/)).toBeInTheDocument();
    expect(within(carte).getByText(/^Thursday:/)).toBeInTheDocument();
    expect(within(carte).getByText(/^Saturday:/)).toBeInTheDocument();
    expect(carte.textContent).not.toMatch(/tolerated|\$1 off|Wednesday|Friday/);
    expect(within(carte).getByText(REGLE_LIEN)).toBeInTheDocument();
    expect(
      within(carte).getByText("Questions? Ask in #questions on Slack, or reply to our message on Upwork."),
    ).toBeInTheDocument();
    expect(carte.textContent).not.toMatch(/hiring manager/i);
  });

  it("la règle du lien, telle que demandée", () => {
    render(<RegleTexte regle="lien" />);
    expect(
      screen.getByText(
        "A post only counts when you mark it published with its link on your dashboard, the same day, before midnight (your time). After midnight it counts as missed.",
      ),
    ).toBeInTheDocument();
  });

  it("le minimum vient du réglage, et aucune règle ne demande de repost", () => {
    expect(phrasesPaie(lireReglesPaie(5))[1]).toBe(
      "Below 5 posts with link in a week, we stop our collaboration. That last week is still paid in full.",
    );
    expect(lireReglesPaie(null).minimumPosts).toBe(6);
    expect(lireReglesPaie("x").minimumPosts).toBe(6);
    expect(JSON.stringify(DEFAUTS_REGLES).toLowerCase()).not.toContain("repost");
    expect(DEFAUTS_REGLES.warmup).toBe(
      "Create your TikTok account, click Start warmup and follow 5 accounts before Sunday midnight.",
    );
  });
});
