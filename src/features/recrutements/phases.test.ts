import { describe, expect, it } from "vitest";

import {
  createursAvecPremierPost,
  createursDuHmPays,
  createursSansPremierPost,
  etapeCouranteCreateur,
  etapeCourantePhase0,
  etapeFaitePhase0,
  hmConcernePays,
  jobPostConcernePays,
  kindEstMessage,
  estActionHumaine,
  cleDestinataireMessage,
  grouperMessagesParDestinataire,
  phasesHmPourPays,
} from "./phases";
import type { RecrutementCreateur, RecrutementHm } from "./types";

function hm(p: Partial<RecrutementHm> = {}): RecrutementHm {
  return {
    id: "h1",
    profile_id: null,
    upwork_freelancer_id: "uw1",
    upwork_profile_url: null,
    avatar_url: null,
    prenom: "Ada",
    nom: "Lovelace",
    nom_affiche: "Ada Lovelace",
    pays: ["fr", "de"],
    email_os: null,
    email_perso: null,
    slack_user_id: null,
    talks_at: "2026-09-01T10:00:00Z",
    contrat_envoye_at: null,
    contrat_signe_at: null,
    codes_envoyes_at: null,
    slack_invite_envoyee_at: null,
    email_perso_demandee_at: null,
    rejoint_slack_at: null,
    rejoint_os_at: null,
    ajoute_upwork_at: null,
    job_post_at: null,
    job_post_id: null,
    job_post_titre: null,
    cible_createurs: 10,
    notes: null,
    dernier_message: null,
    dernier_message_at: null,
    dernier_message_auteur: null,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    ...p,
  };
}

function cre(p: Partial<RecrutementCreateur> = {}): RecrutementCreateur {
  return {
    id: "c1",
    hm_id: "h1",
    profile_id: null,
    pays: "fr",
    upwork_freelancer_id: null,
    upwork_profile_url: null,
    avatar_url: null,
    prenom: "Lea",
    nom: null,
    nom_affiche: "Lea",
    email_os: null,
    email_perso: null,
    slack_user_id: null,
    talks_at: "2026-09-02T10:00:00Z",
    contrat_envoye_at: null,
    contrat_signe_at: null,
    codes_envoyes_at: null,
    slack_invite_envoyee_at: null,
    rejoint_os_at: null,
    rejoint_slack_at: null,
    warmup_at: null,
    premier_post_at: null,
    dernier_message: null,
    dernier_message_at: null,
    dernier_message_auteur: null,
    created_at: "2026-09-02T10:00:00Z",
    updated_at: "2026-09-02T10:00:00Z",
    ...p,
  };
}

describe("phases HM", () => {
  it("reste en phase 0 sans job ni créateur dans ce pays", () => {
    expect(phasesHmPourPays(hm(), [], "fr")).toEqual([0]);
    expect(etapeCourantePhase0(hm({ talks_at: null }))).toBe("talks");
    expect(etapeCourantePhase0(hm())).toBe("contrat_envoye");
  });

  it("passe en phase 1 dès un job post de CE pays (HM mono-pays)", () => {
    expect(
      phasesHmPourPays(hm({ pays: ["fr"], job_post_at: "2026-09-03T00:00:00Z" }), [], "fr"),
    ).toEqual([1]);
  });

  it("un job NL ne sort pas le HM de phase 0 en PL", () => {
    const fiche = hm({
      pays: ["nl", "pl"],
      job_post_at: "2026-09-06T00:00:00Z",
      job_post_titre: "Plaatsen van TikTok-diashows (gebaseerd in Nederland)",
    });
    expect(jobPostConcernePays(fiche, "nl")).toBe(true);
    expect(jobPostConcernePays(fiche, "pl")).toBe(false);
    expect(phasesHmPourPays(fiche, [], "nl")).toEqual([1]);
    expect(phasesHmPourPays(fiche, [], "pl")).toEqual([0]);
  });

  it("passe en phase 1 dès un créateur, même sans job_post_at", () => {
    expect(phasesHmPourPays(hm(), [cre()], "fr")).toEqual([1]);
  });

  it("peut être en phase 1 et 2, créateurs non dupliqués", () => {
    const pipeline = cre();
    const poste = cre({ id: "c2", premier_post_at: "2026-09-05T00:00:00Z" });
    expect(phasesHmPourPays(hm(), [pipeline, poste], "fr")).toEqual([1, 2]);
    expect(createursSansPremierPost([pipeline, poste]).map((c) => c.id)).toEqual(["c1"]);
    expect(createursAvecPremierPost([pipeline, poste]).map((c) => c.id)).toEqual(["c2"]);
  });

  it("filtre les créateurs de l'autre langue : pas de phase 2 sur ce pays", () => {
    expect(phasesHmPourPays(hm({ pays: ["fr", "de"] }), [], "de")).toEqual([0]);
  });

  it("duplique le HM sur chaque pays géré", () => {
    const fiche = hm({ pays: ["fr", "de"] });
    expect(hmConcernePays(fiche, "fr")).toBe(true);
    expect(hmConcernePays(fiche, "de")).toBe(true);
    expect(hmConcernePays(fiche, "es")).toBe(false);
    expect(createursDuHmPays([cre(), cre({ id: "c2", pays: "de" })], "h1", "fr")).toHaveLength(1);
  });

  it("checklist seulement si Slack + OS + Upwork admin", () => {
    const partiel = hm({
      talks_at: "x",
      contrat_envoye_at: "x",
      contrat_signe_at: "x",
      codes_envoyes_at: "x",
      rejoint_os_at: "x",
      rejoint_slack_at: "x",
    });
    expect(etapeFaitePhase0(partiel, "checklist")).toBe(false);
    expect(etapeCourantePhase0(partiel)).toBe("checklist");
    const complet = hm({
      ...partiel,
      ajoute_upwork_at: "x",
    });
    expect(etapeFaitePhase0(complet, "checklist")).toBe(true);
    expect(etapeCourantePhase0(complet)).toBe("job_post");
  });

  it("pointe la première étape manquante même si une étape plus loin est cochée", () => {
    expect(
      etapeCourantePhase0(
        hm({ talks_at: "x", codes_envoyes_at: "x", rejoint_os_at: "x" }),
      ),
    ).toBe("contrat_envoye");
  });
});

describe("timeline créateur", () => {
  it("pointe la première étape manquante", () => {
    expect(etapeCouranteCreateur(cre())).toBe("contrat");
    expect(
      etapeCouranteCreateur(
        cre({
          contrat_envoye_at: "x",
          codes_envoyes_at: "x",
          rejoint_os_at: "x",
          rejoint_slack_at: "x",
          warmup_at: "x",
          premier_post_at: "x",
        }),
      ),
    ).toBe("premier_post");
  });

  it("sépare messages, actions autom, et actions humaines (canal interne)", () => {
    expect(kindEstMessage("reponse")).toBe(true);
    expect(kindEstMessage("relance")).toBe(true);
    expect(kindEstMessage("pression")).toBe(true);
    expect(kindEstMessage("action")).toBe(false);
    expect(estActionHumaine({ kind: "action", canal: "interne" })).toBe(true);
    expect(estActionHumaine({ kind: "action", canal: "os" })).toBe(false);
    expect(estActionHumaine({ kind: "reponse", canal: "interne" })).toBe(false);
  });

  it("fusionne les messages du même créateur, pas deux créateurs ni deux canaux", () => {
    const relance = {
      id: "a",
      canal: "upwork" as const,
      createur_id: "c1",
      hm_id: "h1",
    };
    const pression = {
      id: "b",
      canal: "upwork" as const,
      createur_id: "c1",
      hm_id: "h1",
    };
    const autreCreateur = {
      id: "c",
      canal: "upwork" as const,
      createur_id: "c2",
      hm_id: "h1",
    };
    const slack = {
      id: "d",
      canal: "slack" as const,
      createur_id: "c1",
      hm_id: "h1",
    };
    const hmSeul = {
      id: "e",
      canal: "upwork" as const,
      createur_id: null,
      hm_id: "h1",
    };
    const hmSeul2 = {
      id: "f",
      canal: "upwork" as const,
      createur_id: null,
      hm_id: "h1",
    };

    expect(cleDestinataireMessage(relance)).toBe(cleDestinataireMessage(pression));
    expect(cleDestinataireMessage(relance)).not.toBe(cleDestinataireMessage(autreCreateur));
    expect(cleDestinataireMessage(relance)).not.toBe(cleDestinataireMessage(slack));
    expect(cleDestinataireMessage(relance)).not.toBe(cleDestinataireMessage(hmSeul));

    const groupes = grouperMessagesParDestinataire([
      relance,
      autreCreateur,
      pression,
      slack,
      hmSeul,
      hmSeul2,
    ]);
    expect(groupes.map((g) => g.map((m) => m.id))).toEqual([
      ["a", "b"],
      ["c"],
      ["d"],
      ["e", "f"],
    ]);
  });
});
