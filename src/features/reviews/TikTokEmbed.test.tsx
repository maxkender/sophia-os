import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/moteur/api", () => ({
  resoudreTiktok: vi.fn(),
}));

import { TikTokEmbed } from "./TikTokEmbed";

function renderEmbed(url: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TikTokEmbed
        url={url}
        titre="Creator's TikTok"
        videLabel="The creator hasn't pasted the post link."
        chargementLabel="Loading preview…"
      />
    </QueryClientProvider>,
  );
}

describe("TikTokEmbed", () => {
  it("embarque le post publié (iframe officiel), pas des slides nettoyées", () => {
    renderEmbed("https://www.tiktok.com/@crea/photo/7123456789");
    const iframe = screen.getByTitle("Creator's TikTok");
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe).toHaveAttribute("src", "https://www.tiktok.com/embed/v2/7123456789");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("n'affiche pas d'images locales quand le lien est absent", () => {
    renderEmbed(null);
    expect(screen.getByText("The creator hasn't pasted the post link.")).toBeInTheDocument();
    expect(screen.queryByTitle("Creator's TikTok")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
