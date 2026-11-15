import { describe, expect, it } from "vitest";

import { garderExistantes, lireFermees } from "./accordeon";

describe("accordéon des sources", () => {
  it("oublie les sources supprimées", () => {
    expect([...garderExistantes(new Set(["a", "b", "c"]), ["a", "c", "d"])]).toEqual(["a", "c"]);
  });

  it("lit une liste illisible comme vide", () => {
    window.localStorage.setItem("ugc-ia:sources-fermees", "{pas du json");
    expect(lireFermees().size).toBe(0);
    window.localStorage.setItem("ugc-ia:sources-fermees", JSON.stringify(["a", 3, "b"]));
    expect([...lireFermees()]).toEqual(["a", "b"]);
    window.localStorage.clear();
  });
});
