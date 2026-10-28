import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(process.cwd(), "src/components/layout/AdminLayout.tsx"), "utf8");
const routeur = fs.readFileSync(path.join(process.cwd(), "src/app/router.tsx"), "utf8");

describe("menu admin (28 oct., partie E)", () => {
  it("la section suivi, dans l'ordre : Cohorts · Posters · Decisions · Recruiting · Payroll · Follow-ups", () => {
    const ordre = ["/admin/cohortes", "/admin/posters", "/admin/check-kill-double", "/admin/recrutements", "/admin/paie", "/admin/nudges"];
    const positions = ordre.map((r) => source.indexOf(`to: "${r}"`));
    for (const p of positions) expect(p).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("Inactifs et Slack à relier sortent du menu, leurs routes restent", () => {
    expect(source).not.toContain('to: "/admin/inactifs"');
    expect(source).not.toContain('to: "/admin/slack"');
    expect(routeur).toContain('path="/admin/inactifs"');
    expect(routeur).toContain('path="/admin/slack"');
  });
});
