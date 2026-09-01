import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import "@/locales";

const listerVoixPapier = vi.fn();
const previewVoixPapier = vi.fn();

vi.mock("@/features/moteur/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/moteur/api")>();
  return {
    ...actual,
    listerVoixPapier: (...args: unknown[]) => listerVoixPapier(...args),
    previewVoixPapier: (...args: unknown[]) => previewVoixPapier(...args),
  };
});

import { SelectVoixEleven } from "./SelectVoixEleven";

function renderSelect(value = "", onChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    onChange,
    ...render(
      <QueryClientProvider client={client}>
        <SelectVoixEleven id="voix-test" value={value} onChange={onChange} />
      </QueryClientProvider>,
    ),
  };
}

describe("SelectVoixEleven", () => {
  it("charge les voix FR et place locuteur-cm en tête, avec un bouton d’écoute", async () => {
    listerVoixPapier.mockResolvedValue({
      hasKey: true,
      langue: "fr",
      voix: [
        {
          id: "george1",
          name: "George",
          languages: ["en"],
          previewUrl: null,
          category: "premade",
          gender: "male",
          accent: null,
          source: "shared",
          custom: false,
        },
        {
          id: "abcCM123",
          name: "locuteur-cm",
          languages: [],
          previewUrl: "https://example.com/cm.mp3",
          category: "cloned",
          gender: null,
          accent: null,
          source: "library",
          custom: true,
        },
        {
          id: "alice1",
          name: "Alice",
          languages: ["fr"],
          previewUrl: null,
          category: "premade",
          gender: "female",
          accent: null,
          source: "library",
          custom: false,
        },
      ],
    });

    const { onChange } = renderSelect("");

    await waitFor(() => {
      expect(listerVoixPapier).toHaveBeenCalledWith("fr");
    });

    expect(screen.getByLabelText(/langue|language/i)).toBeInTheDocument();
    const locuteur = screen.getByLabelText(/locuteur|speaker/i) as HTMLSelectElement;
    await waitFor(() => {
      expect([...locuteur.options].map((o) => o.textContent).join(" ")).toMatch(/locuteur-cm/);
    });
    expect(locuteur.options[0]?.textContent).toMatch(/locuteur-cm/);
    expect(screen.getByRole("button", { name: /écouter|play a sample/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("abcCM123");
    });
  });

  it("recharge les voix quand on change de langue", async () => {
    listerVoixPapier.mockImplementation(async (langue: string) => ({
      hasKey: true,
      langue,
      voix: [
        {
          id: langue === "en" ? "en1" : "abcCM123",
          name: langue === "en" ? "George" : "locuteur-cm",
          languages: [langue],
          previewUrl: "https://example.com/p.mp3",
          category: "premade",
          gender: null,
          accent: null,
          source: "library",
          custom: langue !== "en",
        },
      ],
    }));

    renderSelect("abcCM123");
    await waitFor(() => expect(listerVoixPapier).toHaveBeenCalledWith("fr"));

    fireEvent.change(screen.getByLabelText(/langue|language/i), { target: { value: "en" } });
    await waitFor(() => expect(listerVoixPapier).toHaveBeenCalledWith("en"));
  });
});
