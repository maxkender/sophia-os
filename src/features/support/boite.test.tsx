import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const a = vi.hoisted(() => ({ lireToutes: vi.fn() }));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), ...a }));
const p = vi.hoisted(() => ({ lireProblemes: vi.fn() }));
vi.mock("@/features/problemes/api", async (orig) => ({ ...(await orig<typeof import("@/features/problemes/api")>()), ...p }));
const b = vi.hoisted(() => ({ enregistrerConsigne: vi.fn() }));
vi.mock("@/features/bot/api", async (orig) => ({ ...(await orig<typeof import("@/features/bot/api")>()), ...b }));
vi.mock("./Conversation", () => ({ ConversationPosteur: ({ posterId }: { posterId: string }) => <div data-testid="conversation">{posterId}</div> }));

import type { LigneToutes } from "./api";
import { Boite, filsParPosteur } from "./Boite";

const d = (o: Partial<LigneToutes>): LigneToutes => ({
  id: "d", poster_id: "p1", type: "question", source: "help", categorie: null, plateforme: "upwork", statut: "bot", niveau: "bot", texte: "hello",
  bot_reponse: null, auto_action: null, auto_resultat: null, action_faite: null, ticket_at: null, equipe_at: null, escalade_at: null,
  resolu_par_bot: null, cree_at: "2026-11-13T10:00:00Z", nom: "Ana T.", email: null, ...o,
});

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><Boite /></QueryClientProvider>);
}

describe("Boîte unique (13/11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    b.enregistrerConsigne.mockResolvedValue("c1");
    p.lireProblemes.mockResolvedValue([{ id: "pb", poster_id: "p2", nom: "Leo M.", statut: "ouvert", niveau: "samedi", categorie: "paie", resume: "Paid less", created_at: "2026-11-13T08:00:00Z", maj_at: "2026-11-13T08:00:00Z" }]);
    a.lireToutes.mockResolvedValue([
      d({ id: "d1", poster_id: "p1", nom: "Ana T.", statut: "bot", cree_at: "2026-11-13T12:00:00Z", texte: "what is my @" }),
      d({ id: "d2", poster_id: "p2", nom: "Leo M.", statut: "ouvert", niveau: "max", source: "upwork", cree_at: "2026-11-13T09:00:00Z", texte: "my milestone is wrong" }),
    ]);
  });

  it("logique : par posteur, Max d'abord, point rouge, problèmes rattachés", () => {
    const f = filsParPosteur([
      d({ id: "a", poster_id: "p1", cree_at: "2026-11-13T12:00:00Z" }),
      d({ id: "b", poster_id: "p2", statut: "ouvert", niveau: "max", source: "upwork" }),
      d({ id: "c", poster_id: "p2", statut: "resolu", source: "email", cree_at: "2026-11-12T10:00:00Z" }),
    ], []);
    expect(f.pourMax.map((x) => [x.cle, x.attente, x.sources.join(",")])).toEqual([["p2", true, "upwork,email"]]);
    expect(f.autres.map((x) => [x.cle, x.attente])).toEqual([["p1", false]]);
    expect(f.pourMax[0]!.demande?.id).toBe("b");
  });

  it("écran : Pour Max en haut avec son problème, conversation à droite, apprendre au bot", async () => {
    rendu();
    const fils = await screen.findAllByTestId("fil-posteur");
    expect(fils[0]).toHaveTextContent("Leo M.");
    expect(within(fils[0]!).getByTestId("point-rouge")).toBeTruthy();
    expect(screen.getByTestId("problemes-posteur")).toHaveTextContent("Paid less");
    expect(screen.getByTestId("conversation")).toHaveTextContent("p2");
    fireEvent.click(fils[1]!);
    expect(screen.getByTestId("conversation")).toHaveTextContent("p1");
    fireEvent.click(screen.getByTestId("apprendre"));
    fireEvent.change(screen.getByLabelText("Consigne pour le bot"), { target: { value: "Always give the @ from the dashboard." } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la consigne" }));
    await waitFor(() => expect(b.enregistrerConsigne).toHaveBeenCalledWith(null, "Always give the @ from the dashboard.", true));
  });
});
