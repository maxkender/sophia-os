/**
 * Assignation test À BLANC — types et aides PURES (testées par vitest).
 *
 * Miroir de `ResultatABlanc` (supabase/functions/_shared/a_blanc_execution.ts).
 * Les ids de passage et de post d'un créneau sont FICTIFS : ils n'existent
 * nulle part en base, l'écran ne doit donc jamais en faire des liens.
 */

export type OrigineDeckABlanc =
  | "existant"
  | "livre"
  | "cuit_ia"
  | "a_fabriquer"
  | "refuse"
  | "echec"
  | "budget"
  | "inconnue";

export type OperationABlanc = "insert" | "update" | "upsert" | "delete";

export type MotifNuitABlanc =
  | "inactif"
  | "pause"
  | "quota_nuit"
  | "warmup_non_demarre"
  | "warmup_en_cours"
  | "cm"
  | "ugc_video"
  | "videos_uniquement";

export type MotifBlocageABlanc =
  | "hors_contexte"
  | "contexte_ferme"
  | "supabase_rpc"
  | "supabase_storage"
  | "supabase_functions"
  | "supabase_auth"
  | "supabase_autre"
  | "methode_refusee"
  | "hors_run"
  | "ia_non_autorisee"
  | "ia_plafond"
  | "externe"
  | "requete_illisible"
  | "erreur_interne";

export interface NoteDeckABlanc {
  contenuId: string;
  langue: string;
  application: string;
  origine: Exclude<OrigineDeckABlanc, "inconnue">;
  besoin?: string;
  raison?: string;
  hashtagsIA: "inutile" | "generes" | "bloques";
  appelsIA: { autorises: number; bloques: number };
  fabrication?: string[];
}

export interface SlideABlanc {
  position: number;
  texte: string;
  pub: boolean;
  mediaId: string | null;
  mediaUrl: string | null;
  referenceUrl: string | null;
}

export interface CreneauABlanc {
  rang: number;
  /** FICTIF — jamais en base. */
  passageId: string;
  /** FICTIF — jamais en base. */
  postId: string | null;
  contenu: { id: string; titre: string | null; tier: string | null; tierCycle: number | null; repeche: boolean };
  application: { id: string; slug: string | null; nom: string | null };
  visee?: { id: string; slug: string | null; nom: string | null; motif: string | null };
  langue: string;
  slides: SlideABlanc[];
  slidePub: number | null;
  hashtags: string;
  musique: { titre: string | null; url: string | null; plateforme: string | null } | null;
  deck: {
    origine: OrigineDeckABlanc;
    besoin?: string;
    fabrication?: string[];
    hashtagsStatiques: boolean;
    appelsIA: { autorises: number; bloques: number };
  };
  faceSwap?: { appelsBloques: number };
}

export interface AssignationABlancResultat {
  aBlanc: true;
  jour: string;
  ia: boolean;
  dureeMs: number;
  resume: string;
  erreurRun?: string;
  compte: { id: string; nom: string; langue: string | null; quota: number | null; actif: boolean; ugc: boolean } | null;
  laNuit: { servirait: boolean; motifs: MotifNuitABlanc[]; postsDuJour?: number; quota?: number };
  resultat: {
    crees: number;
    raison?: string;
    erreur?: string;
    quotaBaisse?: { avant: number; apres: number; raison: string; simule: true };
    replis?: Array<{ visee: string; motif: string }>;
    nonServable?: boolean;
  };
  creneaux: CreneauABlanc[];
  decksEcartes: NoteDeckABlanc[];
  ecrituresEvitees: Array<{ table: string; operation: OperationABlanc; requetes: number; lignes: number | null }>;
  appelsBloques: Array<{ hote: string; motif: MotifBlocageABlanc; nombre: number }>;
  appelsIA: { autorises: number; bloques: number };
  lectures: number;
  limites: string[];
}

export interface AssignationABlancLog {
  at: string;
  detail: string;
  statut?: string;
  /** « assignation » (logs du vrai code), « a_blanc » (écriture évitée / appel bloqué), « ready ». */
  etape?: string;
}

/**
 * Découpe un tampon NDJSON reçu par morceaux : les lignes complètes sont
 * rendues parsées, la ligne en cours (sans « \n » final) reste dans `reste`.
 * Une ligne vide ou un JSON illisible est ignoré.
 */
export function decouperLignesNdjson(tampon: string): { lignes: unknown[]; reste: string } {
  const morceaux = tampon.split("\n");
  const reste = morceaux.pop() ?? "";
  const lignes: unknown[] = [];
  for (const brut of morceaux) {
    const ligne = brut.trim();
    if (!ligne) continue;
    try {
      lignes.push(JSON.parse(ligne));
    } catch {
      // ligne illisible : ignorée, le « ready » final tranche
    }
  }
  return { lignes, reste };
}

const ORIGINES: readonly OrigineDeckABlanc[] = [
  "existant",
  "livre",
  "cuit_ia",
  "a_fabriquer",
  "refuse",
  "echec",
  "budget",
  "inconnue",
];

/** Clé i18n du badge d'origine d'un deck. */
export function origineDeckCle(origine: string): string {
  return `aBlanc.deck.${(ORIGINES as readonly string[]).includes(origine) ? origine : "inconnue"}`;
}

/** Clé i18n d'une opération d'écriture évitée. */
export function operationCle(op: string): string {
  return `aBlanc.operation.${["insert", "update", "upsert", "delete"].includes(op) ? op : "update"}`;
}

/** Clé i18n d'un motif « la nuit ne servirait pas ce compte ». */
export function motifNuitCle(motif: string): string {
  return `aBlanc.motifs.${motif}`;
}

/** Clé i18n d'un motif de blocage. */
export function motifBlocageCle(motif: string): string {
  return `aBlanc.blocages.${motif}`;
}

/** Nombre total de requêtes d'écriture évitées. */
export function totalEcritures(r: Pick<AssignationABlancResultat, "ecrituresEvitees">): number {
  return r.ecrituresEvitees.reduce((n, e) => n + e.requetes, 0);
}

/**
 * Même règle que le serveur (`raisonRefusIA`) pour les fenêtres UTC de la nuit :
 * sert à griser la case IA. Le serveur refuse de toute façon, et vérifie EN
 * PLUS qu'aucun run de minuit n'a tourné il y a moins de 30 min.
 */
export function iaBloqueeParLaNuit(maintenant: Date = new Date()): boolean {
  const m = maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes();
  return (m >= 21 * 60 + 45) || m < 30 || (m >= 3 * 60 + 45 && m < 5 * 60 + 30);
}
