import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BlocParrainer, COMMENT_CA_MARCHE } from "./BlocParrainer";

describe("9/11 : Refer a friend", () => {
  it("« How it works » toujours visible, même sans ami invité", () => {
    render(<BlocParrainer pays={[]} filleuls={[]} ceMois={0} envoyer={async () => ({ attente: false })} />);
    const bloc = screen.getByTestId("parrainer-comment");
    expect(bloc).toHaveTextContent("How it works");
    for (const l of COMMENT_CA_MARCHE) expect(bloc).toHaveTextContent(l);
    expect(bloc).toHaveTextContent("invited → applied → accepted → started → bonus paid");
    expect(screen.queryByText(/12 posts/)).toBeNull();
  });

  it("le statut de chaque ami : invited, applied, accepted, started, bonus paid", () => {
    const filleuls = (["envoye", "postule", "accepte", "actif", "bonus_paye"] as const).map((statut, i) => ({
      id: String(i), prenom: `Ami${i}`, pays: "Greece", statut, cree_at: "",
    }));
    render(<BlocParrainer pays={[]} filleuls={filleuls} ceMois={5} envoyer={async () => ({ attente: false })} />);
    const liste = screen.getByTestId("mes-filleuls");
    for (const t of ["Invited", "Applied", "Accepted", "Started", "Bonus paid"]) expect(liste).toHaveTextContent(t);
  });
});
