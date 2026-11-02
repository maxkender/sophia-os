import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import i18n from "@/locales";

import { CelluleAway, CelluleContexte } from "./ColonnesContexte";
import type { ContextePosteur } from "./contexte";

const base = (o: Partial<ContextePosteur> = {}): ContextePosteur => ({
  poster_id: "p1", dernier_recu: null, dernier_envoye: null, repondu: false, derniere_connexion: null, dernier_post_at: null,
  arrivee: "2026-10-12T10:00:00Z", badges: null, absence: null, absences_30j: 0, upwork_lu_at: null, ...o,
});
const MAINTENANT = new Date("2026-10-31T10:00:00Z");
const ligne = (children: React.ReactNode) => render(<table><tbody><tr>{children}</tr></tbody></table>);

describe("prompt 27 : les colonnes Context et Away de la masterlist", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("son dernier message (canal, il y a X j, lien), le nôtre et « Replied », sa connexion et son dernier post", () => {
    ligne(
      <CelluleContexte
        maintenant={MAINTENANT}
        c={base({
          dernier_recu: { canal: "upwork", at: "2026-10-28T09:00:00Z", texte: "I was sick, sorry, I'll post tomorrow", lien: "https://www.upwork.com/ab/messages/rooms/room_1" },
          dernier_envoye: { canal: "slack+upwork", at: "2026-10-27T15:00:00Z", texte: "Reminder", lien: null },
          repondu: true,
          derniere_connexion: "2026-10-29T08:00:00Z",
          badges: ["absent"],
        })}
      />,
    );
    expect(screen.getByText("I was sick, sorry, I'll post tomorrow")).toBeInTheDocument();
    expect(screen.getByText(/3 d ago/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "https://www.upwork.com/ab/messages/rooms/room_1");
    expect(screen.getByText("Replied")).toBeInTheDocument();
    expect(screen.getByText("Sick / away")).toBeInTheDocument();
    expect(screen.getByText(/last post: none/)).toBeInTheDocument();
    // 3 lignes au plus, tout au clic.
    const texte = screen.getByText("I was sick, sorry, I'll post tomorrow");
    expect(texte.className).toContain("line-clamp-3");
    fireEvent.click(texte);
    expect(texte.className).not.toContain("line-clamp-3");
  });

  it("jamais écrit : « No message from them since {arrivée} » ; pas d'absence : Away vide", () => {
    ligne(<><CelluleContexte maintenant={MAINTENANT} c={base()} /><CelluleAway c={base()} /></>);
    expect(screen.getByTestId("aucun-message")).toHaveTextContent("No message from them since Oct 12");
    expect(screen.getByTestId("cellule-away")).toBeEmptyDOMElement();
  });

  it("Away : les dates, la raison, la déclaration et le nombre d'absences en 30 j", () => {
    ligne(<CelluleAway c={base({
      absence: { debut: "2026-10-27", fin: "2026-10-29", jours: 3, raison: "family", declare_at: "2026-10-26T18:00:00Z", retour: false },
      absences_30j: 2,
    })} />);
    expect(screen.getByTestId("absence")).toHaveTextContent("Away Oct 27 → Oct 29 · family · declared Oct 26");
    expect(screen.getByText("2 absences declared in 30 d")).toBeInTheDocument();
  });
});
