import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";
import type { DemandeCm } from "@/features/commentMasters/suivi/api";

const api = vi.hoisted(() => ({
  lireDemandesCm: vi.fn(),
  validerAutre: vi.fn(),
  synchroniserSlack: vi.fn(),
  derniereSynchro: vi.fn(),
  lireReglagesBonus: vi.fn(),
}));
vi.mock("@/features/commentMasters/suivi/api", () => api);
vi.mock("@/features/moteur/cohortes", async (orig) => ({
  ...(await orig<typeof import("@/features/moteur/cohortes")>()),
  aujourdhuiParis: () => "2026-11-10",
}));

import { AdminCommentMastersSuiviPage } from "./AdminCommentMastersSuiviPage";

function d(o: Partial<DemandeCm>): DemandeCm {
  return {
    id: "x",
    langue: "pt-BR",
    region: "Brésil",
    canal: "cm-br",
    slack_channel_id: "C1",
    slack_ts: "1.1",
    publie_url: "https://tiktok.com/x",
    envoye_at: "2026-11-05T10:00:00Z",
    fait_at: "2026-11-05T11:00:00Z",
    fait_par: "daywson",
    fait_source: "bouton",
    fait_mode: "bouton",
    verifie: true,
    cm_profile_id: "day",
    cm_nom: "Daywson Freires",
    cm_slack_connu: true,
    autre_personne: false,
    autre_valide_at: null,
    compte: true,
    ...o,
  };
}

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminCommentMastersSuiviPage />
    </QueryClientProvider>,
  );
}

describe("AdminCommentMastersSuiviPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
    api.lireReglagesBonus.mockResolvedValue({
      parrainage_montant: 10,
      parrainage_semaines_min: 2,
      parrainage_posts_min_semaine: 12,
      comment_master_par_commentaire: 0.5,
      premier_lundi: "2026-11-30",
    });
    api.derniereSynchro.mockResolvedValue(null);
    api.validerAutre.mockResolvedValue(undefined);
    api.lireDemandesCm.mockResolvedValue([
      d({ id: "1" }),
      d({ id: "2", fait_mode: "fil", fait_source: "slack_sync", verifie: false }),
      d({ id: "3", fait_par: "inconnu", autre_personne: true, compte: false, verifie: false }),
      d({ id: "4", fait_at: null, fait_par: null, fait_mode: null, compte: false, verifie: false }),
    ]);
  });

  it("la période en cours par défaut, alignée sur le premier lundi bonus", async () => {
    rendu();
    await screen.findByText("Daywson Freires");
    expect(api.lireDemandesCm).toHaveBeenCalledWith("2026-11-02", "2026-11-29");
  });

  it("une ligne par Comment Master, le total et le bonus prévu (Done × montant des réglages)", async () => {
    rendu();
    const ligne = (await screen.findByText("Daywson Freires")).closest("tr")!;
    const cellules = [...ligne.querySelectorAll("td")].map((c) => c.textContent);
    expect(cellules.slice(2, 6)).toEqual(["4", "2+1", "50 %", "1"]);
    expect(screen.getByText("1 $")).toBeTruthy();
    expect(screen.getByText(/Done par une autre personne, à valider/)).toBeTruthy();
  });

  it("clic : ses demandes ; un Done d'une autre personne se valide", async () => {
    rendu();
    fireEvent.click((await screen.findByText("Daywson Freires")).closest("tr")!);
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getAllByRole("row")).toHaveLength(5);
    expect(within(dialogue).getByText(/réponse dans le fil/)).toBeTruthy();
    fireEvent.click(within(dialogue).getByRole("button", { name: "Valider" }));
    await vi.waitFor(() => expect(api.validerAutre).toHaveBeenCalledWith("3", true));
  });
});
