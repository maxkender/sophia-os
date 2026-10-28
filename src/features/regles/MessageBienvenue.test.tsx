import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAUTS_REGLES, lireReglesPaie, remplirBienvenue } from "./textes";

vi.mock("./api", () => ({
  useRegles: () => ({ textes: DEFAUTS_REGLES, paie: lireReglesPaie(null), slack: "https://join.slack.com/t/x/shared_invite/abc" }),
}));

import { MessageBienvenue } from "./MessageBienvenue";

describe("prompt 15, point 7 : le Welcome message après la création d'un poster", () => {
  it("login, mot de passe, Slack du réglage, guide Notion, règles, et Copier", () => {
    const ecrire = vi.fn();
    Object.assign(navigator, { clipboard: { writeText: ecrire } });
    render(<MessageBienvenue prenom="Ana" email="ana.k@vikstudios.co" password="12345678" />);
    const texte = screen.getByTestId("message-bienvenue").querySelector("pre")!.textContent!;
    expect(texte).toContain("Hi Ana, welcome to Vik Studios!");
    expect(texte).toContain("Login: ana.k@vikstudios.co");
    expect(texte).toContain("Password: 12345678");
    expect(texte).toContain("https://join.slack.com/t/x/shared_invite/abc");
    expect(texte).toContain("Vik-Studios-TikTok-Poster-Guide");
    expect(texte).toContain(DEFAUTS_REGLES.lien);
    expect(texte).not.toMatch(/\{\w+\}/);
    expect(texte.toLowerCase()).not.toContain("hiring manager");
    fireEvent.click(screen.getByRole("button"));
    expect(ecrire).toHaveBeenCalledWith(texte);
  });

  it("une variable inconnue reste telle quelle", () => {
    expect(remplirBienvenue("{a} {b}", { a: "x" })).toBe("x {b}");
  });
});
