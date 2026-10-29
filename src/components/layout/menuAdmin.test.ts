import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PAGES_AUTO } from "@/features/auto/pages";

const source = fs.readFileSync(path.join(process.cwd(), "src/components/layout/AdminLayout.tsx"), "utf8");

describe("menu admin (prompt 22)", () => {
  it("Recruitment Automation en tête, 9 pages dans l'ordre demandé", () => {
    expect(PAGES_AUTO.map((p) => p.to)).toEqual([
      "/admin/auto",
      "/admin/auto/recruits",
      "/admin/auto/decisions",
      "/admin/auto/sent",
      "/admin/auto/received",
      "/admin/auto/needs-you",
      "/admin/auto/payroll",
      "/admin/auto/faq",
      "/admin/auto/logs",
    ]);
    // La section passe avant le pilotage et toutes les autres.
    expect(source.indexOf('title: t("auto.section")')).toBeGreaterThan(-1);
    expect(source.indexOf('title: t("auto.section")')).toBeLessThan(source.indexOf('to: "/admin", label: t("nav.pilotage")'));
  });

  it("les pages remplacées ou retirées ne sont plus dans le menu", () => {
    for (const r of [
      "/admin/pipeline", "/admin/cohortes", "/admin/check-kill-double", "/admin/recrutements", "/admin/paie",
      "/admin/nudges", "/admin/reponses", "/admin/reviews", "/admin/assistant", "/admin/inactifs", "/admin/surveillance",
    ]) {
      expect(source).not.toContain(`to: "${r}"`);
    }
  });

  it("le reste du menu ne bouge pas", () => {
    for (const r of [
      "/admin/posters", "/admin/analytics", "/admin/suivi-rc", "/admin/file-reviews", "/admin/retours-contestes",
      "/admin/banc-relecture", "/admin/comment-masters", "/admin/reglages", "/admin/tests",
    ]) {
      expect(source).toContain(`to: "${r}"`);
    }
  });
});
