import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import "@/locales";
import { ChatWidget } from "./ChatWidget";

vi.mock("./api", () => ({
  poserQuestionChatbot: vi.fn(async () => "Poste depuis le calendrier."),
  lireLangueDeMonCompte: vi.fn(async () => "de"),
}));

// Le profil d'un poster dit « fr » par défaut : c'est la langue de son compte
// (ici l'allemand) qui compte.
vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    profil: { langues: ["fr"] },
    role: "poster",
  }),
}));

function renderWidget() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChatWidget />
    </QueryClientProvider>,
  );
}

describe("ChatWidget", () => {
  it("ouvre le panneau et envoie une question", async () => {
    const { poserQuestionChatbot } = await import("./api");
    renderWidget();

    fireEvent.click(screen.getByRole("button", { name: /aide|help/i }));
    expect(screen.getByLabelText(/assistant/i)).toBeInTheDocument();
    expect(await screen.findByText(/Stell deine Frage/)).toBeInTheDocument();
    // Mico salue à l'ouverture.
    expect(screen.getByTestId("mico-bulle")).toHaveAttribute("data-humeur", "wave");

    fireEvent.change(screen.getByPlaceholderText("Deine Frage…"), {
      target: { value: "Comment je poste ?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /envoyer|send/i }));

    await waitFor(() => {
      expect(screen.getByText("Poste depuis le calendrier.")).toBeInTheDocument();
    });
    expect(poserQuestionChatbot).toHaveBeenCalledWith("Comment je poste ?", "de", []);
    // La réponse est là : Mico est content.
    expect(screen.getByTestId("mico-bulle")).toHaveAttribute("data-humeur", "happy");
  });
});
