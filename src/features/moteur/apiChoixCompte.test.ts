/**
 * Corps manage-users des trois créations de compte (create, ensure_compte,
 * ajouter_compte) : `label_id` / `parts_applications` n'y figurent QUE s'ils
 * sont renseignés. Sans choix, le corps est exactement celui d'avant.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

import {
  ajouterCompte,
  assurerComptePoster,
  corpsApplicationsCompte,
  creerPoster,
} from "./api";

const corpsEnvoye = () => (invoke.mock.calls[0]![1] as { body: Record<string, unknown> }).body;

describe("choix label + répartition dans les corps manage-users", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it("corpsApplicationsCompte : rien de renseigné → aucune clé", () => {
    expect(corpsApplicationsCompte({})).toEqual({});
    expect(corpsApplicationsCompte({ labelId: null, partsApplications: null })).toEqual({});
    expect(corpsApplicationsCompte({ labelId: "", partsApplications: {} })).toEqual({});
    expect(corpsApplicationsCompte({ labelId: "l1", partsApplications: { unswipe: 100 } })).toEqual({
      label_id: "l1",
      parts_applications: { unswipe: 100 },
    });
  });

  it("creerPoster sans choix : corps d'avant, à l'identique", async () => {
    await creerPoster({ prenom: "Ana", nom: "B", password: "12345678", langue: "fr", type_compte: "perso" });
    expect(invoke).toHaveBeenCalledWith("manage-users", expect.anything());
    expect(corpsEnvoye()).toStrictEqual({
      action: "create",
      prenom: "Ana",
      nom: "B",
      password: "12345678",
      langue: "fr",
      type_compte: "perso",
      handle_tiktok: "",
      tiktok_email: "",
      tiktok_password: "",
      tiktok_2fa_note: "",
    });
  });

  it("creerPoster avec choix : label_id et parts_applications", async () => {
    await creerPoster({
      prenom: "Ana",
      nom: "B",
      password: "12345678",
      langue: "fr",
      type_compte: "perso",
      labelId: "l-clean",
      partsApplications: { unswipe: 100 },
    });
    expect(corpsEnvoye()).toMatchObject({ label_id: "l-clean", parts_applications: { unswipe: 100 } });
    expect("labelId" in corpsEnvoye()).toBe(false);
  });

  it("assurerComptePoster : sans choix inchangé, avec répartition seule → pas de label_id", async () => {
    await assurerComptePoster({ userId: "u1", langue: "fr" });
    expect(corpsEnvoye()).toStrictEqual({ action: "ensure_compte", userId: "u1", langue: "fr" });

    invoke.mockClear();
    await assurerComptePoster({ userId: "u1", langue: "fr", partsApplications: { sophia: 70, unswipe: 30 } });
    expect(corpsEnvoye()).toStrictEqual({
      action: "ensure_compte",
      userId: "u1",
      langue: "fr",
      parts_applications: { sophia: 70, unswipe: 30 },
    });
  });

  it("ajouterCompte : label seul → label_id, pas de parts_applications", async () => {
    await ajouterCompte({ posterId: "u1", type_compte: "perso", langue: "fr", labelId: "l-detox" });
    const corps = corpsEnvoye();
    expect(corps.label_id).toBe("l-detox");
    expect("parts_applications" in corps).toBe(false);
  });
});
