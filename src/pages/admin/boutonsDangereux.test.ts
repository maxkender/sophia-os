/**
 * Prompt 15, point 1 : les boutons dangereux. Les pages lourdes (Minuit,
 * Sources, Bibliothèque, Analytics, Shadowban, Account watch, espace HM) sont
 * gardées ici par leur source : chaque bouton passe par une confirmation dont
 * le texte existe en français et en anglais, et les entrées retirées le
 * restent. Les autres boutons ont leur test de comportement à côté de leur
 * page (banc de relecture, file des reviews, retours contestés, Slack,
 * mise à jour des sources, réglages de paie ; droits HM côté serveur dans
 * supabase/functions/_shared/roles_test.ts).
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { en as enBrut } from "@/locales/en";
import { fr as frBrut } from "@/locales/fr";

const fr = frBrut.translation;
const en = enBrut.translation;

const lire = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

function cle(dico: unknown, chemin: string): unknown {
  return chemin.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dico);
}

/** Le bouton passe par `window.confirm(t("<cle>"…` ou `confirmer("<cle>"` et la clé existe en fr et en. */
function confirme(fichier: string, appel: string, cleI18n: string) {
  const source = lire(fichier);
  expect(source, `${fichier} : ${appel}`).toContain(appel);
  expect(cle(fr, cleI18n), `fr ${cleI18n}`).toBeTypeOf("string");
  expect(cle(en, cleI18n), `en ${cleI18n}`).toBeTypeOf("string");
}

describe("prompt 15, point 1 : boutons dangereux", () => {
  it("a) Tests : « Simuler minuit » et « Test complet » ne sont plus au catalogue", () => {
    const source = lire("src/pages/admin/AdminTestsPage.tsx");
    const catalogue = source.slice(source.indexOf("const TESTS = ["), source.indexOf("] as const;"));
    expect(catalogue).not.toContain('value: "minuit",');
    expect(catalogue).not.toContain('value: "complet"');
    expect(catalogue).toContain('value: "minuit-compte"');
  });

  it("b) Shadowban « New account » demande confirmation", () => {
    confirme(
      "src/features/ckd/shadowban/VueShadowban.tsx",
      'window.confirm(t("ckd.shadowban.confirmNouveau"',
      "ckd.shadowban.confirmNouveau",
    );
  });

  it("c) Account watch : page retirée (prompt 22), son adresse redirige vers Overview", () => {
    expect(lire("src/components/layout/AdminLayout.tsx")).not.toContain('to: "/admin/surveillance"');
    expect(lire("src/features/auto/pages.ts")).toContain('"/admin/surveillance": "/admin/auto"');
  });

  it("d) espace HM : ajouter un compte, Reactivate, créer une HM cachés à la HM", () => {
    const page = lire("src/pages/hiring/HiringPosterPage.tsx");
    expect(page).toMatch(/role !== "hiring_manager" && \(\s*<FormulaireAjouterCompte/);
    expect(page).toContain('peutReactiver={role !== "hiring_manager"}');
    expect(page).toContain('const montrerCreerRecruteur = role === "head_of_ops";');
    const serveur = lire("supabase/functions/manage-users/index.ts");
    expect(serveur).toContain("if (refuseAuHm(acces.role, body.action, body.role))");
    expect(lire("supabase/migrations/0390_boutons_dangereux_droits.sql")).toContain("not public.is_admin()");
  });

  it("i) Minuit : Relancer, Rattrapages, Réassigner et Pause confirment avec la date et le coût", () => {
    const f = "src/pages/admin/AdminMinuitPage.tsx";
    confirme(f, 'confirmer("relancer"', "minuit.confirm.relancer");
    confirme(f, 'confirmer("rattrapage", { jours: 4', "minuit.confirm.rattrapage");
    confirme(f, 'confirmer("rattrapage", { jours: 2', "minuit.confirm.rattrapage");
    confirme(f, 'confirmer("reassigner"', "minuit.confirm.reassigner");
    confirme(f, 'confirmer(pause ? "pauseOn" : "pauseOff"', "minuit.confirm.pauseOn");
    expect(cle(fr, "minuit.confirm.pauseOff")).toBeTypeOf("string");
    for (const c of ["relancer", "rattrapage", "reassigner"]) {
      expect(cle(fr, `minuit.confirm.${c}`)).toMatch(/\{\{date\}\}/);
      expect(cle(fr, `minuit.confirm.${c}`)).toMatch(/Coût|crédit/);
    }
  });

  it("i) Sources : Extraire et Mettre à jour confirment avec la date et le coût", () => {
    const f = "src/pages/admin/AdminSourcesPage.tsx";
    confirme(f, 'window.confirm(t("sources.confirmExtraire"', "sources.confirmExtraire");
    confirme(f, 'window.confirm(t("sources.confirmUpdate"', "sources.confirmUpdate");
  });

  it("i) Bibliothèque : actions de masse confirmées avec la date et le coût", () => {
    const f = "src/pages/admin/AdminBibliothequePage.tsx";
    confirme(f, 'window.confirm(t("bibliotheque.confirmNettoyerTout"', "bibliotheque.confirmNettoyerTout");
    confirme(f, 'window.confirm(t("bibliotheque.confirmC2pa"', "bibliotheque.confirmC2pa");
    confirme(f, 'window.confirm(t("bibliotheque.confirmRattraper"', "bibliotheque.confirmRattraper");
    expect(cle(fr, "bibliotheque.upscaleConfirm")).toMatch(/\{\{date\}\}/);
  });

  it("i) Analytics : Rafraîchir confirme avec la date et le coût", () => {
    confirme(
      "src/pages/admin/AdminAnalyticsPage.tsx",
      'window.confirm(t("analytics.confirmRafraichir"',
      "analytics.confirmRafraichir",
    );
  });
});
