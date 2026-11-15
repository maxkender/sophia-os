import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const mesRelectures = vi.fn();
const relirePost = vi.fn();

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  mesRelectures: () => mesRelectures(),
  relirePost: (...a: unknown[]) => relirePost(...a),
}));
vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { RelecturesRelecteur } from "./RelecturesRelecteur";

const POST = {
  id: "rp1",
  langue: "de",
  envoye_le: "2026-11-07T08:07:00Z",
  label: "smart_girl",
  slides: [
    { position: 1, texte_overlay: "wie ich in der Schule immer GEPFLEGT wirke", position_sophia: false },
    { position: 2, texte_overlay: "ich dusche jeden Abend", position_sophia: false },
    { position: 3, texte_overlay: "kurze Lektionen auf einer App wie Sophia", position_sophia: true },
  ],
  statut: "a_faire" as const,
  note: null,
  remarque: null,
  slides_corrigees: [],
  fait_le: null,
};

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RelecturesRelecteur langue="de" />
    </QueryClientProvider>,
  );
}

describe("RelecturesRelecteur", () => {
  beforeEach(() => {
    mesRelectures.mockReset();
    relirePost.mockReset();
    relirePost.mockResolvedValue(undefined);
  });

  it("sans post : message d'attente", async () => {
    mesRelectures.mockResolvedValue([]);
    rendre();
    expect(await screen.findByTestId("relectures-vide")).toHaveTextContent(/samedi|saturday/i);
  });

  it("un post à la fois, la slide d'appli marquée ; réécrire une slide suffit avec la note, sans 30 mots", async () => {
    mesRelectures.mockResolvedValue([POST, { ...POST, id: "rp2" }]);
    rendre();
    expect(await screen.findByTestId("relecture-progression")).toHaveTextContent(/Post 1 (sur|of) 2/);
    const slides = within(screen.getByTestId("relecture-slides")).getAllByTestId("relecture-slide");
    expect(slides).toHaveLength(3);
    expect(slides[2].textContent).toMatch(/slide appli|app slide/i);
    const envoyer = screen.getByRole("button", { name: /envoyer ma relecture|send my review/i });
    expect(envoyer).toBeDisabled();

    fireEvent.click(within(slides[0]).getByRole("button", { name: /réécrire la slide 1|rewrite slide 1/i }));
    const zone = within(slides[0]).getByRole("textbox") as HTMLTextAreaElement;
    expect(zone.value).toBe("wie ich in der Schule immer GEPFLEGT wirke");
    fireEvent.change(zone, { target: { value: "wie ich in der Schule immer gepflegt aussehe" } });
    expect(envoyer).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "4/5" }));
    expect(envoyer).toBeEnabled();
    expect(screen.getByTestId("relecture-mots")).toHaveTextContent(/1 slide (réécrite|rewritten)/);

    fireEvent.click(envoyer);
    await waitFor(() =>
      expect(relirePost).toHaveBeenCalledWith("rp1", {
        note: 4,
        remarque: "",
        slides: [{ position: 1, texte: "wie ich in der Schule immer gepflegt aussehe" }],
      }),
    );
  });

  it("sans slide réécrite, il faut la note et 30 mots ; une slide remise à l'original ne compte pas", async () => {
    mesRelectures.mockResolvedValue([POST]);
    rendre();
    const slides = await screen.findAllByTestId("relecture-slide");
    fireEvent.click(within(slides[1]).getByRole("button", { name: /réécrire la slide 2|rewrite slide 2/i }));
    fireEvent.click(within(slides[1]).getByRole("button", { name: /garder l'original|keep the original/i }));
    expect(within(slides[1]).queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "2/5" }));
    const envoyer = screen.getByRole("button", { name: /envoyer ma relecture|send my review/i });
    expect(envoyer).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /ta remarque|your remark/i }), {
      target: { value: Array.from({ length: 30 }, (_, i) => `mot${i}`).join(" ") },
    });
    expect(envoyer).toBeEnabled();
    fireEvent.click(envoyer);
    await waitFor(() => expect(relirePost).toHaveBeenCalledWith("rp1", expect.objectContaining({ note: 2, slides: [] })));
  });

  it("tout relu : message de fin avec le compte", async () => {
    mesRelectures.mockResolvedValue([{ ...POST, statut: "faite", note: 4, fait_le: "2026-11-07T10:00:00Z" }]);
    rendre();
    expect(await screen.findByTestId("relectures-vide")).toHaveTextContent(/1 post/);
  });
});
