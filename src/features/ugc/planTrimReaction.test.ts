import { describe, expect, it } from "vitest";

import { planTrimReaction } from "../../../supabase/functions/_shared/plan_trim_reaction";

describe("planTrimReaction", () => {
  it("priorise toujours Fal depuis _tmp_full même si le client a recodé video.mp4", () => {
    expect(
      planTrimReaction({
        crop: { startSec: 1, endSec: 5 },
        sourceUrl: "https://cdn.example/ugc/reactions/r1/_tmp_full.mp4",
        videoPathClient: "ugc/reactions/r1/video.mp4",
        videoUrlClient: "https://cdn.example/ugc/reactions/r1/video.mp4",
      }),
    ).toBe("fal_source");
  });

  it("n’utilise le recode client qu’en dernier recours (pas de source)", () => {
    expect(
      planTrimReaction({
        crop: null,
        sourceUrl: "",
        videoPathClient: "ugc/reactions/r1/video.webm",
        videoUrlClient: "https://cdn.example/video.webm",
      }),
    ).toBe("client_legacy");
  });

  it("impossible sans crop/source ni vidéo client", () => {
    expect(
      planTrimReaction({
        crop: null,
        sourceUrl: "  ",
        videoPathClient: "",
        videoUrlClient: "",
      }),
    ).toBe("impossible");
  });
});
