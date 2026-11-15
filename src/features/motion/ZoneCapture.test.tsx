import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "@/locales";
import { ZoneCapture } from "./ZoneCapture";

URL.createObjectURL ??= vi.fn(() => "blob:apercu");
URL.revokeObjectURL ??= vi.fn();

function Banc() {
  const [f, setF] = React.useState<File | null>(null);
  return <ZoneCapture fichier={f} onFichier={setF} />;
}

describe("ZoneCapture", () => {
  it("prend l'image glissée, refuse le reste, et la retire", () => {
    render(<Banc />);
    const zone = screen.getAllByRole("button")[0];
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["x"], "clip.mp4", { type: "video/mp4" })] } });
    expect(screen.getByText(/PNG, JPEG (ou|or) WebP/)).toBeTruthy();
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["x"], "accueil.png", { type: "image/png" })] } });
    expect(screen.getByText("accueil.png")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /(Retirer|Remove)/ }));
    expect(screen.queryByText("accueil.png")).toBeNull();
  });
});
