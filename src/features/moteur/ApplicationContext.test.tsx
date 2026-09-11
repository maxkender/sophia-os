import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationProvider, useApplication } from "./ApplicationContext";

const auth = vi.hoisted(() => ({
  loading: true,
  session: null as { user: { id: string } } | null,
}));

const listerApplications = vi.hoisted(() =>
  vi.fn(async () => [
    { id: "1", slug: "sophia", nom: "Sophia", created_at: "2026-01-01" },
    { id: "2", slug: "micabo", nom: "micabo", created_at: "2026-01-02" },
  ]),
);

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({
    loading: auth.loading,
    session: auth.session,
  }),
}));

vi.mock("./api", () => ({
  listerApplications,
}));

function Probe() {
  const { applications, applicationId, isPending } = useApplication();
  return (
    <div>
      <span data-testid="pending">{String(isPending)}</span>
      <span data-testid="slugs">{applications.map((a) => a.slug).join(",")}</span>
      <span data-testid="app">{applicationId ?? ""}</span>
    </div>
  );
}

function renderProvider() {
  return render(
    <ApplicationProvider>
      <Probe />
    </ApplicationProvider>,
  );
}

describe("ApplicationProvider", () => {
  beforeEach(() => {
    auth.loading = true;
    auth.session = null;
    listerApplications.mockClear();
  });

  it("n'appelle pas Supabase tant que la session n'est pas prête", () => {
    renderProvider();
    expect(listerApplications).not.toHaveBeenCalled();
    expect(screen.getByTestId("slugs").textContent).toBe("");
  });

  it("charge sophia et micabo une fois connecté", async () => {
    auth.loading = false;
    auth.session = { user: { id: "u1" } };
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("slugs").textContent).toBe("sophia,micabo"));
    expect(screen.getByTestId("app").textContent).toBe("1");
  });

  it("relance après le login au lieu de garder la liste vide du RLS anon", async () => {
    auth.loading = false;
    auth.session = null;
    const { rerender } = renderProvider();

    await waitFor(() => expect(screen.getByTestId("pending").textContent).toBe("false"));
    expect(listerApplications).not.toHaveBeenCalled();
    expect(screen.getByTestId("slugs").textContent).toBe("");

    auth.session = { user: { id: "u1" } };
    rerender(
      <ApplicationProvider>
        <Probe />
      </ApplicationProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("slugs").textContent).toBe("sophia,micabo"));
    expect(listerApplications).toHaveBeenCalledTimes(1);
  });
});
