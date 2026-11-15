import { describe, expect, it } from "vitest";

import { jourParis, lignesAujourdhui } from "./logique";

const base = { pourMax: 0, maintenant: 0, jeudi: 0, samedi: 0, ruulAInviter: 0, jourSemaine: 3 };

describe("Aujourd'hui (OS clair)", () => {
  it("rien à faire : aucune ligne", () => {
    expect(lignesAujourdhui(base)).toEqual([]);
  });

  it("5 lignes au plus, la plus urgente en haut, chacune avec son bouton", () => {
    const l = lignesAujourdhui({ pourMax: 2, maintenant: 3, jeudi: 0, samedi: 9, ruulAInviter: 117, jourSemaine: 1 });
    expect(l.map((x) => x.cle)).toEqual(["pour_max", "maintenant", "paie", "ruul"]);
    expect(l[0]).toMatchObject({ texte: "2 demandes paiement / urgent pour toi", bouton: "Ouvrir", to: "/admin/auto/support?onglet=boite" });
    expect(l[3].texte).toBe("117 posteurs Ruul à inviter dans Ruul");
    expect(lignesAujourdhui({ pourMax: 1, maintenant: 1, jeudi: 0, samedi: 4, ruulAInviter: 1, jourSemaine: 6 }).length).toBeLessThanOrEqual(5);
  });

  it("le samedi apparaît le vendredi et le samedi, le jeudi le jeudi, la paie le lundi", () => {
    expect(lignesAujourdhui({ ...base, samedi: 4, jourSemaine: 5 })[0].texte).toBe("4 décisions à prendre avant samedi 20h");
    expect(lignesAujourdhui({ ...base, samedi: 4, jourSemaine: 3 })).toEqual([]);
    expect(lignesAujourdhui({ ...base, jeudi: 1, jourSemaine: 4 })[0].texte).toBe("1 décision du jeudi");
    expect(lignesAujourdhui({ ...base, jourSemaine: 1 })[0].cle).toBe("paie");
  });

  it("contrats à relier : seulement s'il y en a (pays introuvable ou fermé)", () => {
    expect(lignesAujourdhui(base).some((l) => l.cle === "contrats")).toBe(false);
    expect(lignesAujourdhui({ ...base, contratsARelier: 2 })[0]).toMatchObject({ texte: "2 contrats : pays introuvable ou fermé", bouton: "Répondre" });
  });

  it("0690 : un signé sans compte passe en tête ; les emails Ruul en erreur aussi", () => {
    const l = lignesAujourdhui({ ...base, creationsEchouees: 4, parcoursErreurs: 2 });
    expect(l[0]).toMatchObject({ cle: "creations", texte: "4 signés sans compte : création refusée" });
    expect(l.some((x) => x.cle === "parcours" && x.texte === "2 emails Ruul en erreur (24 h)")).toBe(true);
    expect(lignesAujourdhui(base).some((x) => x.cle === "creations" || x.cle === "parcours")).toBe(false);
  });

  it("0700 : Brevo sans crédit en tête ; sinon emails en file, non délivrés, clé Brevo absente", () => {
    const base = { pourMax: 0, maintenant: 0, jeudi: 0, samedi: 0, ruulAInviter: 0, jourSemaine: 3 };
    const sans = lignesAujourdhui({ ...base, pourMax: 2, maintenant: 1, emailsEnFile: 40, brevoSansCredit: true });
    expect(sans[0].cle).toBe("brevo_credit");
    expect(sans[0].texte).toContain("40 emails en attente");
    expect(sans.some((l) => l.cle === "emails_file")).toBe(false);
    const file = lignesAujourdhui({ ...base, emailsEnFile: 1, emailsNonDelivres: 3, brevoCleAbsente: true });
    expect(file.map((l) => l.cle)).toEqual(["emails_file", "emails_refuses", "brevo_cle"]);
    expect(file[0].texte).toBe("1 email en file : Brevo a refusé, nouvel essai automatique");
    expect(lignesAujourdhui({ ...base, emailsEnFile: 0, emailsNonDelivres: 0 })).toEqual([]);
    expect(lignesAujourdhui({ ...base, brevoCredits: 850 }).map((l) => l.texte)).toEqual(["Brevo : plus que 850 crédits"]);
    expect(lignesAujourdhui({ ...base, brevoCredits: 1000 })).toEqual([]);
    expect(lignesAujourdhui({ ...base, brevoCredits: null })).toEqual([]);
  });

  it("le jour de la semaine à Paris", () => {
    expect(jourParis(new Date("2026-11-12T12:00:00Z"))).toBe(4);
    expect(jourParis(new Date("2026-11-15T23:30:00Z"))).toBe(1);
  });
});
