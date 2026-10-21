import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { RegionCommentMaster } from "./api";
import * as L from "./logique";

const region = (r: Partial<RegionCommentMaster> = {}): RegionCommentMaster => ({
  langue: "de",
  region: "German-speaking countries",
  comment_master_id: "p1",
  comment_master: "Martin Befeld",
  slack_channel_id: "C1",
  slack_verifie_canal: "C1",
  slack_verifie_at: "2026-10-20T10:00:00Z",
  slack_canal_nom: "comments-de",
  slack_erreur: null,
  slack_erreur_at: null,
  fenetre_heures: 12,
  actif: false,
  ...r,
});

describe("réglages recopiés du serveur", () => {
  const deno = fs.readFileSync(
    path.join(process.cwd(), "supabase/functions/_shared/comment_masters.ts"),
    "utf8",
  );
  const valeur = (nom: string) => deno.match(new RegExp(`export const ${nom} = ([\\d._]+);`))?.[1].replace(/_/g, "");

  it.each([
    "CADENCE_RELEVE_MIN",
    "AGE_ABANDON_MIN",
    "PART_SEUIL_ABANDON",
    "LIENS_PAR_LOT",
    "PRIX_RELEVE_USD",
    "PRIX_COMMENTAIRE_USD",
    "CIBLE_DECLENCHEMENT",
    "SEUIL_PLANCHER",
  ] as const)("%s est le même qu'en Deno", (nom) => {
    expect(Number(valeur(nom))).toBe(L[nom]);
  });
});

describe("mois à l'heure de Paris", () => {
  it("prend le mois de Paris, pas celui de l'UTC", () => {
    // 31 octobre 23 h 30 UTC = 1er novembre 0 h 30 à Paris (heure d'hiver).
    expect(L.moisParis(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
    expect(L.moisParis(new Date("2026-10-20T12:00:00Z"))).toBe("2026-10-01");
  });

  it("recule et avance d'un mois, y compris d'une année à l'autre", () => {
    expect(L.decalerMois("2026-01-01", -1)).toBe("2025-12-01");
    expect(L.decalerMois("2026-12-01", 1)).toBe("2027-01-01");
  });
});

describe("bonus et coût", () => {
  it("10 $ par tranche de 20 commentaires", () => {
    expect(L.bonus(0)).toEqual({ dollars: 0, resteAvantProchain: 20 });
    expect(L.bonus(19)).toEqual({ dollars: 0, resteAvantProchain: 1 });
    expect(L.bonus(20)).toEqual({ dollars: 10, resteAvantProchain: 20 });
    expect(L.bonus(47)).toEqual({ dollars: 20, resteAvantProchain: 13 });
  });

  it("coût Apify : relevés et commentaires relus", () => {
    expect(L.coutEstime(1000, 0)).toBeCloseTo(2.3);
    expect(L.coutEstime(0, 100)).toBeCloseTo(0.075);
  });

  it("taux de déclenchement sur les posts suivis jusqu'au bout", () => {
    expect(L.tauxDeclenchement(3, 60)).toBe(0.05);
    expect(L.tauxDeclenchement(0, 0)).toBeNull();
  });
});

describe("état d'une région", () => {
  it("prête quand tout y est, active quand allumée", () => {
    expect(L.etatRegion(region())).toEqual({ etat: "prete", manques: [] });
    expect(L.etatRegion(region({ actif: true })).etat).toBe("active");
  });

  it("dit ce qui manque", () => {
    expect(L.etatRegion(region({ comment_master_id: null, slack_channel_id: null })).manques).toEqual([
      "comment_master",
      "canal",
    ]);
    // Canal changé depuis la vérification : à revérifier.
    expect(L.etatRegion(region({ slack_channel_id: "C2" }))).toEqual({
      etat: "incomplete",
      manques: ["verification"],
    });
  });
});

describe("erreurs Slack", () => {
  it("traduit les codes connus, garde le droit manquant", () => {
    expect(L.erreurSlack("not_in_channel")).toEqual({ cle: "not_in_channel" });
    expect(L.erreurSlack("missing_scope:groups:read")).toEqual({ cle: "missing_scope", droit: "groups:read" });
    expect(L.erreurSlack("truc_bizarre")).toEqual({ cle: "inconnue" });
    expect(L.erreurSlack(null)).toBeNull();
  });

  it("invite le bot quand il n'est pas dans le canal ou ne le voit pas", () => {
    expect(L.fautInviterBot("not_in_channel")).toBe(true);
    expect(L.fautInviterBot("channel_not_found")).toBe(true);
    expect(L.fautInviterBot("is_archived")).toBe(false);
    expect(L.fautInviterBot(null)).toBe(false);
  });
});

describe("divers", () => {
  it("nom de canal conseillé : latam et br comme au ticket", () => {
    expect(L.canalConseille("de")).toBe("comments-de");
    expect(L.canalConseille("es-419")).toBe("comments-latam");
    expect(L.canalConseille("pt-BR")).toBe("comments-br");
  });

  it("un seuil est un entier d'au moins 3 000", () => {
    expect(L.seuilValide(3000)).toBe(true);
    expect(L.seuilValide(2999)).toBe(false);
    expect(L.seuilValide(5000.5)).toBe(false);
    expect(L.seuilValide(Number.NaN)).toBe(false);
  });

  it("les régions actives d'abord, puis par nom de langue", () => {
    const noms: Record<string, string> = { de: "Allemand", en: "Anglais", it: "Italien" };
    const tri = L.regionsTriees(
      [region({ langue: "it" }), region({ langue: "en" }), region({ langue: "de", actif: true })],
      (c) => noms[c],
    );
    expect(tri.map((r) => r.langue)).toEqual(["de", "en", "it"]);
  });
});
