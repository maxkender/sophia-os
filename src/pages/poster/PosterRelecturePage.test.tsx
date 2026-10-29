import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const espace = vi.fn();

vi.mock("@/features/relectureNative/useEspaceRelecteur", () => ({
  useEspaceRelecteur: () => espace(),
}));

import { PosterRelecturePage } from "./PosterRelecturePage";

const RELECTEUR = {
  id: "r1",
  profile_id: "p1",
  langue: "de",
  statut: "invite",
  note: null,
  created_at: "2026-10-27T10:00:00Z",
};

describe("PosterRelecturePage", () => {
  beforeEach(() => {
    void i18n.changeLanguage("en");
    espace.mockReset();
  });

  it("dit que l'espace n'est pas ouvert quand le posteur n'y a pas accès", () => {
    espace.mockReturnValue({ relecteurs: [], isPending: false, error: null });
    render(<PosterRelecturePage />);
    expect(screen.getByText("This space is not open yet.")).toBeInTheDocument();
  });

  it("sans questionnaire ni kit : l'accueil, la règle d'or, et la correction des posts publiés à venir", () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR], isPending: false, error: null });
    render(<PosterRelecturePage />);
    expect(screen.getByText("Welcome to native review 👋")).toBeInTheDocument();
    expect(screen.getByText(/The golden rule/)).toBeInTheDocument();
    expect(screen.getByTestId("relecture-bientot")).toHaveTextContent("German");
    expect(screen.queryByText(/Your country, part by part/)).not.toBeInTheDocument();
    expect(screen.queryByText(/The 15 posts/)).not.toBeInTheDocument();
  });

  it("un relecteur de deux langues passe de l'une à l'autre", () => {
    espace.mockReturnValue({ relecteurs: [RELECTEUR, { ...RELECTEUR, id: "r2", langue: "tr" }], isPending: false, error: null });
    render(<PosterRelecturePage />);
    expect(screen.getByRole("button", { name: /Turkish/ })).toBeInTheDocument();
  });
});
