import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ANCIENNES_ADRESSES, ANCIENNES_PAGES, GROUPES_MENU, MENU_AUTO, PAGES_AUTO } from "@/features/auto/pages";

const source = fs.readFileSync(path.join(process.cwd(), "src/components/layout/AdminLayout.tsx"), "utf8");

describe("menu admin (prompt 22)", () => {
  it("Recruitment Automation sous Tracking, 13 pages dans l'ordre demandé", () => {
    expect(PAGES_AUTO.map((p) => p.to)).toEqual([
      "/admin/auto/aujourdhui",
      "/admin/auto/reglages",
      "/admin/auto",
      "/admin/auto/recruits",
      "/admin/auto/cohorts",
      "/admin/auto/decisions",
      "/admin/auto/sent",
      "/admin/auto/received",
      "/admin/auto/problemes",
      "/admin/auto/problemes-cartes",
      "/admin/auto/problems",
      "/admin/auto/disputes",
      "/admin/auto/payroll",
      "/admin/auto/paie-ruul",
      "/admin/auto/rapport-kills",
      "/admin/auto/bonus",
      "/admin/auto/candidats-ruul",
      "/admin/auto/cohortes-ruul",
      "/admin/auto/ruul",
      "/admin/auto/upwork-a-ajouter",
      "/admin/auto/faq",
      "/admin/auto/reponses-officielles",
      "/admin/auto/support",
      "/admin/auto/parrainage",
      "/admin/auto/retirer-slack",
      "/admin/auto/logs",
      "/admin/auto/qualite",
    ]);
    // 21/11 : le menu est en 7 groupes construits depuis GROUPES_MENU (plus de section « Recruitment Automation »).
    expect(source).toContain("GROUPES_MENU.map((g) => ({");
  });

  it("21/11 : 7 groupes, Aujourd'hui en premier ; les pages de l'automatisation rangées par groupe", () => {
    expect(GROUPES_MENU).toEqual(["aujourdhui", "posteurs", "contenu", "paie", "recrutement", "sante", "reglages"]);
    expect(MENU_AUTO.filter((m) => m.groupe === "aujourdhui").map((m) => m.cle)).toEqual(["aujourdhui", "support", "decisions", "qualite"]);
    expect(MENU_AUTO.filter((m) => m.groupe === "paie").map((m) => m.to)).toEqual(["/admin/auto/payroll", "/admin/auto/paie-ruul"]);
    expect(source).toContain("items: [...auto(g), ...autres[g]]");
    // Rien n'est perdu : chaque page est au menu ou dans Réglages.
    for (const p of PAGES_AUTO) {
      expect(MENU_AUTO.some((m) => m.page === p.cle) || ANCIENNES_PAGES.includes(p.cle), p.cle).toBe(true);
    }
    for (const cachee of ["needs", "sent", "received", "cartes"] as const) expect(ANCIENNES_PAGES).toContain(cachee);
  });

  it("21/11 : Problèmes, Pays et File de relecture sortent du menu ; les routes restent, Needs you → Aujourd'hui", () => {
    for (const r of ["/admin/auto/problemes", "/admin/pays", "/admin/file-reviews"]) {
      expect(source).not.toContain(`to: "${r}"`);
      expect(MENU_AUTO.some((m) => m.to === r)).toBe(false);
    }
    expect(ANCIENNES_ADRESSES["/admin/auto/needs-you"]).toBe("/admin/auto/aujourdhui");
  });

  it("les pages remplacées ou retirées ne sont plus dans le menu", () => {
    for (const r of [
      "/admin/pipeline", "/admin/cohortes", "/admin/check-kill-double", "/admin/recrutements", "/admin/paie",
      "/admin/nudges", "/admin/reponses", "/admin/reviews", "/admin/assistant", "/admin/inactifs", "/admin/surveillance",
      // Prompt 21, R : Disputed feedback est l'onglet Feedback de Disputes.
      "/admin/retours-contestes",
    ]) {
      expect(source).not.toContain(`to: "${r}"`);
    }
  });

  it("Relecture native et Fiches restent avec BLEO, dans Contenu (30/10, 21/11)", () => {
    const debut = source.indexOf('to: "/admin/bleo"');
    const fin = source.indexOf('to: "/admin/bleo/reglages"');
    for (const r of ["/admin/relecture-native", "/admin/fiches"]) {
      const i = source.indexOf(`to: "${r}"`);
      expect(i).toBeGreaterThan(debut);
      expect(i).toBeLessThan(fin);
      expect(source.indexOf(`to: "${r}"`, i + 1)).toBe(-1);
    }
  });

  it("le reste du menu ne bouge pas", () => {
    for (const r of [
      "/admin/posters", "/admin/analytics", "/admin/suivi-rc",
      "/admin/banc-relecture", "/admin/comment-masters", "/admin/reglages", "/admin/tests",
    ]) {
      expect(source).toContain(`to: "${r}"`);
    }
  });
});
