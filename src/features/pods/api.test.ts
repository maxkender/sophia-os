import { describe, expect, it } from "vitest";

import { parPod, type Livraison } from "./api";

const liv = (id: string, pod: string) => ({ id, pod }) as Livraison;

describe("parPod", () => {
  it("groupe par pod, dans l'ordre des pods connus, inconnus à la fin", () => {
    const g = parPod([{ slug: "page_blanche" }, { slug: "originaux" }], [liv("1", "inconnu"), liv("2", "page_blanche"), liv("3", "page_blanche")]);
    expect([...g.keys()]).toEqual(["page_blanche", "originaux", "inconnu"]);
    expect(g.get("page_blanche")!.map((l) => l.id)).toEqual(["2", "3"]);
    expect(g.get("originaux")).toEqual([]);
  });
});
