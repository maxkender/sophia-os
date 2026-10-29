import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ANCIENNES_ADRESSES } from "./pages";
import { Redirection } from "./Redirection";

function Ici() {
  const l = useLocation();
  return <p data-testid="ici">{`${l.pathname}${l.search}`}</p>;
}

function rendu(depart: string) {
  render(
    <MemoryRouter initialEntries={[depart]}>
      <Routes>
        {Object.entries(ANCIENNES_ADRESSES).map(([de, vers]) => (
          <Route key={de} path={de} element={<Redirection vers={vers} />} />
        ))}
        <Route path="*" element={<Ici />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTestId("ici").textContent;
}

describe("prompt 22 : les anciennes adresses redirigent", () => {
  it.each([
    ["/admin/pipeline", "/admin/auto/recruits"],
    ["/admin/cohortes", "/admin/auto/recruits"],
    ["/admin/nudges", "/admin/auto/sent"],
    ["/admin/reponses", "/admin/auto/received"],
    ["/admin/paie", "/admin/auto/payroll"],
    ["/admin/recrutements", "/admin/auto/recruits"],
    ["/admin/recrutements/FR", "/admin/auto/recruits"],
    ["/admin/reviews", "/admin/retours-contestes"],
    ["/admin/assistant", "/admin/auto/faq"],
    ["/admin/check-kill-double", "/admin/auto/decisions"],
  ])("%s → %s", (de, vers) => {
    expect(rendu(de)).toBe(vers);
  });

  it("garde les paramètres de l'adresse", () => {
    expect(rendu("/admin/check-kill-double?onglet=samedi")).toBe("/admin/auto/decisions?onglet=samedi");
  });
});
