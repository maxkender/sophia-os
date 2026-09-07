import type {
  ChampHorodatageCreateur,
  ChampHorodatageHm,
  EtapeCreateur,
  EtapePhase0,
  KindSuggestion,
  PhaseRecrutement,
  RecrutementCreateur,
  RecrutementHm,
} from "./types";

export const ETAPES_PHASE0: EtapePhase0[] = [
  "talks",
  "contrat_envoye",
  "contrat_signe",
  "acces",
  "checklist",
  "job_post",
];

export const ETAPES_CREATEUR: EtapeCreateur[] = [
  "talks",
  "contrat",
  "acces",
  "rejoint",
  "warmup",
  "premier_post",
];

export const CHAMPS_MANUELS_HM: { champ: ChampHorodatageHm; labelKey: string }[] = [
  { champ: "talks_at", labelKey: "recrutements.etape0.talks" },
  { champ: "contrat_envoye_at", labelKey: "recrutements.etape0.contrat_envoye" },
  { champ: "contrat_signe_at", labelKey: "recrutements.etape0.contrat_signe" },
  { champ: "codes_envoyes_at", labelKey: "recrutements.sous.codes" },
  { champ: "slack_invite_envoyee_at", labelKey: "recrutements.sous.slackInvite" },
  { champ: "email_perso_demandee_at", labelKey: "recrutements.sous.emailDemande" },
  { champ: "rejoint_os_at", labelKey: "recrutements.sous.rejointOs" },
  { champ: "rejoint_slack_at", labelKey: "recrutements.sous.rejointSlack" },
  { champ: "ajoute_upwork_at", labelKey: "recrutements.ajouteUpwork" },
  { champ: "job_post_at", labelKey: "recrutements.etape0.job_post" },
];

export const CHAMPS_MANUELS_CREATEUR: {
  champ: ChampHorodatageCreateur;
  labelKey: string;
}[] = [
  { champ: "talks_at", labelKey: "recrutements.etapeCre.talks" },
  { champ: "contrat_envoye_at", labelKey: "recrutements.sous.contratEnvoye" },
  { champ: "contrat_signe_at", labelKey: "recrutements.sous.contratSigne" },
  { champ: "codes_envoyes_at", labelKey: "recrutements.sous.codes" },
  { champ: "slack_invite_envoyee_at", labelKey: "recrutements.sous.slackInvite" },
  { champ: "rejoint_os_at", labelKey: "recrutements.sous.rejointOs" },
  { champ: "rejoint_slack_at", labelKey: "recrutements.sous.rejointSlack" },
  { champ: "warmup_at", labelKey: "recrutements.etapeCre.warmup" },
  { champ: "premier_post_at", labelKey: "recrutements.etapeCre.premier_post" },
];

const SOUS_ETAPES_PHASE0: Partial<
  Record<EtapePhase0, { champ: ChampHorodatageHm; labelKey: string }[]>
> = {
  acces: [
    { champ: "codes_envoyes_at", labelKey: "recrutements.sous.codes" },
    { champ: "slack_invite_envoyee_at", labelKey: "recrutements.sous.slackInvite" },
    { champ: "email_perso_demandee_at", labelKey: "recrutements.sous.emailDemande" },
  ],
  checklist: [
    { champ: "rejoint_os_at", labelKey: "recrutements.sous.rejointOs" },
    { champ: "rejoint_slack_at", labelKey: "recrutements.sous.rejointSlack" },
    { champ: "ajoute_upwork_at", labelKey: "recrutements.ajouteUpwork" },
  ],
};

const SOUS_ETAPES_CREATEUR: Partial<
  Record<EtapeCreateur, { champ: ChampHorodatageCreateur; labelKey: string }[]>
> = {
  contrat: [
    { champ: "contrat_envoye_at", labelKey: "recrutements.sous.contratEnvoye" },
    { champ: "contrat_signe_at", labelKey: "recrutements.sous.contratSigne" },
  ],
  acces: [
    { champ: "codes_envoyes_at", labelKey: "recrutements.sous.codes" },
    { champ: "slack_invite_envoyee_at", labelKey: "recrutements.sous.slackInvite" },
  ],
  rejoint: [
    { champ: "rejoint_os_at", labelKey: "recrutements.sous.rejointOs" },
    { champ: "rejoint_slack_at", labelKey: "recrutements.sous.rejointSlack" },
  ],
};

const CHAMP_DATE_PHASE0: Record<EtapePhase0, ChampHorodatageHm> = {
  talks: "talks_at",
  contrat_envoye: "contrat_envoye_at",
  contrat_signe: "contrat_signe_at",
  acces: "codes_envoyes_at",
  checklist: "rejoint_os_at",
  job_post: "job_post_at",
};

const CHAMP_DATE_CREATEUR: Record<EtapeCreateur, ChampHorodatageCreateur> = {
  talks: "talks_at",
  contrat: "contrat_envoye_at",
  acces: "codes_envoyes_at",
  rejoint: "rejoint_os_at",
  warmup: "warmup_at",
  premier_post: "premier_post_at",
};

export function etapeFaitePhase0(hm: RecrutementHm, etape: EtapePhase0): boolean {
  switch (etape) {
    case "talks":
      return Boolean(hm.talks_at);
    case "contrat_envoye":
      return Boolean(hm.contrat_envoye_at);
    case "contrat_signe":
      return Boolean(hm.contrat_signe_at);
    case "acces":
      return Boolean(hm.codes_envoyes_at);
    case "checklist":
      return Boolean(hm.rejoint_slack_at && hm.rejoint_os_at && hm.ajoute_upwork_at);
    case "job_post":
      return Boolean(hm.job_post_at);
  }
}

/** Première étape non cochée — les trous (contrat sauté, etc.) restent visibles. */
export function etapeCourantePhase0(hm: RecrutementHm): EtapePhase0 {
  return ETAPES_PHASE0.find((e) => !etapeFaitePhase0(hm, e)) ?? "job_post";
}

export function etapeFaiteCreateur(c: RecrutementCreateur, etape: EtapeCreateur): boolean {
  switch (etape) {
    case "talks":
      return Boolean(c.talks_at);
    case "contrat":
      return Boolean(c.contrat_envoye_at || c.contrat_signe_at);
    case "acces":
      return Boolean(c.codes_envoyes_at);
    case "rejoint":
      return Boolean(c.rejoint_os_at && c.rejoint_slack_at);
    case "warmup":
      return Boolean(c.warmup_at);
    case "premier_post":
      return Boolean(c.premier_post_at);
  }
}

export function etapeCouranteCreateur(c: RecrutementCreateur): EtapeCreateur {
  return ETAPES_CREATEUR.find((e) => !etapeFaiteCreateur(c, e)) ?? "premier_post";
}

export function sousEtapesPhase0(etape: EtapePhase0) {
  return SOUS_ETAPES_PHASE0[etape] ?? [];
}

export function sousEtapesCreateur(etape: EtapeCreateur) {
  return SOUS_ETAPES_CREATEUR[etape] ?? [];
}

export function dateEtapePhase0(hm: RecrutementHm, etape: EtapePhase0): string | null {
  const sous = sousEtapesPhase0(etape);
  if (sous.length > 0) {
    const dates = sous
      .map((s) => hm[s.champ])
      .filter((x): x is string => typeof x === "string" && Boolean(x))
      .sort();
    return dates.length > 0 ? dates[dates.length - 1]! : null;
  }
  return hm[CHAMP_DATE_PHASE0[etape]] ?? null;
}

export function dateEtapeCreateur(c: RecrutementCreateur, etape: EtapeCreateur): string | null {
  const sous = sousEtapesCreateur(etape);
  if (sous.length > 0) {
    const dates = sous
      .map((s) => c[s.champ])
      .filter((x): x is string => typeof x === "string" && Boolean(x))
      .sort();
    return dates.length > 0 ? dates[dates.length - 1]! : null;
  }
  return c[CHAMP_DATE_CREATEUR[etape]] ?? null;
}

export function kindEstMessage(kind: KindSuggestion): boolean {
  return kind !== "action";
}

/**
 * Un HM est en phase 0 tant qu'iel n'a pas de job post ni de créateur.
 * Phase 1 dès qu'un job (ou un créateur) existe.
 * Phase 2 dès qu'un créateur de CE pays a un premier post.
 * 1 et 2 peuvent coexister.
 */
export function phasesHmPourPays(
  hm: RecrutementHm,
  createursDuPays: RecrutementCreateur[],
): PhaseRecrutement[] {
  const aCreateurs = createursDuPays.length > 0;
  const aJob = Boolean(hm.job_post_at) || aCreateurs;
  const aPremierPost = createursDuPays.some((c) => Boolean(c.premier_post_at));
  const phases: PhaseRecrutement[] = [];
  if (!aJob) phases.push(0);
  if (aJob) phases.push(1);
  if (aPremierPost) phases.push(2);
  return phases;
}

export function hmConcernePays(hm: RecrutementHm, pays: string): boolean {
  return (hm.pays ?? []).map((p) => p.toLowerCase()).includes(pays.toLowerCase());
}

export function createursDuHmPays(
  createurs: RecrutementCreateur[],
  hmId: string,
  pays: string,
): RecrutementCreateur[] {
  const p = pays.toLowerCase();
  return createurs.filter((c) => c.hm_id === hmId && c.pays.toLowerCase() === p);
}

export function nomAfficheHm(hm: Pick<RecrutementHm, "prenom" | "nom" | "nom_affiche" | "email_os">): string {
  const compose = [hm.prenom, hm.nom].filter(Boolean).join(" ").trim();
  return compose || hm.nom_affiche || hm.email_os || "—";
}
