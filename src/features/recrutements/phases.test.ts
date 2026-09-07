import { describe, expect, it } from "vitest";

import {
  createursDuHmPays,
  etapeCouranteCreateur,
  etapeCourantePhase0,
  etapeFaitePhase0,
  hmConcernePays,
  kindEstMessage,
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
  it("reste en phase 0 sans job ni créateur", () => {
    expect(phasesHmPourPays(hm(), [])).toEqual([0]);
    expect(etapeCourantePhase0(hm({ talks_at: null }))).toBe("talks");
    expect(etapeCourantePhase0(hm())).toBe("contrat_envoye");
  });

  it("passe en phase 1 dès un job post", () => {
    expect(phasesHmPourPays(hm({ job_post_at: "2026-09-03T00:00:00Z" }), [])).toEqual([1]);
  });

  it("passe en phase 1 dès un créateur, même sans job_post_at", () => {
    expect(phasesHmPourPays(hm(), [cre()])).toEqual([1]);
  });

  it("peut être en phase 1 et 2", () => {
    expect(
      phasesHmPourPays(hm({ job_post_at: "2026-09-03T00:00:00Z" }), [
        cre({ premier_post_at: "2026-09-05T00:00:00Z" }),
      ]),
    ).toEqual([1, 2]);
  });

  it("filtre les créateurs de l'autre langue : pas de phase 2 sur ce pays", () => {
    expect(
      phasesHmPourPays(hm({ job_post_at: "2026-09-03T00:00:00Z" }), []),
    ).toEqual([1]);
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

  it("sépare messages et actions", () => {
    expect(kindEstMessage("reponse")).toBe(true);
    expect(kindEstMessage("relance")).toBe(true);
    expect(kindEstMessage("pression")).toBe(true);
    expect(kindEstMessage("action")).toBe(false);
  });
});
