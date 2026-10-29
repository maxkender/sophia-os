import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAUTS_REGLES, lireReglesPaie, phrasesPaie, REGLE_LIEN } from "./textes";

vi.mock("./api", () => ({
  useRegles: () => ({
    textes: DEFAUTS_REGLES,
    paie: lireReglesPaie({ manques_toleres: 1, retenue_par_post: 1 }),
    slack: null,
  }),
}));

import { CarteCommentPaye, RegleTexte } from "./CartesRegles";

describe("les règles aux posteurs (28 oct.)", () => {
  it("« How you're paid » : les 3 règles, puis la règle du lien", () => {
    render(<CarteCommentPaye />);
    const carte = screen.getByTestId("carte-comment-paye");
    expect(within(carte).getByText("Paid every Monday, for the week just finished.")).toBeInTheDocument();
    expect(
      within(carte).getByText("1 missed post per account per week is tolerated. Every further missed post is $1 off."),
    ).toBeInTheDocument();
    expect(
      within(carte).getByText(
        "No post on Monday and Tuesday: we message you once on Upwork. Still no post by Friday: the contract ends on Saturday.",
      ),
    ).toBeInTheDocument();
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

  it("les nombres viennent des réglages, et aucune règle ne demande de repost", () => {
    expect(phrasesPaie({ manquesToleres: 2, retenueParPost: 1.5 })[1]).toBe(
      "2 missed posts per account per week are tolerated. Every further missed post is $1.50 off.",
    );
    expect(JSON.stringify(DEFAUTS_REGLES).toLowerCase()).not.toContain("repost");
    expect(DEFAUTS_REGLES.warmup).toBe(
      "Create your TikTok account, click Start warmup and follow 5 accounts before Sunday midnight.",
    );
  });
});
