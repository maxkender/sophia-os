import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const a = vi.hoisted(() => ({ sauverReponses: vi.fn(), envoyerCapture: vi.fn() }));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...a }));

import { PageQuestionnaire } from "./PageQuestionnaire";
import { versCsv } from "./PageQuestionnaires";
import { colonnes, complet, dictionnaireAnglais, listePays, manquantes, paysOptions, type Reponses, SECTIONS, visible } from "./questions";
import { remplir } from "./textes";

/** Une réponse à chaque question obligatoire (choix : la 1re option ; textes : assez longs). */
function toutRepondu(): Reponses {
  const r: Reponses = {};
  for (const s of SECTIONS) {
    for (const q of s.questions) {
      if (q.type === "capture" || q.optionnel || q.si) continue;
      r[q.id] = q.type === "multi" ? [q.options![0]!] : q.options ? q.options[0] : q.type === "pays" ? "France" : "x".repeat(q.min ?? 3);
    }
  }
  return r;
}

function rendu(url = "/questionnaire/top-posters") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="/questionnaire/:slug" element={<PageQuestionnaire />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
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
    expect(screen.getByTestId("accroche-bonus")).toHaveTextContent("Hey! You'll get a $5 bonus for answering this (about 5 minutes).");
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

  it("20/11 : terminé = obligatoires (routine de 50 caractères au moins) + au moins une capture", () => {
    const r = toutRepondu();
    expect(complet(r, { capture_temps: ["p/1.png"] })).toBe(true);
    expect(complet(r, {})).toBe(false);
    expect(complet({ ...r, routine: "too short" }, { capture_temps: ["p/1.png"] })).toBe(false);
    expect(complet({ ...r, montage: "" }, { capture_audience: ["p/1.png"] })).toBe(false);
    // La routine est avant les habitudes ; Q13 (scroll) et Q16 (commentaires) précisées.
    expect(SECTIONS.map((x) => x.id)).toEqual(["vous", "telephone", "warmup", "routine", "habitudes", "captures"]);
    const habitudes = SECTIONS.find((x) => x.id === "habitudes")!;
    const actions = habitudes.questions.find((q) => q.id === "scroll_actions")!;
    expect(visible(actions, { scroll: "No" })).toBe(false);
    expect(visible(actions, { scroll: "15–30 min" })).toBe(true);
    const comment = habitudes.questions.find((q) => q.id === "commentaires_comment")!;
    expect(comment.optionnel).toBe(true);
    expect(visible(comment, { commentaires: "Often" })).toBe(true);
    expect(visible(comment, { commentaires: "Never" })).toBe(false);
    expect(habitudes.questions.some((q) => q.id === "temps_jour")).toBe(false);
  });

  it("20/11 : textes à traduire (clés), variables, pays dans la langue du posteur", () => {
    const d = dictionnaireAnglais();
    expect(d["ui.popup_titre"]).toBe("Hey! You'll get a $5 bonus for answering this (about 5 minutes).");
    expect(d["ui.merci_bonus"]).toBe("Thanks! Your $5 bonus will be added to your payment on Monday {date}.");
    expect(d["s.routine"]).toBe("Your daily posting routine");
    expect(d["a.montage"]).toContain("which app you use".replace("which", "Which"));
    expect(d["o.duree_post.0"]).toBe("Less than 5 min");
    expect(remplir("Step {n} of {total}", { n: 2, total: 7 })).toBe("Step 2 of 7");
    expect(JSON.stringify(d).toLowerCase()).not.toMatch(/\bbot\b|\bai\b|automat/);
    const tr = paysOptions("tr");
    expect(tr.find((p) => p.valeur === "Germany")?.libelle).toBe("Almanya");
  });

  it("20/11 : envoi final → merci avec la date du bonus ; sans capture, envoi impossible", async () => {
    const base = { identite: { nom: "Ana T.", email: "ana@example.com", tiktok: "ana" }, reponses: toutRepondu(), captures: {}, ecran: SECTIONS.length, termine: false };
    localStorage.setItem("questionnaire:top-posters:brouillon", JSON.stringify(base));
    a.sauverReponses.mockResolvedValue({ ok: true, bonus_lundi: "2026-11-23" });
    const { unmount } = rendu();
    expect(screen.getByTestId("suivant")).toBeDisabled();
    expect(screen.getByTestId("manque")).toHaveTextContent("Please add at least one screenshot.");
    unmount();
    localStorage.setItem("questionnaire:top-posters:brouillon", JSON.stringify({ ...base, captures: { capture_temps: ["p/1.png"] } }));
    rendu();
    fireEvent.click(screen.getByTestId("suivant"));
    expect(await screen.findByTestId("merci-bonus")).toHaveTextContent("Thanks! Your $5 bonus will be added to your payment on Monday 23 November.");
    const appel = a.sauverReponses.mock.calls.at(-1)!;
    expect(appel[3]).toBe(true);
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
