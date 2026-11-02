/**
 * Prompt 21, partie U8 : « Needs you ». Un lien TikTok introuvable apparaît
 * dans « Pas sûr », filtrable par cohorte ; « Count this post » le compte ; un
 * handle corrigé est relevé tout de suite ; une question hors FAQ apparaît une
 * seule fois, avec son compteur.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { CasNeedsYou } from "./api";
import { filtrer, FILTRES_VIDES, trier } from "./logique";

const api = vi.hoisted(() => ({
  lireNeedsYou: vi.fn(),
  agirNeedsYou: vi.fn(async () => "ok"),
  releverCompte: vi.fn(async () => ({ existe: true })),
  repondreQuestions: vi.fn(async () => undefined),
  ignorerQuestions: vi.fn(async () => undefined),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));

import { PageNeedsYou } from "./PageNeedsYou";
import { ResumeNeedsYou } from "./ResumeNeedsYou";

function cas(o: Partial<CasNeedsYou>): CasNeedsYou {
  return {
    cle: "x", categorie: "pas_sur", type: "lien_introuvable", poster_id: "p1", nom: "Ana", cohorte: "2026-10-26", hm: "Lucia",
    pays: "PH", vu: "https://www.tiktok.com/@ana/photo/1", pense: "Introuvable sur TikTok", confiance: null, urgence: "paie",
    rang: 2, cree_at: "2026-10-28T10:00:00Z", actions: ["compter", "corriger_lien", "ignorer"], ref: "pa1",
    lien: "https://www.tiktok.com/@ana/photo/1", valeur: "https://www.tiktok.com/@ana/photo/1", compteur: 1, contestation: false, ...o,
  };
}

const LISTE: CasNeedsYou[] = [
  cas({ cle: "lien:pa1" }),
  cas({ cle: "lien:pa2", nom: "Bob", cohorte: "2026-11-02", ref: "pa2" }),
  cas({ cle: "compte:c1", type: "compte_introuvable", nom: "Cid", vu: "@cid_wrong", actions: ["corriger_handle", "ignorer"], ref: "c1", valeur: "cid_wrong", lien: null, urgence: "lundi", rang: 1 }),
  cas({ cle: "faq:abc", categorie: "pas_pu_repondre", type: "question_faq", nom: "Dee", vu: "How do I get paid?", actions: ["repondre", "ignorer"], ref: "q1,q2", valeur: null, compteur: 2, urgence: "rien", rang: 4, lien: "/admin/auto/faq" }),
];

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PageNeedsYou />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Needs you (prompt 21, U)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    vi.clearAllMocks();
    api.lireNeedsYou.mockResolvedValue(LISTE);
  });

  it("tri : ce qui bloque lundi d'abord, puis la paie, puis le plus ancien ; filtre par cohorte", () => {
    expect(trier(LISTE).map((c) => c.cle)).toEqual(["compte:c1", "lien:pa1", "lien:pa2", "faq:abc"]);
    expect(filtrer(LISTE, { ...FILTRES_VIDES, cohorte: "2026-11-02" }).map((c) => c.cle)).toEqual(["lien:pa2"]);
    expect(filtrer(LISTE, { ...FILTRES_VIDES, recherche: "bob" }).map((c) => c.cle)).toEqual(["lien:pa2"]);
  });

  it("un lien introuvable apparaît dans « Pas sûr », filtrable par cohorte", async () => {
    rendu();
    await screen.findByText("Bob");
    fireEvent.click(screen.getByRole("button", { name: /Pas sûr/ }));
    expect(document.querySelectorAll('[data-type="lien_introuvable"]')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Cohorte"), { target: { value: "2026-11-02" } });
    expect(document.querySelectorAll('[data-type="lien_introuvable"]')).toHaveLength(1);
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("« Count this post » compte le lien", async () => {
    rendu();
    await screen.findByText("Bob");
    const ligne = document.querySelector('[data-cas="lien:pa1"]') as HTMLElement;
    fireEvent.click(within(ligne).getByRole("button", { name: "Count this post" }));
    await waitFor(() => expect(api.agirNeedsYou).toHaveBeenCalledWith("lien:pa1", "compter", null));
  });

  it("un handle corrigé est enregistré puis relevé tout de suite", async () => {
    rendu();
    await screen.findByText("Cid");
    const ligne = document.querySelector('[data-cas="compte:c1"]') as HTMLElement;
    fireEvent.change(within(ligne).getByLabelText("Corriger le handle"), { target: { value: "cid_ok" } });
    fireEvent.click(within(ligne).getByRole("button", { name: "Corriger le handle" }));
    await waitFor(() => expect(api.agirNeedsYou).toHaveBeenCalledWith("compte:c1", "corriger_handle", "cid_ok"));
    await waitFor(() => expect(api.releverCompte).toHaveBeenCalledWith("c1"));
  });

  it("une question hors FAQ apparaît une seule fois, avec son compteur ; la réponse part aux deux", async () => {
    rendu();
    await screen.findByText("Dee");
    expect(document.querySelectorAll('[data-type="question_faq"]')).toHaveLength(1);
    const ligne = document.querySelector('[data-cas="faq:abc"]') as HTMLElement;
    expect(within(ligne).getByText("×2")).toBeInTheDocument();
    fireEvent.change(within(ligne).getByLabelText("Répondre et ajouter à la FAQ"), { target: { value: "Every Monday." } });
    fireEvent.click(within(ligne).getByRole("button", { name: "Répondre et ajouter à la FAQ" }));
    await waitFor(() => expect(api.repondreQuestions).toHaveBeenCalledWith(["q1", "q2"], "Every Monday."));
  });
});

describe("Needs you depuis Overview (prompt 22, partie 3)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    vi.clearAllMocks();
    api.lireNeedsYou.mockResolvedValue(LISTE);
  });

  function renduDepuis(depart: string, el: React.ReactElement) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[depart]}>{el}</MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("un compteur d'Overview arrive déjà filtré sur son type (?type=…) ; ✕ retire le filtre", async () => {
    renduDepuis("/admin/auto/needs-you?type=compte_introuvable,question_faq", <PageNeedsYou />);
    await screen.findByText("Cid");
    expect([...document.querySelectorAll("[data-cas]")].map((x) => x.getAttribute("data-cas")).sort()).toEqual(["compte:c1", "faq:abc"]);
    fireEvent.click(screen.getByTestId("filtre-type"));
    await waitFor(() => expect(document.querySelectorAll("[data-cas]")).toHaveLength(4));
  });

  it("le résumé d'Overview : chaque ligne a « Régler », qui mène à Needs you filtré sur son type", async () => {
    renduDepuis("/admin/auto", <ResumeNeedsYou />);
    const fix = await waitFor(() => {
      const x = document.querySelector('[data-fix="compte:c1"]');
      if (!x) throw new Error("pas encore");
      return x;
    });
    expect(fix.textContent).toBe("Régler");
    expect(fix.getAttribute("href")).toBe("/admin/auto/needs-you?type=compte_introuvable");
    expect(document.querySelectorAll("[data-fix]")).toHaveLength(4);
  });
});

describe("31/10 : Needs you, moins de bruit", () => {
  it("compteur par personne d'après le type ; questions des HM à part", async () => {
    const { parPersonne, personneDe, estQuestionHm } = await import("./logique");
    expect(personneDe("samedi_non_valide")).toBe("lucia");
    expect(personneDe("question_hm")).toBe("lucia");
    expect(personneDe("jeton_upwork")).toBe("max");
    expect(personneDe("type_inconnu")).toBe("max");
    expect(parPersonne([{ type: "retirer_slack" }, { type: "doublon" }, { type: "message_pas_parti" }])).toEqual({ lucia: 1, max: 2 });
    expect(estQuestionHm({ type: "question_hm" })).toBe(true);
    expect(estQuestionHm({ type: "question_faq" })).toBe(false);
  });
});
