import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "@/locales";

import { EnteteCompte } from "./VignetteCompte";

describe("Posters : la carte d'un compte montre le logo de l'application et ses labels", () => {
  it("logo + nom de l'application servie, et le nom de chaque label", () => {
    render(
      <EnteteCompte
        compact
        compte={{ id: "c1", langue: "fr", pays: "FR", handle_tiktok: "anna.examen886", persona_nom: "Anna" }}
        applications={[{ slug: "unswipe", part: null }]}
        labels={[{ id: "l1", nom: "clean_study", couleur: "#22c55e" }]}
      />,
    );
    const app = document.querySelector('[data-application="unswipe"]')!;
    expect(app.querySelector("img")).not.toBeNull();
    expect(screen.getByTestId("labels-compte").textContent).toContain("clean_study");
  });
});
