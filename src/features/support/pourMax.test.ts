import { describe, expect, it } from "vitest";

import { attenduDemande, attenduProbleme } from "./pourMax";

const MAINTENANT = Date.parse("2026-11-21T12:00:00Z");
const pb = (o: Partial<Parameters<typeof attenduProbleme>[0]>) => ({
  statut: "ouvert", niveau: "urgent", categorie: "question_bloquante", created_at: "2026-11-21T10:00:00Z", question: null, ...o,
});
const dm = (o: Partial<Parameters<typeof attenduDemande>[0]>) => ({
  statut: "ouvert", niveau: "max", categorie: "posting", ticket_at: null, ticket_regle_at: null, action_proposee: null, ...o,
});

describe("Pour Max (21/11) : seulement ce qui a besoin de Max, en une ligne", () => {
  it("un STOP, une relance, une connexion ou un warm-up ne remontent jamais, même urgents", () => {
    for (const categorie of ["stop", "stop_doute", "relance_echec", "login", "tiktok_setup", "zero_post", "slack", "offre_hm_incorrecte"]) {
      expect(attenduProbleme(pb({ categorie }), MAINTENANT)).toBeNull();
    }
  });

  it("une décision d'argent, un cas que le bot n'a pas su régler : la ligne dit quoi faire", () => {
    expect(attenduProbleme(pb({ categorie: "paie" }), MAINTENANT)).toBe("Décide : une question d'argent hors des règles.");
    expect(attenduProbleme(pb({ categorie: "question_bloquante" }), MAINTENANT)).toBe("Le bot n'a pas su régler : décide ou réponds.");
    expect(attenduProbleme(pb({ categorie: "demande_2e_compte", question: "Leila veut un 2e compte : oui ou non ?" }), MAINTENANT))
      .toBe("Leila veut un 2e compte : oui ou non ?");
    // Pas urgent, ou déjà fermé : rien pour Max.
    expect(attenduProbleme(pb({ categorie: "paie", niveau: "samedi" }), MAINTENANT)).toBeNull();
    expect(attenduProbleme(pb({ categorie: "paie", statut: "ferme_auto" }), MAINTENANT)).toBeNull();
  });

  it("un arrêt automatique en échec remonte toujours ; un incident technique seulement après 48 h", () => {
    expect(attenduProbleme(pb({ categorie: "arret_echec", niveau: "samedi" }), MAINTENANT)).toBe("L'arrêt automatique a échoué : termine-le à la main.");
    expect(attenduProbleme(pb({ categorie: "bug_dashboard", niveau: "bots", created_at: "2026-11-20T12:00:00Z" }), MAINTENANT)).toBeNull();
    expect(attenduProbleme(pb({ categorie: "bug_dashboard", niveau: "bots", created_at: "2026-11-19T10:00:00Z" }), MAINTENANT)).toContain("48 h");
  });

  it("demandes : niveau Max ouvert (avec l'action proposée), ticket technique de plus de 48 h", () => {
    expect(attenduDemande(dm({ action_proposee: "Vérifier le dossier Ruul" }), MAINTENANT)).toBe("À faire : Vérifier le dossier Ruul");
    expect(attenduDemande(dm({ categorie: "paie" }), MAINTENANT)).toBe("Question d'argent : valide ou corrige la réponse proposée.");
    expect(attenduDemande(dm({ niveau: "bot" }), MAINTENANT)).toBeNull();
    expect(attenduDemande(dm({ statut: "resolu" }), MAINTENANT)).toBeNull();
    expect(attenduDemande(dm({ niveau: "adrien", ticket_at: "2026-11-18T10:00:00Z" }), MAINTENANT)).toContain("plus de 48 h");
    expect(attenduDemande(dm({ niveau: "adrien", ticket_at: "2026-11-18T10:00:00Z", ticket_regle_at: "2026-11-19T10:00:00Z" }), MAINTENANT)).toBeNull();
  });
});
