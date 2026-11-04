import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import i18n from "@/locales/index";

import { MessagesCarte } from "./MessagesCarte";

describe("MessagesCarte (0532)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
  });

  it("le dernier message sans réponse (canal, heures) et les messages avec auteur et canal", () => {
    render(
      <MessagesCarte
        sansReponse={{ texte: "Can I continue working on the project?", canal: "upwork", at: "2026-11-04T04:54:00Z", depuis_heures: 3.6, question: true }}
        messages={[
          { at: "2026-11-04T04:54:00Z", canal: "upwork", auteur: "posteur", texte: "Can I continue working on the project?" },
          { at: "2026-11-03T10:00:00Z", canal: "slack", auteur: "hm", texte: "Sure, post today." },
          { at: "2026-11-02T10:00:00Z", canal: "slack_dm", auteur: "os", texte: "Reminder" },
        ]}
      />,
    );
    expect(screen.getByTestId("sans-reponse").textContent).toContain("Sans réponse · Upwork · depuis 3.6 h");
    fireEvent.click(screen.getByText("Voir les 3 derniers messages"));
    const liste = screen.getByTestId("liste-messages").textContent ?? "";
    expect(liste).toContain("HM · Slack");
    expect(liste).toContain("OS · Slack (DM)");
  });

  it("rien à montrer : rien", () => {
    const { container } = render(<MessagesCarte messages={[]} sansReponse={null} />);
    expect(container.textContent).toBe("");
  });
});
