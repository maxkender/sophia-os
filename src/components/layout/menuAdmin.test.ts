import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PAGES_AUTO } from "@/features/auto/pages";

const source = fs.readFileSync(path.join(process.cwd(), "src/components/layout/AdminLayout.tsx"), "utf8");

describe("menu admin (prompt 22)", () => {
  it("Recruitment Automation sous Tracking, 12 pages dans l'ordre demandé", () => {
    expect(PAGES_AUTO.map((p) => p.to)).toEqual([
      "/admin/auto",
      "/admin/auto/recruits",
      "/admin/auto/cohorts",
      "/admin/auto/decisions",
      "/admin/auto/sent",
      "/admin/auto/received",
      "/admin/auto/needs-you",
      "/admin/auto/problems",
      "/admin/auto/disputes",
      "/admin/auto/payroll",
      "/admin/auto/faq",
      "/admin/auto/logs",
    ]);
    // La section passe juste sous « Tracking », avant « Configuration ».
    expect(source.indexOf('title: t("auto.section")')).toBeGreaterThan(source.indexOf('title: t("navSection.suivi")'));
    expect(source.indexOf('title: t("auto.section")')).toBeLessThan(source.indexOf('title: t("navSection.config")'));
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
