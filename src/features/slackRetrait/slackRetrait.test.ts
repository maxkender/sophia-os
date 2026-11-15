import { describe, expect, it } from "vitest";

import { dateArret, etatCanaux, resume } from "./logique";

describe("À retirer de Slack", () => {
  it("résume le nombre de personnes encore dans Slack", () => {
    expect(resume(0)).toMatch(/^Personne/);
    expect(resume(1)).toBe("1 personne désactivée dans l'OS est encore membre actif de Slack.");
    expect(resume(57)).toBe("57 personnes désactivées dans l'OS sont encore membres actifs de Slack.");
  });

  it("donne la date d'arrêt (Paris) ou un tiret", () => {
    expect(dateArret({ arret_at: "2026-11-07T23:30:00Z" })).toBe("08/11");
    expect(dateArret({ arret_at: null })).toBe("—");
  });

  it("dit où en est le retrait des canaux", () => {
    expect(etatCanaux({ canaux_retires_at: null, canaux_bilan: null, erreur: null })).toEqual({ texte: "Encore dans ses canaux", ton: "rien" });
    expect(etatCanaux({ canaux_retires_at: null, canaux_bilan: null, erreur: "#posters : not_in_channel" }).ton).toBe("erreur");
    const fait = etatCanaux({ canaux_retires_at: "2026-11-08T10:00:00Z", canaux_bilan: { retires: ["#a", "#b"] }, erreur: null });
    expect(fait).toEqual({ texte: "Retirée de 2 canaux le 08/11 · reste #general", ton: "ok" });
    expect(etatCanaux({ canaux_retires_at: "2026-11-08T10:00:00Z", canaux_bilan: { retires: ["#a"] }, erreur: null }).texte).toMatch(/^Retirée de 1 canal le/);
  });
});
