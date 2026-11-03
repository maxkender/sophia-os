import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import i18n from "@/locales/index";

import { PageReglesBots } from "./PageReglesBots";

const enregistrer = vi.fn(async () => ({}));
const activer = vi.fn(async () => undefined);

vi.mock("./api", () => ({
  lireRegles: vi.fn(async () => [
    { id: "r1", bot: "tous", regle: "Un lien de post envoyé sur Slack n'est pas un bug.", exemple: "bug_dashboard — Bug report", source_feedback_ids: [], active: true, created_at: "2026-11-03T10:00:00Z" },
  ]),
  lireFeedbacks: vi.fn(async () => [
    { id: "f1", probleme_id: "p", bot: "control_bot", categorie: "bug_dashboard", groupe: "actifs", verdict: "pas_un_probleme",
      raison: "Le posteur montre son travail", diagnostic_du_bot: "Bug report", action_du_bot: null, created_at: "2026-11-03T11:00:00Z", nom: "Test A", en_regle: false },
  ]),
  enregistrerRegle: (...a: unknown[]) => enregistrer(...(a as [])),
  activerRegle: (...a: unknown[]) => activer(...(a as [])),
}));

function rendre(url = "/admin/auto/regles-bots") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <PageReglesBots />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PageReglesBots", () => {
  it("liste, désactiver, et « En faire une règle » pré-remplit depuis la raison", async () => {
    await i18n.changeLanguage("fr");
    rendre();
    const regle = await screen.findByTestId("regle");
    fireEvent.click(within(regle).getByRole("button", { name: "Désactiver" }));
    await vi.waitFor(() => expect(activer).toHaveBeenCalledWith("r1", false));

    fireEvent.click(within(screen.getByTestId("feedback")).getByRole("button", { name: "En faire une règle" }));
    const form = screen.getByTestId("form-regle");
    expect((within(form).getByLabelText("Règle") as HTMLTextAreaElement).value).toBe("Le posteur montre son travail");
    expect((within(form).getByLabelText("Exemple") as HTMLTextAreaElement).value).toBe("bug_dashboard — Bug report");
    expect((within(form).getByLabelText("Bot") as HTMLSelectElement).value).toBe("control_bot");
    fireEvent.click(within(form).getByRole("button", { name: /Enregistrer/ }));
    await vi.waitFor(() => expect(enregistrer).toHaveBeenCalledWith(expect.objectContaining({ id: null, bot: "control_bot", sources: ["f1"], active: true })));
  });

  it("?feedback=<id> (lien depuis une carte) pré-remplit le formulaire", async () => {
    await i18n.changeLanguage("fr");
    rendre("/admin/auto/regles-bots?feedback=f1");
    const form = await screen.findByTestId("form-regle");
    await vi.waitFor(() => expect((within(form).getByLabelText("Règle") as HTMLTextAreaElement).value).toBe("Le posteur montre son travail"));
  });
});
