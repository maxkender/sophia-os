import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const aDejaPublie = vi.fn();
const etatOnboarding = vi.fn();
const mesReviewsNonVues = vi.fn();
const mesNudges = vi.fn();
let roleReel = "poster";

vi.mock("@/features/moteur/api", () => ({
  aDejaPublie: () => aDejaPublie(),
  etatOnboarding: () => etatOnboarding(),
  mesReviewsNonVues: () => mesReviewsNonVues(),
  mesNudges: () => mesNudges(),
}));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ roleReel, user: { id: "u1" } }) }));

import { ChecklistPremierPost } from "./ChecklistPremierPost";

const TITRE = "⚠️ BEFORE YOUR FIRST POST";

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChecklistPremierPost />
    </QueryClientProvider>,
  );
}

async function pasDePopup() {
  await waitFor(() => expect(aDejaPublie).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByText(TITRE)).toBeNull();
}

function repondre(question: string, reponse: "Yes" | "No") {
  const groupe = screen.getByRole("radiogroup", { name: question });
  fireEvent.click(Array.from(groupe.querySelectorAll("button")).find((b) => b.textContent === reponse)!);
}

const QUESTIONS = [
  "Did you warm up your account?",
  "Did you follow at least 5 people on this account?",
  "Did you scroll for at least 3 minutes?",
  "Did you comment on at least 3 posts in the niche you're going to post in?",
  "Did you repost at least 1 post?",
];

describe("ChecklistPremierPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    roleReel = "poster";
    aDejaPublie.mockResolvedValue(false);
    etatOnboarding.mockResolvedValue({ vu: true, etape: 0 });
    mesReviewsNonVues.mockResolvedValue([]);
    mesNudges.mockResolvedValue([]);
  });

  it("un posteur qui a déjà publié (même sur un autre compte) ne la voit pas", async () => {
    aDejaPublie.mockResolvedValue(true);
    rendre();
    await pasDePopup();
  });

  it("attend l'onboarding, les retours et les messages : un pop-up à la fois", async () => {
    etatOnboarding.mockResolvedValue({ vu: false, etape: 0 });
    const a = rendre();
    await pasDePopup();
    a.unmount();
    etatOnboarding.mockResolvedValue({ vu: true, etape: 0 });
    mesNudges.mockResolvedValue([{ id: "n1" }]);
    rendre();
    await pasDePopup();
  });

  it("un admin qui ouvre le post ne la voit jamais", () => {
    roleReel = "admin";
    rendre();
    expect(aDejaPublie).not.toHaveBeenCalled();
    expect(screen.queryByText(TITRE)).toBeNull();
  });

  it("un No : écran rouge avec ce qui manque, retour aux questions, puis tout Yes : fermé pour de bon", async () => {
    rendre();
    expect(await screen.findByText(TITRE)).toBeInTheDocument();
    const continuer = screen.getByRole("button", { name: "Continue" });
    expect(continuer).toBeDisabled();

    for (const q of QUESTIONS) repondre(q, "Yes");
    repondre(QUESTIONS[1], "No");
    fireEvent.click(continuer);
    expect(screen.getByText("🚫 STOP. DO IT NOW, THEN COME BACK.")).toBeInTheDocument();
    expect(screen.getByText("Follow at least 5 people on this account")).toBeInTheDocument();
    expect(screen.queryByText("Warm up your account")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "I've done it, check again" }));
    // Le No est à redonner, les Yes restent.
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    repondre(QUESTIONS[1], "Yes");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.queryByText(TITRE)).toBeNull());
    expect(window.localStorage.getItem("checklist-premier-post:u1")).toBeTruthy();
  });

  it("déjà passée sur ce navigateur : rien, sans même lire la base", () => {
    window.localStorage.setItem("checklist-premier-post:u1", "2026-10-26T08:00:00Z");
    rendre();
    expect(aDejaPublie).not.toHaveBeenCalled();
    expect(screen.queryByText(TITRE)).toBeNull();
  });
});
