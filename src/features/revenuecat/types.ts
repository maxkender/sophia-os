/** Réponse brute d'un chart RevenueCat Charts v3 (champs utilisés). */
export interface ChartRcBrut {
  display_name?: string;
  description?: string;
  resolution?: string;
  values?: Array<{
    cohort: number;
    incomplete?: boolean;
    measure: number;
    segment: number;
    value: number;
  }>;
  segments?: Array<{
    display_name: string;
    is_total?: boolean;
    is_other?: boolean;
  }>;
  measures?: Array<{
    display_name: string;
    unit?: string;
    decimal_precision?: number;
  }>;
  summary?: {
    total?: Record<string, Record<string, number>>;
    average?: Record<string, Record<string, number>>;
  };
}

export interface SnapshotRc {
  fetched_at: string;
  project_id: string;
  charts: {
    trials_new: ChartRcBrut;
    trial_conversion_rate: ChartRcBrut;
    initial_conversion: ChartRcBrut;
  };
  erreur?: string | null;
}

export interface ReponseSuiviRc {
  ok: boolean;
  secret_manquant: boolean;
  depuis_cache: boolean;
  snapshot: SnapshotRc | null;
  erreur?: string;
}

export interface MesureRc {
  nom: string;
  unite: string;
  decimales: number;
}

export interface SegmentRc {
  nom: string;
  total: boolean;
  other: boolean;
}

export interface PointRc {
  date: string;
  segment: string;
  measure: string;
  value: number;
  incomplete: boolean;
}

export interface ChartNormalise {
  nom: string;
  resolution: string;
  measures: MesureRc[];
  segments: SegmentRc[];
  dates: string[];
  points: PointRc[];
  totaux: Record<string, Record<string, number>>;
}
