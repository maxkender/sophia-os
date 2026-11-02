import { describe, expect, it } from "vitest";

import { sourcePerformante, tonPerf, tonVsLabel } from "./perfSource";

describe("perf d'une source", () => {
  it("ton : bon dès 1,10, faible sous 0,90, indicatif sous 10 posts", () => {
    expect(tonPerf({ posts: 126, r: 1.15, vuesMediane: 1531 })).toBe("bon");
    expect(tonPerf({ posts: 126, r: 1.0, vuesMediane: 1531 })).toBe("moyen");
    expect(tonPerf({ posts: 126, r: 0.85, vuesMediane: 1531 })).toBe("faible");
    expect(tonPerf({ posts: 4, r: 1.94, vuesMediane: 3670 })).toBe("incertain");
    expect(tonPerf({ posts: 0, r: null, vuesMediane: null })).toBe("aucun");
    expect(tonPerf(undefined)).toBe("aucun");
  });

  it("performante : r d'au moins 1 sur 10 posts ou plus", () => {
    expect(sourcePerformante({ posts: 126, r: 1.15, vuesMediane: 1 })).toBe(true);
    expect(sourcePerformante({ posts: 10, r: 1, vuesMediane: 1 })).toBe(true);
    expect(sourcePerformante({ posts: 9, r: 4.08, vuesMediane: 1 })).toBe(false);
    expect(sourcePerformante({ posts: 300, r: 0.99, vuesMediane: 1 })).toBe(false);
    expect(sourcePerformante(undefined)).toBe(false);
  });

  it("face au label : même échelle, sur r source ÷ r label", () => {
    const base = { posts: 126, r: 1.15, vuesMediane: 1531, labelNom: "smart_girl", rLabel: 0.96, postsLabel: 2234 };
    expect(tonVsLabel({ ...base, rVsLabel: 1.19 })).toBe("bon");
    expect(tonVsLabel({ ...base, rVsLabel: 1.02 })).toBe("moyen");
    expect(tonVsLabel({ ...base, rVsLabel: 0.85 })).toBe("faible");
    expect(tonVsLabel({ ...base, posts: 4, rVsLabel: 1.96 })).toBe("incertain");
    expect(tonVsLabel({ ...base, rVsLabel: null })).toBe("aucun");
  });
});
