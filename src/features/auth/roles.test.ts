import { describe, expect, it } from "vitest";

import { badgeManager, estRoleManager, roleAffiche } from "./roles";

describe("roleAffiche", () => {
  it("un admin en aperçu s'affiche Head of Ops, personne d'autre", () => {
    expect(roleAffiche("admin", true)).toBe("head_of_ops");
    expect(roleAffiche("admin", false)).toBe("admin");
    expect(roleAffiche("hiring_manager", true)).toBe("hiring_manager");
    expect(roleAffiche("poster", true)).toBe("poster");
    expect(roleAffiche(null, true)).toBeNull();
  });
});

describe("estRoleManager", () => {
  it("couvre HM et DM, pas admin ni poster", () => {
    expect(estRoleManager("hiring_manager")).toBe(true);
    expect(estRoleManager("directing_manager")).toBe(true);
    expect(estRoleManager("admin")).toBe(false);
    expect(estRoleManager("poster")).toBe(false);
    expect(estRoleManager(null)).toBe(false);
  });
});

describe("badgeManager", () => {
  it("affiche HM ou DM", () => {
    expect(badgeManager("hiring_manager")).toBe("HM");
    expect(badgeManager("directing_manager")).toBe("DM");
    expect(badgeManager("admin")).toBeNull();
  });
});
