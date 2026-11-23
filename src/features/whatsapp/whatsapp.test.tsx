import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  lireBanniereWhatsApp: vi.fn(),
  lireMonWhatsApp: vi.fn(),
  enregistrerMonWhatsApp: vi.fn(),
  lireStatsWhatsApp: vi.fn(),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));
const auth = vi.hoisted(() => ({ roleReel: "poster" as string }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

import { canalDefaut, whatsappPossible } from "@/features/support/conversation";

import { banniereActive, numeroInternational, pourcent } from "./api";
import { BanniereWhatsApp, PHRASE_ACCORD_WHATSAPP } from "./BanniereWhatsApp";
import { CarteWhatsApp } from "./CarteWhatsApp";

function rendu(element: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{element}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.roleReel = "poster";
  try {
    window.sessionStorage.clear();
  } catch {
    // rien
  }
});

describe("WhatsApp : logique", () => {
  it("réglage, numéro, pourcentage", () => {
    expect(banniereActive(false)).toBe(false);
    expect(banniereActive(null)).toBe(false);
    expect(banniereActive(true)).toBe(true);
    expect(banniereActive({ actif: true })).toBe(true);
    expect(numeroInternational("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(numeroInternational("0033612345678")).toBe("+33612345678");
    expect(numeroInternational("0612345678")).toBeNull();
    expect(pourcent(1, 3)).toBe(33);
    expect(pourcent(1, 0)).toBe(0);
  });

  it("support : WhatsApp par défaut pour une demande WhatsApp, proposé seulement s'il y a un échange WhatsApp", () => {
    expect(canalDefaut("whatsapp")).toBe("whatsapp");
    expect(canalDefaut("upwork")).toBe("upwork");
    expect(whatsappPossible("whatsapp", [])).toBe(true);
    expect(whatsappPossible("email", [])).toBe(false);
    expect(whatsappPossible(null, [{ at: "2026-11-22T10:00:00Z", sens: "in", canal: "whatsapp", qui: "posteur", texte: "hi", type: "message" }])).toBe(true);
  });
});

describe("Bannière WhatsApp (dashboard posteur)", () => {
  it("réglage éteint : rien n'apparaît", async () => {
    api.lireBanniereWhatsApp.mockResolvedValue(false);
    rendu(<BanniereWhatsApp />);
    await waitFor(() => expect(api.lireBanniereWhatsApp).toHaveBeenCalled());
    expect(screen.queryByTestId("banniere-whatsapp")).toBeNull();
    expect(api.lireMonWhatsApp).not.toHaveBeenCalled();
  });

  it("admin qui traverse l'espace : rien", () => {
    auth.roleReel = "admin";
    api.lireBanniereWhatsApp.mockResolvedValue(true);
    rendu(<BanniereWhatsApp />);
    expect(screen.queryByTestId("banniere-whatsapp")).toBeNull();
    expect(api.lireBanniereWhatsApp).not.toHaveBeenCalled();
  });

  it("réglage allumé : case décochée, accord obligatoire, puis whatsapp_mon_numero", async () => {
    api.lireBanniereWhatsApp.mockResolvedValue(true);
    api.lireMonWhatsApp.mockResolvedValue(null);
    api.enregistrerMonWhatsApp.mockResolvedValue({ whatsapp_e164: "+33612345678", whatsapp_optin_at: "2026-11-22T10:00:00Z", whatsapp_optout_at: null });
    rendu(<BanniereWhatsApp />);
    const b = await screen.findByTestId("banniere-whatsapp");
    expect(b).toHaveTextContent(PHRASE_ACCORD_WHATSAPP);
    const case_ = screen.getByTestId("accord-whatsapp") as HTMLInputElement;
    expect(case_.checked).toBe(false);
    fireEvent.change(screen.getByLabelText("WhatsApp number (international format)"), { target: { value: "+33 6 12 34 56 78" } });
    const bouton = screen.getByRole("button", { name: "Save" });
    expect(bouton).toBeDisabled();
    fireEvent.click(case_);
    fireEvent.click(bouton);
    await waitFor(() => expect(api.enregistrerMonWhatsApp).toHaveBeenCalledWith("+33612345678", true));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  });

  it("accord déjà donné : rien", async () => {
    api.lireBanniereWhatsApp.mockResolvedValue(true);
    api.lireMonWhatsApp.mockResolvedValue({ whatsapp_e164: "+33612345678", whatsapp_optin_at: "2026-11-22T10:00:00Z", whatsapp_optout_at: null });
    rendu(<BanniereWhatsApp />);
    await waitFor(() => expect(api.lireMonWhatsApp).toHaveBeenCalled());
    expect(screen.queryByTestId("banniere-whatsapp")).toBeNull();
  });
});

describe("Carte WhatsApp (admin)", () => {
  it("couverture, envois, réponses, coût", async () => {
    api.lireStatsWhatsApp.mockResolvedValue({
      mode: "test", depuis: "2026-11-16", posteurs: 40, avec_accord: 10, envoyes: 8, livres: 7, lus: 5, echecs: 1, bloques: 2,
      avec_reponse: 2, cout_estime: 0.24,
    });
    rendu(<CarteWhatsApp />);
    expect(await screen.findByTestId("wa-accord")).toHaveTextContent("25 %");
    expect(screen.getByTestId("wa-envois")).toHaveTextContent("8 · 7 · 5");
    expect(screen.getByTestId("wa-reponses")).toHaveTextContent("2 (25 %)");
    expect(screen.getByTestId("wa-cout")).toHaveTextContent("0,24 $");
  });
});
