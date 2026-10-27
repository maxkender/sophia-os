import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

/** v3 point 8 : le dashboard HM montre, il ne contrôle ni ne valide. */

const auth = vi.hoisted(() => ({ role: "hiring_manager" }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));
const api = vi.hoisted(() => ({ listerDecisionsHm: vi.fn(), listerRecrutementHm: vi.fn() }));
vi.mock("./api", () => api);
vi.mock("@/features/moteur/api", () => ({ activerPoster: vi.fn(), supprimerPoster: vi.fn() }));
vi.mock("./cohorte/reporter", () => ({ reporterCompte: vi.fn() }));

import { ActionsPosteur } from "./cohorte/ActionsPosteur";
import { SectionsSamediHm } from "./SectionsSamediHm";

function rendu(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const props = { posteurId: "p", nom: "Ana", compteId: "c", warmupLance: false, aPublie: false };

describe("dashboard HM allégé", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("fr");
  });

  it("une HM ou un DM ne voit pas le menu Reporter / Désactiver", () => {
    for (const role of ["hiring_manager", "directing_manager"]) {
      auth.role = role;
      const { container, unmount } = rendu(<ActionsPosteur {...props} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("l'admin et le Head of Ops gardent le menu", () => {
    for (const role of ["admin", "head_of_ops"]) {
      auth.role = role;
      const { container, unmount } = rendu(<ActionsPosteur {...props} />);
      expect(container).not.toBeEmptyDOMElement();
      unmount();
    }
  });

  it("décisions du samedi : information seulement, plus de bouton « Fait »", async () => {
    api.listerDecisionsHm.mockResolvedValue([
      { id: "d1", jour: "2026-10-24", decision: "doubler", compte_id: "c", poster_id: "p", handle: "ana.tt", pays: "FR",
        nouveau_handle: null, note: null, envoye_at: "2026-10-25T10:00:00Z", fait_at: null, fait_par: null, diagnostic: null },
      { id: "d2", jour: "2026-10-24", decision: "ne_pas_renouveler", compte_id: "c2", poster_id: "p2", handle: "bo.tt", pays: "FR",
        nouveau_handle: null, note: null, envoye_at: "2026-10-25T10:00:00Z", fait_at: "2026-10-25T12:00:00Z", fait_par: null, diagnostic: null },
    ]);
    api.listerRecrutementHm.mockResolvedValue([]);
    rendu(<SectionsSamediHm />);
    expect(await screen.findByTestId("decision-hm-ana.tt")).toHaveTextContent("2ᵉ compte proposé au posteur");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("decision-hm-bo.tt")).toHaveTextContent("Fait");
  });
});
