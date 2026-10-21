import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lireChoixApplicationAuto = vi.fn();

vi.mock("./apiRepartition", () => ({
  CLE_CHOIX_APPLICATION_AUTO: "choix_application_auto",
  lireChoixApplicationAuto: () => lireChoixApplicationAuto(),
}));

const listerApplicationsMulti = vi.fn();
const listerLiensLabels = vi.fn();
const listerLabels = vi.fn();

vi.mock("../apiMultiApp", () => ({
  listerApplicationsMulti: () => listerApplicationsMulti(),
  listerLiensLabels: () => listerLiensLabels(),
}));
vi.mock("../api", () => ({ listerLabels: () => listerLabels() }));

import { useChoixApplicationsCreation } from "./useChoixApplicationsCreation";

/** Deux applications actives : sans la bascule, le recruteur DOIT cocher. */
const APPS = [
  { id: "id-sophia", slug: "sophia", nom: "Sophia", actif: true, langues: null },
  { id: "id-unswipe", slug: "unswipe", nom: "Unswipe", actif: true, langues: ["fr"] },
];

function enveloppe() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("la bascule efface le choix d'application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listerApplicationsMulti.mockResolvedValue(APPS);
    listerLiensLabels.mockResolvedValue([]);
    listerLabels.mockResolvedValue([]);
  });

  it("interrupteur éteint : le choix est exigé, comme avant", async () => {
    lireChoixApplicationAuto.mockResolvedValue(false);
    const { result } = renderHook(() => useChoixApplicationsCreation(true, "fr"), {
      wrapper: enveloppe(),
    });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.manquant).toBe(true);
    expect(result.current.verifier()).toBe(false);
  });

  it("interrupteur allumé : rien à cocher, et le corps envoyé est celui d'avant", async () => {
    // C'est tout le point de la bascule côté front. On réutilise le chemin
    // « inactif » qui existe déjà : aucune lecture, options vides, jamais
    // bloquant. Le serveur reçoit donc un corps sans parts_applications et
    // c'est lui qui décide.
    lireChoixApplicationAuto.mockResolvedValue(true);
    const { result } = renderHook(() => useChoixApplicationsCreation(true, "fr"), {
      wrapper: enveloppe(),
    });
    await waitFor(() => expect(result.current.actif).toBe(false));
    expect(result.current.visible).toBe(false);
    expect(result.current.options).toEqual({});
    expect(result.current.manquant).toBe(false);
    expect(result.current.bloque).toBe(false);
    expect(result.current.verifier()).toBe(true);
  });

  it("réglage illisible : la case RESTE, on ne bascule pas sur un doute", async () => {
    // Une lecture ratée ne doit pas faire disparaître le choix : sinon le
    // front enverrait un corps vide pendant que le serveur, lui, est encore
    // éteint, et tous les comptes partiraient sur Sophia sans que personne
    // l'ait décidé.
    lireChoixApplicationAuto.mockRejectedValue(new Error("réseau"));
    const { result } = renderHook(() => useChoixApplicationsCreation(true, "fr"), {
      wrapper: enveloppe(),
    });
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.actif).toBe(true);
  });

  it("formulaire fermé : on ne lit même pas le réglage", async () => {
    lireChoixApplicationAuto.mockResolvedValue(true);
    const { result } = renderHook(() => useChoixApplicationsCreation(false, "fr"), {
      wrapper: enveloppe(),
    });
    await waitFor(() => expect(result.current.visible).toBe(false));
    expect(lireChoixApplicationAuto).not.toHaveBeenCalled();
    expect(result.current.options).toEqual({});
  });
});
