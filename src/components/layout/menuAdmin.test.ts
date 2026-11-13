import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ANCIENNES_PAGES, MENU_AUTO, PAGES_AUTO } from "@/features/auto/pages";

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
      "/admin/auto/problems",
      "/admin/auto/disputes",
      "/admin/auto/payroll",
      "/admin/auto/bonus",
      "/admin/auto/candidats-ruul",
      "/admin/auto/cohortes-ruul",
      "/admin/auto/ruul",
      "/admin/auto/faq",
      "/admin/auto/reponses-officielles",
      "/admin/auto/support",
      "/admin/auto/parrainage",
      "/admin/auto/retirer-slack",
      "/admin/auto/logs",
    ]);
    // La section passe juste sous « Tracking », avant « Configuration ».
    expect(source.indexOf('title: t("auto.section")')).toBeGreaterThan(source.indexOf('title: t("navSection.suivi")'));
    expect(source.indexOf('title: t("auto.section")')).toBeLessThan(source.indexOf('title: t("navSection.config")'));
  });

  it("OS clair (12/11) : 7 entrées dans le menu, les autres pages rangées dans Réglages", () => {
    expect(MENU_AUTO.map((m) => m.cle)).toEqual(["aujourdhui", "posteurs", "ruul", "decisions", "paie", "support", "reglages"]);
    expect(source).toContain("items: MENU_AUTO.map((m) => ({");
    // Rien n'est perdu : chaque page est au menu ou dans Réglages.
    for (const p of PAGES_AUTO) {
      expect(MENU_AUTO.some((m) => m.page === p.cle) || ANCIENNES_PAGES.includes(p.cle), p.cle).toBe(true);
    }
    for (const cachee of ["cohorts", "sent", "received", "needs"] as const) expect(ANCIENNES_PAGES).toContain(cachee);
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

  it("Relecture native et Fiches sont dans la section BLEO (30/10)", () => {
    const debut = source.indexOf('title: t("navSection.bleo")');
    const fin = source.indexOf('title: t("navSection.tests")');
    for (const r of ["/admin/relecture-native", "/admin/fiches"]) {
      const i = source.indexOf(`to: "${r}"`);
      expect(i).toBeGreaterThan(debut);
      expect(i).toBeLessThan(fin);
      expect(source.indexOf(`to: "${r}"`, i + 1)).toBe(-1);
    }
  });

  it("le reste du menu ne bouge pas", () => {
    for (const r of [
      "/admin/posters", "/admin/analytics", "/admin/suivi-rc", "/admin/file-reviews",
      "/admin/banc-relecture", "/admin/comment-masters", "/admin/reglages", "/admin/tests",
    ]) {
      expect(source).toContain(`to: "${r}"`);
    }
  });
});
