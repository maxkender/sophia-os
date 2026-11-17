import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const a = vi.hoisted(() => ({ sauverReponses: vi.fn(), envoyerCapture: vi.fn() }));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...a }));

import { PageQuestionnaire } from "./PageQuestionnaire";
import { versCsv } from "./PageQuestionnaires";
import { colonnes, listePays, manquantes, SECTIONS, visible } from "./questions";

function rendu(url = "/questionnaire/top-posters") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/questionnaire/:slug" element={<PageQuestionnaire />} /></Routes>
    </MemoryRouter>,
  );
}

describe("Questionnaire (15/11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    a.sauverReponses.mockResolvedValue({ ok: true });
  });

  it("questions : suites conditionnelles, obligatoires, pays, colonnes", () => {
    const vpn = SECTIONS[1]!.questions.find((q) => q.id === "vpn_app")!;
    expect(visible(vpn, { vpn: "Never" })).toBe(false);
    expect(visible(vpn, { vpn: "Always" })).toBe(true);
    expect(manquantes(SECTIONS[0]!, { pays: "France", niveau_langue: "Native" })).toHaveLength(0);
    expect(manquantes(SECTIONS[0]!, {}).map((q) => q.id)).toEqual(["pays", "niveau_langue"]);
    expect(listePays()).toContain("France");
    expect(colonnes().map((c) => c.id)).toContain("ville");
    const texte = JSON.stringify(SECTIONS).toLowerCase();
    expect(texte).not.toMatch(/\bbot\b|\bai\b/);
  });

  it("parcours : identité, une section par écran avec barre de progression, envoi final, merci", async () => {
    rendu();
    expect(screen.getByText(/Thanks for taking 5 minutes/)).toBeTruthy();
    const suivant = screen.getByTestId("suivant");
    expect(suivant).toBeDisabled();
    fireEvent.change(screen.getByLabelText("First name and last name"), { target: { value: "Ana T." } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Your TikTok @"), { target: { value: "@ana.t" } });
    fireEvent.click(screen.getByTestId("suivant"));
    await waitFor(() => expect(a.sauverReponses).toHaveBeenCalled());
    expect(screen.getByText("About you")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Native" }));
    fireEvent.change(screen.getByLabelText("Country you live in"), { target: { value: "France" } });
    fireEvent.click(screen.getByTestId("suivant"));
    expect(await screen.findByText("Your phone and connection")).toBeTruthy();
    // Les écrans suivants (réponses minimales), jusqu'à l'envoi.
    const derniere = a.sauverReponses.mock.calls.at(-1)!;
    expect(derniere[0]).toBe("top-posters");
    expect(derniere[2].reponses).toMatchObject({ niveau_langue: "Native", pays: "France" });
  });

  it("« Do the star survey » en test (?test=1) : bandeau, rien n'est enregistré", async () => {
    rendu("/questionnaire/top-posters?test=1");
    expect(screen.getByTestId("mode-test")).toHaveTextContent("nothing is saved");
    fireEvent.change(screen.getByLabelText("First name and last name"), { target: { value: "Max Test" } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "max@example.com" } });
    fireEvent.change(screen.getByLabelText("Your TikTok @"), { target: { value: "@test" } });
    fireEvent.click(screen.getByTestId("suivant"));
    expect(await screen.findByText("About you")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(a.sauverReponses).not.toHaveBeenCalled();
  });

  it("CSV : une ligne par personne, données OS, non reliée signalée", () => {
    const csv = versCsv([{
      id: "1", nom: "Ana, T.", email: "a@x.zz", tiktok: "ana", poster_id: null, relie_par: null, reponses: { genre: "Woman", warmup_actions: ["Like", "Follow"] },
      captures: { capture_temps: ["p/1.png"] }, section: 6, termine_at: "2026-11-15T10:00:00Z", maj_at: "2026-11-15T10:00:00Z", os: null,
    }]);
    const [tete, ligne] = csv.split("\n");
    expect(tete).toContain("Médiane vues 30 j");
    expect(ligne).toContain("\"Ana, T.\"");
    expect(ligne).toContain("non reliée");
    expect(ligne).toContain("Like ; Follow");
  });
});
