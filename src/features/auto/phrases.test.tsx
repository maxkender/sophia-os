/**
 * Prompt 22, partie 11 : une phrase en haut de chaque page (10 pages, Needs you
 * compris), en français et en anglais, dans `auto.phrases.<page>`. Elle est
 * posée par PageAuto (en-tête commun) : aucune page n'a à l'écrire elle-même.
 */
import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import i18n from "@/locales";

import { PageAuto } from "./PageAuto";
import { PAGES_AUTO } from "./pages";

// Le texte exact demandé (partie 11) ; Needs you et Logs se sont séparés depuis (prompt 21, U).
const TEXTES_EN: Record<string, string> = {
  overview: "Everything the automation does, on one page. The red button stops every automatic action.",
  recruits: "Every recruit, from accepted offer to first day posted, live.",
  decisions: "Thursday: Nudge or Recreate, account by account; nothing goes out before Send. Saturday: Kill, Double or Keep; nothing happens before Validate.",
  sent: "Every message the OS sends to recruits and posters, and the texts it uses.",
  received: "Everything posters write to us, sorted by the OS.",
  payroll: "Monday pay for the week just finished.",
  faq: "What the bot answers on Slack and in the dashboard, and what it doesn't know.",
};

describe("les phrases en haut des pages (prompt 22, partie 11)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("chacune des 10 pages a sa phrase, en anglais et en français", () => {
    expect(PAGES_AUTO).toHaveLength(10);
    for (const langue of ["en", "fr"]) {
      const t = i18n.getFixedT(langue);
      for (const p of PAGES_AUTO) {
        const phrase = t(`auto.phrases.${p.cle}`);
        expect(phrase, `${langue} ${p.cle}`).not.toBe(`auto.phrases.${p.cle}`);
        expect(phrase.length, `${langue} ${p.cle}`).toBeGreaterThan(20);
      }
    }
    const fr = i18n.getFixedT("fr");
    const en = i18n.getFixedT("en");
    for (const p of PAGES_AUTO) expect(fr(`auto.phrases.${p.cle}`)).not.toBe(en(`auto.phrases.${p.cle}`));
  });

  it("le texte anglais est celui demandé", () => {
    const t = i18n.getFixedT("en");
    for (const [cle, texte] of Object.entries(TEXTES_EN)) expect(t(`auto.phrases.${cle}`)).toBe(texte);
    expect(t("auto.phrases.logs")).toMatch(/Everything the automation did/);
    expect(t("auto.phrases.needs")).toMatch(/What needs you and what's broken/);
  });

  it.each(PAGES_AUTO.map((p) => p.cle))("%s : le nom et la phrase en haut de la page", (cle) => {
    render(
      <MemoryRouter>
        <PageAuto cle={cle}>
          <p>contenu</p>
        </PageAuto>
      </MemoryRouter>,
    );
    expect(screen.getByText(i18n.t(`auto.phrases.${cle}`))).toBeTruthy();
    expect(screen.getByRole("heading", { name: i18n.t(`auto.pages.${cle}.titre`) })).toBeTruthy();
  });

  it("le menu reprend la même phrase sous le nom de chaque page", () => {
    const menu = fs.readFileSync(path.join(process.cwd(), "src/components/layout/AdminLayout.tsx"), "utf8");
    expect(menu).toContain("description: t(`auto.phrases.${p.cle}`)");
  });
});
