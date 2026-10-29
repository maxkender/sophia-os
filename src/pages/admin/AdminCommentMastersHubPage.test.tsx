import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, Navigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

vi.mock("./AdminCommentMastersPage", () => ({ AdminCommentMastersPage: () => <p>page-reglages</p> }));
vi.mock("./AdminCommentMastersSuiviPage", () => ({ AdminCommentMastersSuiviPage: () => <p>page-suivi</p> }));

import { AdminCommentMastersHubPage } from "./AdminCommentMastersHubPage";

function Ou() {
  const l = useLocation();
  return <output data-testid="url">{l.pathname + l.search}</output>;
}

function rendu(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/admin/comment-masters" element={<><AdminCommentMastersHubPage /><Ou /></>} />
        <Route path="/admin/comment-masters/suivi" element={<Navigate to="/admin/comment-masters" replace />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminCommentMastersHubPage", () => {
  it("ouvre Suivi par défaut, Réglages dans l'URL", async () => {
    await i18n.changeLanguage("fr");
    rendu("/admin/comment-masters");
    expect(screen.getByText("page-suivi")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réglages" }));
    expect(screen.getByText("page-reglages")).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("/admin/comment-masters?onglet=reglages");
    fireEvent.click(screen.getByRole("button", { name: "Suivi" }));
    expect(screen.getByText("page-suivi")).toBeInTheDocument();
  });

  it("l'ancienne URL du suivi redirige vers l'onglet Suivi", () => {
    rendu("/admin/comment-masters/suivi");
    expect(screen.getByText("page-suivi")).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent(/^\/admin\/comment-masters$/);
  });

  it("?onglet=reglages ouvre les réglages", () => {
    rendu("/admin/comment-masters?onglet=reglages");
    expect(screen.getByText("page-reglages")).toBeInTheDocument();
  });
});
