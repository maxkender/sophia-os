import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import { resumerLabel } from "./detailLabel";

const api = vi.hoisted(() => ({
  lireDetailLabel: vi.fn(),
  ecrireEtatManuelLabel: vi.fn(async () => undefined),
  reaffecterLabelFerme: vi.fn(),
  reaffecterLabelFermeEnEntier: vi.fn(),
  ordre: [] as string[],
}));
vi.mock("./detailLabel", async (orig) => ({ ...(await orig<typeof import("./detailLabel")>()), lireDetailLabel: api.lireDetailLabel }));
vi.mock("@/features/moteur/repartition/apiRepartition", () => ({
  ecrireEtatManuelLabel: (a: { applicationId: string }) => { api.ordre.push(`ferme:${a.applicationId}`); return api.ecrireEtatManuelLabel(); },
  reaffecterLabelFerme: (...a: unknown[]) => api.reaffecterLabelFerme(...a),
  reaffecterLabelFermeEnEntier: (...a: unknown[]) => { api.ordre.push("reaffecte"); return api.reaffecterLabelFermeEnEntier(...a); },
}));

import { DetailLabel } from "./DetailLabel";

const c = (id: string, classement: "star" | "passable") => ({ id, handle: id, langue: "fr", pays: "FR", classement, created_at: null, warmup_ends_at: null, posteur: "Ana S" });
const p = (compte_id: string, vues: number) => ({ compte_id, vues, publie_at: "2026-11-10T10:00:00Z", publie_url: null });
const apercu = { dryRun: true, deplaces: [{ compte_id: "a", handle: "ana.run", langue: "fr", de: ["x"], vers: "clean_girl_run", meme_theme: true }], retires: [], manuels: [], reportes: 0, erreurs: [] };

function rendre(apps = ["app-atala"]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><DetailLabel labelId="L1" nom="classic_girl_run" applicationIds={apps} /></QueryClientProvider>);
}

describe("DetailLabel", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    api.ordre = [];
    await i18n.changeLanguage("en");
    api.lireDetailLabel.mockResolvedValue(resumerLabel([c("ana.run", "star"), c("lea.run", "passable")], [p("ana.run", 45_000), p("lea.run", 700)], new Date("2026-11-20T12:00:00Z")));
    api.reaffecterLabelFerme.mockResolvedValue(apercu);
    api.reaffecterLabelFermeEnEntier.mockResolvedValue({ ...apercu, dryRun: false });
  });

  it("la performance, les comptes et ceux qui ont percé", async () => {
    rendre();
    expect((await screen.findByTestId("detail-perces")).textContent).toContain("1 / 2");
    expect(screen.getByTestId("detail-mediane").textContent).toContain("22,850");
    expect(screen.getByTestId("detail-compte-ana.run").textContent).toContain("Broke through (1)");
    expect(screen.getByTestId("detail-compte-lea.run").textContent).toContain("Not yet");
    expect(screen.getByTestId("detail-cases").textContent).toBe("1 STAR · 1 OK");
  });

  it("« Stop the label » : les propositions d'abord, rien n'est écrit ; valider ferme le label puis déplace les comptes", async () => {
    rendre(["app-atala", "app-sophia"]);
    fireEvent.click(await screen.findByTestId("arreter-label"));
    expect(await screen.findByText("clean_girl_run")).toBeInTheDocument();
    expect(api.reaffecterLabelFerme).toHaveBeenCalledWith("L1", true);
    expect(api.ordre).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Validate: stop the label and reassign 1 account(s)" }));
    await waitFor(() => expect(api.reaffecterLabelFermeEnEntier).toHaveBeenCalledWith("L1"));
    expect(api.ordre).toEqual(["ferme:app-atala", "ferme:app-sophia", "reaffecte"]);
  });

  it("« Later » : rien n'est fermé ni déplacé ; un label sans application ne s'arrête pas d'ici", async () => {
    const a = rendre();
    fireEvent.click(await screen.findByTestId("arreter-label"));
    await screen.findByText("clean_girl_run");
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(api.ordre).toEqual([]);
    expect(screen.getByTestId("arreter-label")).toBeInTheDocument();
    a.unmount();
    rendre([]);
    expect(await screen.findByTestId("arreter-label")).toBeDisabled();
  });
});
