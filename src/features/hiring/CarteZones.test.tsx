import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Feature, Geometry } from "geojson";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";

import "@/locales";

import CarteZones from "./CarteZones";
import type { ZoneCarte } from "./carteZones";

/** Deux « pays » carrés suffisent : le tracé est celui de d3-geo, pas celui du test. */
function carre(nom: string, x: number, y: number): Feature<Geometry, { name: string }> {
  return {
    type: "Feature",
    properties: { name: nom },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [x, y],
          [x, y + 5],
          [x + 5, y + 5],
          [x + 5, y],
          [x, y],
        ],
      ],
    },
  };
}

const PAYS = [carre("Germany", 8, 48), carre("Norway", 8, 58), carre("Brazil", -50, -10)];

const ZONES: ZoneCarte[] = [
  {
    cle: "germany + norway",
    zone: "Germany + Norway",
    compteurs: { total: 27, pasCree: 2, warmup: 5, actif: 20 },
    recruteurs: [
      {
        id: "r1",
        nom: "Regina N",
        role: "hiring_manager",
        photoUrl: null,
        actif: true,
        createurs: 25,
      },
    ],
  },
];

function rendre(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("CarteZones", () => {
  it("survol : la zone, ses créateurs et ses recruteurs ; clic : sélection", () => {
    const onSurvol = vi.fn();
    const onSelection = vi.fn();
    const { container } = rendre(
      <CarteZones
        zones={ZONES}
        selection=""
        survol={null}
        onSurvol={onSurvol}
        onSelection={onSelection}
        pays={PAYS}
      />,
    );
    const chemins = [...container.querySelectorAll("path[data-zone]")].filter(
      (p) => p.getAttribute("data-zone") === "germany + norway",
    );
    // Allemagne et Norvège : la zone ; le Brésil n'en a pas.
    expect(chemins).toHaveLength(2);
    fireEvent.mouseMove(chemins[0], { clientX: 10, clientY: 10 });
    expect(onSurvol).toHaveBeenCalledWith("germany + norway");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Germany + Norway");
    expect(screen.getByRole("tooltip")).toHaveTextContent("27 creator(s) · 20 active · 5 warmup · 2 not created");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Regina N");
    expect(screen.getByRole("tooltip")).toHaveTextContent("HM");
    fireEvent.click(chemins[1]);
    expect(onSelection).toHaveBeenCalledWith("germany + norway");
  });

  it("zone sélectionnée : contour par-dessus ses pays", () => {
    const { container } = rendre(
      <CarteZones
        zones={ZONES}
        selection="germany + norway"
        survol={null}
        onSurvol={vi.fn()}
        onSelection={vi.fn()}
        pays={PAYS}
      />,
    );
    expect(container.querySelectorAll('path[fill="none"]')).toHaveLength(2);
  });

  it("signale un morceau de zone qu'elle ne sait pas placer", () => {
    rendre(
      <CarteZones
        zones={[{ ...ZONES[0], cle: "x", zone: "Germany + Atlantis" }]}
        selection=""
        survol={null}
        onSurvol={vi.fn()}
        onSelection={vi.fn()}
        pays={PAYS}
      />,
    );
    expect(screen.getByText(/Not on the map: Atlantis \(Germany \+ Atlantis\)/)).toBeInTheDocument();
  });
});
