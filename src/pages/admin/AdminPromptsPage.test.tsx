import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import "@/locales";
import { SCRIPT_GENERATION_DEFAUT } from "@/features/moteur/papierPromptDefauts";

vi.mock("@/features/moteur/ApplicationContext", () => ({
  useApplication: () => ({ applicationId: "app-1", slug: "sophia" }),
}));

vi.mock("@/features/moteur/api", () => ({
  lirePrompt: vi.fn(async () => ""),
  ecrirePrompt: vi.fn(),
}));

import { AdminPromptsPage } from "./AdminPromptsPage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminPromptsPage />
    </QueryClientProvider>,
  );
}

describe("AdminPromptsPage papier", () => {
  it("affiche les 4 blocs Papier pré-remplis", async () => {
    renderPage();
    expect(await screen.findByText(/Prompt — (Génération de script|Script generation)/)).toBeInTheDocument();
    expect(screen.getByText(/Prompt — (Voix & débit|Voice & pacing)/)).toBeInTheDocument();
    expect(screen.getByText(/Prompt — (CTA Sophia|Sophia CTA)/)).toBeInTheDocument();
    expect(screen.getByText(/Prompt — (Style des images|Image style)/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByDisplayValue(new RegExp(SCRIPT_GENERATION_DEFAUT.slice(0, 40)))).toBeInTheDocument();
    });
  });
});
