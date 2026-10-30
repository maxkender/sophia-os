import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import i18n from "@/locales";

import { contratDuLien, conversationDe } from "./conversation";
import { LienConversation } from "./LienConversation";

describe("0469 : le lien de la conversation Upwork", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("fr");
  });

  it("room connue : « Open Upwork conversation » vers la room, le contrat à côté, nouvel onglet", () => {
    render(<LienConversation c={{ contrat_id: "44801168", room_id: "room_abc" }} />);
    const conv = screen.getByRole("link", { name: /Open Upwork conversation/ });
    expect(conv).toHaveAttribute("href", "https://www.upwork.com/ab/messages/rooms/room_abc");
    expect(conv).toHaveAttribute("target", "_blank");
    const contrat = screen.getByRole("link", { name: /Contract 44801168/ });
    expect(contrat).toHaveAttribute("href", "https://www.upwork.com/nx/wm/workroom/44801168/overview");
    expect(contrat).toHaveAttribute("target", "_blank");
  });

  it("room pas encore connue : « No conversation yet », le contrat reste ; pas de contrat : « No Upwork contract »", () => {
    const { rerender } = render(<LienConversation c={{ contrat_id: "44801168", room_id: null }} />);
    expect(screen.getByText("No conversation yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Contract 44801168/ })).toBeInTheDocument();
    rerender(<LienConversation c={{ contrat_id: null, room_id: null }} />);
    expect(screen.getByText("No Upwork contract")).toBeInTheDocument();
  });

  it("le contrat d'un lien de carte, et la conversation par posteur puis par contrat", () => {
    expect(contratDuLien("https://www.upwork.com/nx/wm/workroom/44801168/overview")).toBe("44801168");
    expect(contratDuLien("/admin/auto/payroll")).toBeNull();
    const conv = {
      dePosteur: new Map([["p1", { contrat_id: "c1", room_id: null }]]),
      deContrat: new Map([["c1", { contrat_id: "c1", room_id: "r1" }]]),
    };
    expect(conversationDe(conv, { posteur: "p1" })).toEqual({ contrat_id: "c1", room_id: "r1" });
    expect(conversationDe(conv, { contrat: "c9" })).toEqual({ contrat_id: "c9", room_id: null });
  });
});
