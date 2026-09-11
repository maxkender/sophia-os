import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "@/locales";
import { ChampsPremierCompte } from "./ChampsPremierCompte";

describe("ChampsPremierCompte", () => {
  it("un CM ne demande ni handle TikTok ni email ni 2FA", () => {
    render(
      <ChampsPremierCompte
        typeCompte="cm"
        onType={vi.fn()}
        langues={["fr", "es"]}
        langue="es"
        onLangue={vi.fn()}
        handle=""
        onHandle={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/pseudo|handle/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email tiktok/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/2fa/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/langue du compte|account language/i)).toBeInTheDocument();
    expect(screen.getByText(/instagram et gmail|instagram and gmail/i)).toBeInTheDocument();
  });

  it("un perso garde le @ facultatif", () => {
    const onHandle = vi.fn();
    render(
      <ChampsPremierCompte
        typeCompte="perso"
        onType={vi.fn()}
        langues={["fr"]}
        langue="fr"
        onLangue={vi.fn()}
        handle=""
        onHandle={onHandle}
        postsParJour={2}
        onPostsParJour={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/tiktok handle/i), { target: { value: "maya" } });
    expect(onHandle).toHaveBeenCalledWith("maya");
    expect(screen.queryByLabelText(/email tiktok/i)).not.toBeInTheDocument();
  });
});
