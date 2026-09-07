import type {
  EtapeCreateur,
  EtapePhase0,
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

/** Étape courante de la timeline HM (phase 0). */
export function etapeCourantePhase0(hm: RecrutementHm): EtapePhase0 {
  if (hm.job_post_at) return "job_post";
  const checklistOk = Boolean(
    hm.rejoint_slack_at && hm.rejoint_os_at && hm.ajoute_upwork_at,
  );
  if (checklistOk) return "checklist";
  if (hm.codes_envoyes_at || hm.rejoint_os_at) return "acces";
  if (hm.contrat_signe_at) return "contrat_signe";
  if (hm.contrat_envoye_at) return "contrat_envoye";
  return "talks";
}

export function etapeFaitePhase0(hm: RecrutementHm, etape: EtapePhase0): boolean {
  switch (etape) {
    case "talks":
      return Boolean(hm.talks_at);
    case "contrat_envoye":
      return Boolean(hm.contrat_envoye_at);
    case "contrat_signe":
      return Boolean(hm.contrat_signe_at);
    case "acces":
      return Boolean(hm.codes_envoyes_at || hm.rejoint_os_at);
    case "checklist":
      return Boolean(hm.rejoint_slack_at && hm.rejoint_os_at && hm.ajoute_upwork_at);
    case "job_post":
      return Boolean(hm.job_post_at);
  }
}

export function etapeCouranteCreateur(c: RecrutementCreateur): EtapeCreateur {
  if (c.premier_post_at) return "premier_post";
  if (c.warmup_at) return "warmup";
  if (c.rejoint_os_at && c.rejoint_slack_at) return "rejoint";
  if (c.codes_envoyes_at) return "acces";
  if (c.contrat_signe_at || c.contrat_envoye_at) return "contrat";
  return "talks";
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
