/** Partie E (0411) : `reponses_reglages`, comme recrues-check le lit. */
export interface ValeursReponses {
  seuil: number;
  max_jour: number;
  pause_max_jours: number;
}

export const REPONSES_DEFAUT: ValeursReponses = { seuil: 0.8, max_jour: 3, pause_max_jours: 7 };

/** `reponses_reglages` lu, les valeurs manquantes ou fausses remplacées par le défaut (comme recrues-check). */
export function lireValeursReponses(v: unknown): ValeursReponses {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = (x: unknown, d: number) => (x !== null && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : d);
  return {
    seuil: n(o.seuil, REPONSES_DEFAUT.seuil),
    max_jour: n(o.max_jour, REPONSES_DEFAUT.max_jour),
    pause_max_jours: n(o.pause_max_jours, REPONSES_DEFAUT.pause_max_jours),
  };
}

export function valeursReponsesValides(v: ValeursReponses): boolean {
  return v.seuil >= 0 && v.seuil <= 1 && Number.isInteger(v.max_jour) && v.max_jour >= 0
    && Number.isInteger(v.pause_max_jours) && v.pause_max_jours >= 1;
}

