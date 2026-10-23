import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/locales";

const mesReviewsNonVues = vi.fn();
const marquerReviewVue = vi.fn();
const etatOnboarding = vi.fn();
const contesterReview = vi.fn();
vi.mock("@/features/moteur/api", () => ({
  contesterReview: (id: string, mot: string) => contesterReview(id, mot),
  mesReviewsNonVues: () => mesReviewsNonVues(),
  etatOnboarding: () => etatOnboarding(),
  marquerReviewVue: (id: string) => marquerReviewVue(id),
  resoudreTiktok: vi.fn().mockResolvedValue({ url: "", id: null, thumbnail: null }),
}));

import { ReviewPopup } from "./ReviewPopup";

const REVIEW = {
  id: "rev-1",
  poster_id: "p1",
  body: "The hook is too slow.",
  note: null,
  created_at: "2026-09-10T10:00:00.000Z",
  seen_at: null,
  post_id: "post-1",
  publie_url: "https://www.tiktok.com/@crea/photo/7000000000000000001",
  source_url: "https://www.tiktok.com/@src/photo/7000000000000000002",
  handle_tiktok: "maya",
  compte_label: "@maya",
  date_publication: "2026-09-10",
  videos: [
    { url: "https://cdn.example/hook.mp4", titre: "Hook trop lent" },
    { url: "https://cdn.example/timing.mp4", titre: "Timing" },
  ],
  remarques: [],
};

/** jsdom ne mesure rien : on lui donne la hauteur du message et de la zone qui défile. */
function hauteurs(contenu: number, visible = 500) {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => contenu });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => visible });
}

function renderPopup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReviewPopup />
    </QueryClientProvider>,
  );
}

describe("ReviewPopup", () => {
  beforeEach(() => {
    mesReviewsNonVues.mockReset();
    marquerReviewVue.mockReset().mockResolvedValue(undefined);
    contesterReview.mockReset().mockResolvedValue(undefined);
    etatOnboarding.mockReset().mockResolvedValue({ vu: true, etape: 0 });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    hauteurs(500); // tout tient à l'écran
  });

  afterEach(() => {
    delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
    delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  });

  it("montre d'abord son post à côté de l'original, puis le message et les vidéos", async () => {
    mesReviewsNonVues.mockResolvedValue([REVIEW]);
    renderPopup();
    expect(await screen.findByText(/Ton post à côté de l’original|Your post next to the original/)).toBeInTheDocument();
    expect(screen.getByTitle("Original")).toHaveAttribute("src", expect.stringContaining("7000000000000000002"));
    expect(screen.getByTitle(/^(Ton post|Your post)$/)).toHaveAttribute("src", expect.stringContaining("7000000000000000001"));
    expect(screen.queryByText("The hook is too slow.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Voir le retour|See the feedback/ }));
    expect(screen.getByText("The hook is too slow.")).toBeInTheDocument();
    const video = document.querySelector("video");
    expect(video).toHaveAttribute("src", "https://cdn.example/hook.mp4");
    fireEvent.ended(video!);
    expect(document.querySelector("video")).toHaveAttribute("src", "https://cdn.example/timing.mp4");
    expect(screen.getByText(/Vidéo 2 \/ 2|Video 2 \/ 2/)).toBeInTheDocument();

    // Tout tient à l'écran : « Compris » s'ouvre dès la première mesure.
    fireEvent.click(await screen.findByRole("button", { name: /Compris, merci|Got it, thanks/ }));
    await waitFor(() => expect(marquerReviewVue).toHaveBeenCalledWith("rev-1"));
  });

  it("sans lien vers les posts, va droit au message", async () => {
    mesReviewsNonVues.mockResolvedValue([{ ...REVIEW, publie_url: null, source_url: null, videos: [] }]);
    renderPopup();
    expect(await screen.findByText("The hook is too slow.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Voir le retour|See the feedback/ })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Compris, merci|Got it, thanks/ })).toBeInTheDocument();
  });

  it("« Compris » reste verrouillé tant que le message n'est pas lu jusqu'en bas", async () => {
    hauteurs(1500);
    mesReviewsNonVues.mockResolvedValue([{ ...REVIEW, publie_url: null, source_url: null, videos: [] }]);
    renderPopup();
    const verrou = await screen.findByRole("button", { name: /Lis jusqu’en bas|Read to the bottom/ });
    expect(verrou).toBeDisabled();
    const zone = screen.getByText("The hook is too slow.").closest("div.overflow-y-auto") as HTMLElement;
    zone.scrollTop = 1000;
    fireEvent.scroll(zone);
    const compris = await screen.findByRole("button", { name: /Compris, merci|Got it, thanks/ });
    expect(compris).toBeEnabled();
  });

  it("« Ce retour me semble faux » : au bout du message, un mot facultatif, puis merci", async () => {
    mesReviewsNonVues.mockResolvedValue([{ ...REVIEW, publie_url: null, source_url: null, videos: [] }]);
    renderPopup();
    fireEvent.click(await screen.findByRole("button", { name: /Ce retour me semble faux|This feedback seems wrong/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Qu’est-ce qui ne va pas|What’s wrong/ }), {
      target: { value: "My text is the same size as the original" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^(Envoyer|Send)$/ }));
    await waitFor(() => expect(contesterReview).toHaveBeenCalledWith("rev-1", "My text is the same size as the original"));
    expect(await screen.findByText(/Merci, on vérifie|Thanks, we’ll check/)).toBeInTheDocument();
    // Le retour reste à fermer : « Compris » le marque lu.
    expect(marquerReviewVue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Compris, merci|Got it, thanks/ }));
    await waitFor(() => expect(marquerReviewVue).toHaveBeenCalledWith("rev-1"));
  });

  it("annonce les retours qui suivent", async () => {
    mesReviewsNonVues.mockResolvedValue([REVIEW, { ...REVIEW, id: "rev-2" }, { ...REVIEW, id: "rev-3" }]);
    renderPopup();
    expect(await screen.findByText(/encore 2 retours après|2 more feedbacks after this one/)).toBeInTheDocument();
  });
});
