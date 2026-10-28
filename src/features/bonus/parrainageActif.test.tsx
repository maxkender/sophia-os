import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/locales";

const valeur = vi.hoisted(() => ({ v: false as unknown }));
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { valeur: valeur.v }, error: null }) }) }),
    }),
  },
}));
vi.mock("@/features/referral/api", () => ({ creerReferral: vi.fn(), listerMesReferrals: vi.fn(async () => []) }));

import { PosterReferralPage } from "@/pages/poster/PosterReferralPage";

function rendu() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/createur/parrainage"]}>
        <Routes>
          <Route path="/createur/parrainage" element={<PosterReferralPage />} />
          <Route path="/calendrier" element={<p>accueil</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const lire = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("prompt 15, point 2 : parrainage caché quand bonus_parrainage_actif = false", () => {
  beforeEach(async () => {
    valeur.v = false;
    await i18n.changeLanguage("fr");
  });

  it("en pause : la page du posteur renvoie à l'accueil", async () => {
    rendu();
    expect(await screen.findByText("accueil")).toBeInTheDocument();
  });

  it("actif : la page s'affiche", async () => {
    valeur.v = true;
    rendu();
    expect(await screen.findByText("Recommander un créateur")).toBeInTheDocument();
    expect(screen.queryByText("accueil")).toBeNull();
  });

  it("menus et accueil : l'entrée et la carte passent par useParrainageActif", () => {
    expect(lire("src/components/layout/PosterLayout.tsx")).toMatch(/parrainage \? \[\{ to: "\/createur\/parrainage"/);
    expect(lire("src/components/layout/AdminLayout.tsx")).toMatch(/\.\.\.\(parrainage\s*\?\s*\[\s*\{\s*to: "\/admin\/parrainages"/);
    expect(lire("src/pages/poster/PosterCalendrierPage.tsx")).toMatch(/\{parrainage && \(\s*<Link\s+to="\/createur\/parrainage"/);
  });
});
