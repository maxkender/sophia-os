import type { PosterProfil } from "@/features/moteur/types";
import {
  additionnerCompteurs,
  compteursDepuis,
  nomProfil,
  resumeCreateur,
  type CompteursPhase,
} from "./suiviEquipe";

/**
 * Page Posters rangée par ZONE : la zone de recrutement d'un recruteur
 * (`profiles.zone_recrutement`, les pays de la master list Notion), dont ses
 * créateurs héritent par `manager_id`. Ce n'est PAS la langue (un HM couvre
 * plusieurs pays, une langue peut être partagée par deux zones) ni la zone de
 * paiement A/B/C des guides créateur.
 *
 * Aucun créateur ne doit disparaître de la page : un créateur sans recruteur,
 * ou rattaché à un profil qui n'est pas recruteur (admin, poster, profil
 * supprimé), tombe dans `sansRecruteur` ; un recruteur sans zone, dans
 * `sansZone`.
 */

/** Rôles qui recrutent des créateurs (et portent donc une zone). */
export const ROLES_RECRUTEUR = ["head_of_ops", "directing_manager", "hiring_manager"] as const;

/** Longueur maximale d'une zone (contrainte `profiles_zone_recrutement_format`). */
export const ZONE_LONGUEUR_MAX = 80;

/** Clé du groupe des recruteurs sans zone (aussi valeur du filtre « Sans zone »). */
export const CLE_SANS_ZONE = "__sans_zone__";

export function estRecruteur(p: Pick<PosterProfil, "role">): boolean {
  return (ROLES_RECRUTEUR as readonly string[]).includes(p.role ?? "");
}

/** Zone telle qu'enregistrée : espaces réduits, vide → null. */
export function normaliserZone(zone: string | null | undefined): string | null {
  const z = (zone ?? "").replace(/\s+/g, " ").trim();
  return z ? z : null;
}

/** Clé de regroupement : deux zones qui ne diffèrent que par la casse sont la même. */
export function cleZone(zone: string | null | undefined): string {
  const z = normaliserZone(zone);
  return z ? z.toLocaleLowerCase("fr") : CLE_SANS_ZONE;
}

export interface BlocRecruteur {
  recruteur: PosterProfil;
  /** Créateurs directs retenus par les filtres (ceux affichés). */
  createurs: PosterProfil[];
  /** Compteurs des créateurs affichés (totaux de zone et puces). */
  compteurs: CompteursPhase;
  /**
   * Compteurs de TOUS ses créateurs directs, filtres ignorés : un filtre de
   * phase ne doit pas faire lire « 0 créateur » sous un recruteur qui en a.
   */
  compteursEquipe: CompteursPhase;
}

export interface GroupeZone {
  /** `cleZone(zone)`, ou `CLE_SANS_ZONE`. */
  cle: string;
  /** Libellé affiché ; null pour le groupe sans zone. */
  zone: string | null;
  recruteurs: BlocRecruteur[];
  compteurs: CompteursPhase;
}

export interface PostersParZone {
  /** Zones renseignées, par ordre alphabétique. */
  zones: GroupeZone[];
  /** Recruteurs sans zone (null s'il n'y en a aucun à montrer). */
  sansZone: GroupeZone | null;
  /** Créateurs sans recruteur valide. */
  sansRecruteur: PosterProfil[];
  /**
   * Recruteurs désactivés sans aucun créateur ni recruteur rattaché (filtres
   * ignorés) : rangés à part, hors des zones.
   */
  recruteursInactifs: PosterProfil[];
}

export interface OptionsRegroupement {
  /** Créateurs à montrer (filtres de la page). Par défaut : tous. */
  garderCreateur?: (p: PosterProfil) => boolean;
  /**
   * Un filtre est actif : un recruteur sans créateur retenu est masqué (sinon
   * la page se remplit de blocs vides), et aucun recruteur désactivé n'est listé.
   */
  filtreActif?: boolean;
  /** Ordre des créateurs d'un bloc. Par défaut : par nom. */
  trierCreateurs?: (liste: PosterProfil[]) => PosterProfil[];
  /**
   * Filtre actif : recruteur gardé même sans créateur retenu (la recherche
   * trouve un recruteur par son nom, même tout neuf, sans créateur).
   */
  garderRecruteur?: (r: PosterProfil) => boolean;
}

const ORDRE_ROLE: Record<string, number> = {
  directing_manager: 0,
  hiring_manager: 1,
  head_of_ops: 2,
};

function comparerRecruteurs(a: BlocRecruteur, b: BlocRecruteur): number {
  const ra = ORDRE_ROLE[a.recruteur.role ?? ""] ?? 9;
  const rb = ORDRE_ROLE[b.recruteur.role ?? ""] ?? 9;
  if (ra !== rb) return ra - rb;
  return nomProfil(a.recruteur).localeCompare(nomProfil(b.recruteur), "fr");
}

function compteursDuBloc(createurs: PosterProfil[]): CompteursPhase {
  return compteursDepuis(createurs.map(resumeCreateur));
}

function parNom(liste: PosterProfil[]): PosterProfil[] {
  return [...liste].sort((a, b) => nomProfil(a).localeCompare(nomProfil(b), "fr"));
}

export function regrouperParZone(
  tous: PosterProfil[],
  opts: OptionsRegroupement = {},
): PostersParZone {
  const garder = opts.garderCreateur ?? (() => true);
  const trier = opts.trierCreateurs ?? parNom;
  const recruteurs = tous.filter(estRecruteur);
  const idsRecruteurs = new Set(recruteurs.map((r) => r.id));

  const createursParRecruteur = new Map<string, PosterProfil[]>();
  // Équipe complète, filtres ignorés : compteurs et « sans créateur » en dépendent.
  const equipeParRecruteur = new Map<string, PosterProfil[]>();
  // Recruteurs qui en encadrent d'autres (DM → HM) : jamais « sans équipe ».
  const encadrants = new Set<string>();
  const sansRecruteur: PosterProfil[] = [];
  for (const p of tous) {
    const sousRecruteur = Boolean(p.manager_id && idsRecruteurs.has(p.manager_id));
    if (estRecruteur(p)) {
      if (sousRecruteur) encadrants.add(p.manager_id as string);
      continue;
    }
    if (p.role !== "poster") continue;
    if (sousRecruteur) {
      const id = p.manager_id as string;
      equipeParRecruteur.set(id, [...(equipeParRecruteur.get(id) ?? []), p]);
    }
    if (!garder(p)) continue;
    if (sousRecruteur) {
      const id = p.manager_id as string;
      createursParRecruteur.set(id, [...(createursParRecruteur.get(id) ?? []), p]);
    } else {
      sansRecruteur.push(p);
    }
  }

  const groupes = new Map<string, GroupeZone>();
  const recruteursInactifs: PosterProfil[] = [];
  for (const r of recruteurs) {
    const createurs = trier(createursParRecruteur.get(r.id) ?? []);
    const equipe = equipeParRecruteur.get(r.id) ?? [];
    if (createurs.length === 0) {
      if (opts.filtreActif) {
        if (!opts.garderRecruteur?.(r)) continue;
      } else if (!r.is_active && equipe.length === 0 && !encadrants.has(r.id)) {
        recruteursInactifs.push(r);
        continue;
      }
    }
    const zone = normaliserZone(r.zone_recrutement);
    const cle = cleZone(zone);
    const groupe = groupes.get(cle) ?? {
      cle,
      zone,
      recruteurs: [],
      compteurs: { total: 0, pasCree: 0, warmup: 0, actif: 0 },
    };
    groupe.recruteurs.push({
      recruteur: r,
      createurs,
      compteurs: compteursDuBloc(createurs),
      compteursEquipe: compteursDuBloc(equipe),
    });
    groupes.set(cle, groupe);
  }

  for (const g of groupes.values()) {
    g.recruteurs.sort(comparerRecruteurs);
    g.compteurs = additionnerCompteurs(g.recruteurs.map((b) => b.compteurs));
  }

  const sansZone = groupes.get(CLE_SANS_ZONE) ?? null;
  groupes.delete(CLE_SANS_ZONE);
  const zones = [...groupes.values()].sort((a, b) =>
    (a.zone ?? "").localeCompare(b.zone ?? "", "fr", { sensitivity: "base" }),
  );

  return {
    zones,
    sansZone,
    sansRecruteur: trier(sansRecruteur),
    recruteursInactifs: [...recruteursInactifs].sort((a, b) =>
      nomProfil(a).localeCompare(nomProfil(b), "fr"),
    ),
  };
}

/** Zones déjà utilisées (filtre de la page, suggestions de l'éditeur), sans doublon de casse. */
export function zonesConnues(tous: PosterProfil[]): string[] {
  const parCle = new Map<string, string>();
  for (const r of tous) {
    if (!estRecruteur(r)) continue;
    const zone = normaliserZone(r.zone_recrutement);
    if (zone && !parCle.has(cleZone(zone))) parCle.set(cleZone(zone), zone);
  }
  return [...parCle.values()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

/** Zone dont relève un créateur : celle de son recruteur (null sinon). */
export function zoneDuCreateur(createur: PosterProfil, tous: PosterProfil[]): string | null {
  if (!createur.manager_id) return null;
  const recruteur = tous.find((p) => p.id === createur.manager_id);
  return recruteur && estRecruteur(recruteur) ? normaliserZone(recruteur.zone_recrutement) : null;
}
