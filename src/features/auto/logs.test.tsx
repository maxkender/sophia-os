/**
 * Prompt 22, parties 10 et 12 : Logs. Une ligne par action, filtres par type,
 * posteur et date, export CSV ; le compteur correspond aux lignes affichées ;
 * une action bloquée par le grand interrupteur se lit « paused ».
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

import type { LigneJournal } from "./api";
import { filtrerActions, versCsv } from "./logique";

const api = vi.hoisted(() => ({ lireJournal: vi.fn() }));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));

import { PageLogs } from "./PageLogs";

const ligne = (o: Partial<LigneJournal>): LigneJournal => ({
  at: "2026-10-29T09:00:00Z", source: "message", action: "connexion", auteur: "OS", poster_id: "p1", poster_nom: "Ana Silva",
  canal: "upwork", resultat: "envoye", detail: "Hi Ana", ...o,
});

const LIGNES: LigneJournal[] = [
  ligne({}),
  ligne({ at: "2026-10-29T08:00:00Z", source: "pause", action: "recrues-check · relance", canal: null, resultat: "paused", detail: null }),
  ligne({ at: "2026-10-29T07:00:00Z", action: "jeudi", poster_id: "p2", poster_nom: "Bob Lee", canal: "slack" }),
  ligne({ at: "2026-10-28T07:00:00Z", source: "reglage", action: "automation_pause", auteur: "Max Kender", poster_id: null, poster_nom: null, canal: null, resultat: "modifie", detail: "true" }),
];

function rendu(depart = "/admin/auto/logs") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[depart]}>
        <PageLogs />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const lignesAffichees = () => document.querySelectorAll('[data-testid="logs-table"] tbody tr').length;
const attendre = () => vi.waitFor(() => expect(lignesAffichees()).toBeGreaterThan(0));

describe("Logs (prompt 22, partie 10)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    api.lireJournal.mockResolvedValue(LIGNES);
  });

  it("une ligne par action (heure, auteur, posteur, action, canal, résultat) ; le compteur = les lignes affichées", async () => {
    rendu();
    await attendre();
    expect(lignesAffichees()).toBe(4);
    expect(screen.getByTestId("logs-compteur").textContent).toBe(`${lignesAffichees()} lines`);
    expect(screen.getByText("Max Kender")).toBeTruthy();
  });

  it("grand interrupteur activé : l'action bloquée se lit « paused »", async () => {
    rendu();
    await attendre();
    const paused = document.querySelector('[data-source="pause"] [data-resultat="paused"]');
    expect(paused?.textContent).toBe("paused");
  });

  it("filtres par type, posteur et date : relus côté serveur", async () => {
    rendu();
    await attendre();
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "pause" } });
    await vi.waitFor(() => expect(api.lireJournal).toHaveBeenLastCalledWith(expect.objectContaining({ source: "pause" })));
    fireEvent.change(screen.getByLabelText("Poster"), { target: { value: "p2" } });
    await vi.waitFor(() => expect(api.lireJournal).toHaveBeenLastCalledWith(expect.objectContaining({ source: "pause", poster: "p2" })));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-20" } });
    await vi.waitFor(() => expect(api.lireJournal).toHaveBeenLastCalledWith(expect.objectContaining({ du: "2026-10-20" })));
  });

  it("depuis Overview → Today : type, dates et action déjà filtrés ; le compteur suit", async () => {
    rendu("/admin/auto/logs?source=message&du=2026-10-29&au=2026-10-29&action=jeudi");
    await attendre();
    expect(api.lireJournal).toHaveBeenCalledWith({ du: "2026-10-29", au: "2026-10-29", source: "message", poster: "" });
    expect(lignesAffichees()).toBe(1);
    expect(screen.getByTestId("logs-compteur").textContent).toBe("1 line");
    fireEvent.click(screen.getByTestId("filtre-action"));
    await vi.waitFor(() => expect(lignesAffichees()).toBe(4));
    expect(screen.getByTestId("logs-compteur").textContent).toBe("4 lines");
  });

  it("export CSV : une ligne d'en-tête, puis une par action, guillemets doublés", () => {
    const csv = versCsv([ligne({ detail: 'Hi "Ana", welcome' })]).split("\n");
    expect(csv[0]).toBe("at,source,action,auteur,poster_nom,canal,resultat,detail");
    expect(csv[1]).toBe('2026-10-29T09:00:00Z,message,connexion,OS,Ana Silva,upwork,envoye,"Hi ""Ana"", welcome"');
    expect(filtrerActions(LIGNES, "jeudi,connexion")).toHaveLength(2);
    expect(filtrerActions(LIGNES, "")).toHaveLength(4);
  });
});
