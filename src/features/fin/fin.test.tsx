import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ lireMaFin: vi.fn(), lireMesBandeaux: vi.fn(), marquerBandeauVu: vi.fn() }));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...api }));
vi.mock("@/features/support/PageHelp", () => ({ PageHelp: () => <p>page help</p> }));
vi.mock("@/features/auth/api", () => ({ signOut: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ roleReel: "poster" }) }));

import { decouper } from "./api";
import { Bandeau } from "./BandeauCompteArrete";
import { CompteInactif } from "./FinCollaboration";

const TEXTE = [
  "Your collaboration with Vik Studios ended on 21 Nov.",
  "Reason: Posts were missing.",
  "Payment: 14 $ for the week of 16 Nov, paid on Monday 23 Nov via Upwork.",
  "You no longer need to post. Thank you for your work.",
].join("\n");

function rendu(ui: React.ReactNode, chemin = "/calendrier") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[chemin]}>{ui}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe("fin de collaboration (kills, partie 2)", () => {
  it("découpe le texte : titre, raison et paiement, remerciement", () => {
    expect(decouper(TEXTE)).toEqual({ titre: TEXTE.split("\n")[0], lignes: TEXTE.split("\n").slice(1, 3), fin: TEXTE.split("\n")[3] });
  });

  it("kill : la page de fin à la place du dashboard, avec Help et la déconnexion (pas « en attente »)", async () => {
    api.lireMaFin.mockResolvedValue({ cas: "kill", le: "2026-11-21", texte: TEXTE });
    rendu(<CompteInactif attente={<p>en attente</p>} />);
    expect(await screen.findByText("Your collaboration with Vik Studios ended on 21 Nov.")).toBeInTheDocument();
    expect(screen.getByText("Posts were missing.")).toBeInTheDocument();
    expect(screen.getByText(/paid on Monday 23 Nov via Upwork/)).toBeInTheDocument();
    expect(screen.queryByText("en attente")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /help/i })).toBeInTheDocument();
  });

  it("nouveau compte pas encore activé : l'écran « en attente » reste", async () => {
    api.lireMaFin.mockResolvedValue(null);
    rendu(<CompteInactif attente={<p>en attente</p>} />);
    expect(await screen.findByText("en attente")).toBeInTheDocument();
  });

  it("Help reste ouvert après la fin, seul", async () => {
    api.lireMaFin.mockResolvedValue({ cas: "demande", le: "2026-11-18", texte: null });
    rendu(<CompteInactif attente={<p>en attente</p>} />, "/createur/help");
    expect(await screen.findByText("page help")).toBeInTheDocument();
  });
});

describe("bandeau « un de vos comptes a été désactivé » (kills, partie 1)", () => {
  it("affiche le texte et disparaît au clic « Got it »", async () => {
    api.marquerBandeauVu.mockResolvedValue(undefined);
    rendu(<Bandeau b={{ cle: "compte_arrete:c1", texte: "One of your accounts (@run.anna) was deactivated on 21 Nov because posts were missing." }} />);
    expect(screen.getByTestId("bandeau-compte-arrete")).toHaveTextContent("@run.anna");
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(api.marquerBandeauVu).toHaveBeenCalledWith("compte_arrete:c1"));
  });

  it("19/11 : la relance Ruul (email pas arrivé) : bandeau orange, « Got it » le ferme", async () => {
    api.marquerBandeauVu.mockResolvedValue(undefined);
    rendu(<Bandeau b={{ cle: "relance_ruul:2026-11-19", texte: "To get paid on Monday, you need to finish your Ruul setup." }} />);
    expect(screen.getByTestId("bandeau-relance-ruul")).toHaveTextContent("finish your Ruul setup");
    expect(screen.queryByTestId("bandeau-compte-arrete")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(api.marquerBandeauVu).toHaveBeenCalledWith("relance_ruul:2026-11-19"));
  });

  it("19/11 : le bandeau du 2e compte (vert) : compte, label, démarrage lundi, gain en plus", async () => {
    api.marquerBandeauVu.mockResolvedValue(undefined);
    const texte = "Good news: @leevi.voima242 is doing great, so you get a 2nd TikTok account in the \"classic_study\" style. It starts posting on Monday 23 Nov. From that week you are paid for 2 accounts: +10 $ per week (20 $ per week in total).";
    rendu(<Bandeau b={{ cle: "compte_double:c2", texte }} />);
    const b = screen.getByTestId("bandeau-compte-double");
    expect(b).toHaveTextContent("classic_study");
    expect(b).toHaveTextContent("Monday 23 Nov");
    expect(b).toHaveTextContent("+10 $ per week");
    expect(screen.queryByTestId("bandeau-compte-arrete")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(api.marquerBandeauVu).toHaveBeenCalledWith("compte_double:c2"));
  });
});
