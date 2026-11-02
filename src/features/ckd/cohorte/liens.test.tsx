import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import "@/locales";

import { HandleTiktok, LienPosteur } from "./liens";

describe("liens de la cohorte", () => {
  it("le @handle ouvre le profil TikTok dans un nouvel onglet", () => {
    render(<HandleTiktok handle="agustina.libros485" pays="AR" />);
    const lien = screen.getByRole("link", { name: /@agustina\.libros485/ });
    expect(lien).toHaveAttribute("href", "https://www.tiktok.com/@agustina.libros485");
    expect(lien).toHaveAttribute("target", "_blank");
    expect(lien).toHaveAttribute("rel", "noreferrer");
  });

  it("sans handle, pas de lien", () => {
    render(<HandleTiktok handle={null} pays={null} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("le nom du posteur mène à sa page", () => {
    render(
      <MemoryRouter>
        <LienPosteur compteId="c1" nom="Niki Nahiara" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Niki Nahiara" })).toHaveAttribute("href", "/admin/createurs/c1");
  });
});
