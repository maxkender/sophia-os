import { describe, expect, it } from "vitest";

import { avecMentionPublicite } from "./mentionPublicite";

describe("avecMentionPublicite", () => {
  it("encadre la mention sur une légende turque de 3 hashtags", () => {
    expect(avecMentionPublicite("#kişiselgelişim #alışkanlıklar #rutinim", "tr")).toBe(
      "#kişiselgelişim #alışkanlıklar #Tanıtım #rutinim",
    );
  });

  it("ne la met jamais en premier ni en dernier quand c'est possible", () => {
    for (const n of [3, 4, 5, 6]) {
      const tags = Array.from({ length: n }, (_, i) => `#tag${i}`).join(" ");
      const sortie = avecMentionPublicite(tags, "tr").split(" ");
      expect(sortie[0]).not.toBe("#Tanıtım");
      expect(sortie[sortie.length - 1]).not.toBe("#Tanıtım");
      expect(sortie).toContain("#Tanıtım");
    }
  });

  it("laisse les autres langues intactes", () => {
    const fr = "#apprendre #culturegenerale #booktok";
    expect(avecMentionPublicite(fr, "fr")).toBe(fr);
    expect(avecMentionPublicite(fr, "es")).toBe(fr);
    expect(avecMentionPublicite(fr, null)).toBe(fr);
  });

  it("est idempotent, quelle que soit l'orthographe déjà en place", () => {
    for (const deja of ["#Tanıtım", "#tanitim", "#TANITIM", "#tanıtım"]) {
      const legende = `#gelişim ${deja} #motivasyon`;
      expect(avecMentionPublicite(legende, "tr")).toBe(legende);
    }
  });

  it("ne double pas la mention quand on repasse dessus", () => {
    const une = avecMentionPublicite("#gelişim #motivasyon #başarı", "tr");
    expect(avecMentionPublicite(une, "tr")).toBe(une);
  });

  it("tient sur une légende vide ou à un seul hashtag", () => {
    expect(avecMentionPublicite("", "tr")).toBe("#Tanıtım");
    expect(avecMentionPublicite("#keşfet", "tr")).toBe("#keşfet #Tanıtım");
  });

  it("normalise les espaces multiples sans perdre de hashtag", () => {
    expect(avecMentionPublicite("#a   #b\n#c", "tr")).toBe("#a #b #Tanıtım #c");
  });
});
