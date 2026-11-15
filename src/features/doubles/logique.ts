/** 7/11 : Weekly decisions → « 2e comptes proposés ». */
export type StatutDouble = "propose" | "vu" | "accepte" | "refuse" | "expire" | "retenu";

export interface LigneDouble {
  id: string;
  poster_id: string;
  nom: string;
  pays: string;
  samedi: string;
  propose_at: string;
  expire_at: string | null;
  vu_at: string | null;
  repondu_at: string | null;
  statut: StatutDouble;
  tarif: number | null;
  compte1: string | null;
  compte2: string | null;
  compte2_cree_at: string | null;
  warmup_debut: string | null;
  warmup_fin: string | null;
  warmup_fait: boolean;
  premier_post: string | null;
  posts_2: number;
  milestone: { nom: string; etat: string; depot: string | null } | null;
  erreur: string | null;
}

export const LIBELLE_STATUT: Record<StatutDouble, string> = {
  propose: "Proposé",
  vu: "Vu",
  accepte: "Accepté",
  refuse: "Refusé",
  expire: "Expiré",
  retenu: "En attente d'envoi",
};

export const ORDRE_STATUT: StatutDouble[] = ["propose", "vu", "retenu", "accepte", "refuse", "expire"];

export type EtatEtape = "ok" | "attente" | "non";

/** Les étapes d'un accepté, dans l'ordre : compte, warm-up, 1er post, milestone. */
export function etapesAccepte(l: LigneDouble, maintenant = Date.now()): { cle: string; libelle: string; etat: EtatEtape }[] {
  const warmupLance = !!l.warmup_debut;
  const finPassee = !!l.warmup_fin && new Date(l.warmup_fin).getTime() <= maintenant;
  const etatMilestone = l.milestone?.etat ?? null;
  return [
    { cle: "compte", libelle: l.compte2 ? `Compte créé @${l.compte2}` : "Compte pas encore créé", etat: l.compte2 ? "ok" : "non" },
    {
      cle: "warmup",
      libelle: l.warmup_fait || finPassee ? "Warm-up fait" : warmupLance ? `Warm-up en cours${l.warmup_fin ? ` (fin ${jourCourt(l.warmup_fin)})` : ""}` : "Warm-up pas lancé",
      etat: l.warmup_fait || finPassee ? "ok" : warmupLance ? "attente" : "non",
    },
    {
      cle: "post",
      libelle: l.premier_post ? `1er post le ${jourCourt(l.premier_post)} (${l.posts_2} au total)` : "Pas encore de post",
      etat: l.premier_post ? "ok" : l.warmup_fait || finPassee ? "attente" : "non",
    },
    {
      cle: "milestone",
      libelle: l.milestone ? `${l.milestone.nom} : ${etatMilestone === "NotFunded" ? "créé, à financer" : "financé"}` : "Milestone pas encore créé",
      etat: !l.milestone ? "non" : etatMilestone === "NotFunded" ? "attente" : "ok",
    },
  ];
}

export function compterStatuts(lignes: LigneDouble[]): Record<StatutDouble, number> {
  const c: Record<StatutDouble, number> = { propose: 0, vu: 0, accepte: 0, refuse: 0, expire: 0, retenu: 0 };
  for (const l of lignes) c[l.statut] += 1;
  return c;
}

export function jourCourt(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" }).format(d);
}

/** « reste 41 h » / « reste 2 j » / « expiré » : le temps pour répondre. */
export function resteAvant(expire: string | null, maintenant = Date.now()): string | null {
  if (!expire) return null;
  const h = Math.floor((new Date(expire).getTime() - maintenant) / 3600_000);
  return h <= 0 ? "expiré" : h < 48 ? `reste ${h} h` : `reste ${Math.floor(h / 24)} j`;
}
