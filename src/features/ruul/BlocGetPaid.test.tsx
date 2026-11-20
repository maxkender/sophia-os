import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { VueGetPaid } from "./BlocGetPaid";
import { etapeBloquee, etatBloc, type MonSetupRuul, TEXTES_SETUP_EN } from "./setup";

const base: MonSetupRuul = {
  ruul: true,
  etapes: { inscrit: false, identite: false, banque: false, pret: false, kyc: "NOT_STARTED" },
  email: "alex@example.com",
  ready_at: null,
  lien_auto: false,
};

function vue(s: MonSetupRuul, maintenant?: number) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><VueGetPaid s={s} t={TEXTES_SETUP_EN} maintenant={maintenant} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("21/11 : bloc « Get paid » des posteurs Ruul", () => {
  it("pas inscrit : 3 cases vides, l'email de candidature, la date limite, le lien Help", () => {
    vue(base);
    expect(screen.getByText("To get paid on Monday, finish your Ruul setup:")).toBeTruthy();
    expect(screen.getByText("Sign up on app.ruul.io with alex@example.com")).toBeTruthy();
    expect(screen.getByTestId("etape-inscrit").getAttribute("data-fait")).toBe("false");
    expect(screen.getByText("Ready before Sunday 23:59 (Paris) = paid on Monday.")).toBeTruthy();
    expect(screen.getByTestId("probleme-ruul").getAttribute("href")).toBe("/createur/help?ruul=inscrit");
    expect(screen.queryByText("Got it")).toBeNull();
  });

  it("il ne manque que la banque : 2 cases cochées, un seul bouton", () => {
    vue({ ...base, etapes: { inscrit: true, identite: true, banque: false, pret: false, kyc: "APPROVED" } });
    expect(screen.getByTestId("etape-inscrit").getAttribute("data-fait")).toBe("true");
    expect(screen.getByTestId("etape-identite").getAttribute("data-fait")).toBe("true");
    expect(screen.getByTestId("etape-banque").getAttribute("data-fait")).toBe("false");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByTestId("probleme-ruul").getAttribute("href")).toBe("/createur/help?ruul=banque");
  });

  it("prêt : « You're all set » 3 jours, puis plus rien ; un posteur Upwork : jamais", () => {
    const pret = { ...base, etapes: { inscrit: true, identite: true, banque: true, pret: true, kyc: "APPROVED" }, ready_at: "2026-11-20T10:00:00Z" };
    expect(etatBloc(pret, Date.parse("2026-11-22T10:00:00Z"))).toBe("pret");
    expect(etatBloc(pret, Date.parse("2026-11-23T11:00:00Z"))).toBe("rien");
    expect(etatBloc({ ...base, ruul: false, etapes: null })).toBe("rien");
    expect(etapeBloquee(pret)).toBeNull();
    vue(pret, Date.parse("2026-11-21T10:00:00Z"));
    expect(screen.getByTestId("bloc-get-paid-pret").textContent).toContain("You're all set");
  });
});
