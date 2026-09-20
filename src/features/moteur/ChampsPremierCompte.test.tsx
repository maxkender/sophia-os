import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "@/locales";
import { ChampsPremierCompte } from "./ChampsPremierCompte";

describe("ChampsPremierCompte", () => {
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

  it("ne propose plus de compte CM", () => {
    render(
      <ChampsPremierCompte
        allowAucun
        typeCompte="perso"
        onType={vi.fn()}
        langues={["fr", "es"]}
        langue="fr"
        onLangue={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /^CM$/i })).not.toBeInTheDocument();
  });
});
