import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "@/locales/index";

import { SectionSure, estModuleIntrouvable } from "./SectionSure";

function Boum(): never {
  throw new Error("Cannot read properties of null (reading 'x')");
}

describe("6/11 : une section qui plante n'emporte plus la page", () => {
  it("affiche l'erreur à la place de la section, le reste de la page s'affiche", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<div><p>reste</p><SectionSure nom="À décider maintenant"><Boum /></SectionSure></div>);
    expect(screen.getByText("reste")).toBeInTheDocument();
    expect(screen.getByTestId("section-erreur").textContent).toContain("Cannot read properties of null");
  });

  it("reconnaît un module introuvable après un déploiement", () => {
    expect(estModuleIntrouvable(new Error("Failed to fetch dynamically imported module: /assets/x.js"))).toBe(true);
    expect(estModuleIntrouvable(new Error("boom"))).toBe(false);
  });
});
