/**
 * « Voir la vue HM » (Admin → Tests, migration 0360) : l'onglet de l'admin
 * prend une vraie session de la HM, en lecture seule garantie par la base.
 *
 * Tout tient dans le sessionStorage de l'onglet : les autres onglets restent
 * admin, et la session de l'admin (localStorage) n'est jamais touchée. Le
 * client Supabase lit `lireVueHm()` à son chargement pour choisir son stockage.
 */

/** Infos de la vue (bandeau, échéance). */
const CLE_VUE = "vue-hm";
/** Session Supabase de la vue, au format de supabase-js (storageKey du client). */
export const CLE_SESSION_VUE = "sb-vue-hm";

export interface VueHm {
  prenom: string;
  /** ISO : au-delà, la base refuse toute requête de la vue. */
  expireAt: string;
}

function stockage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function lireVueHm(): VueHm | null {
  try {
    const brut = stockage()?.getItem(CLE_VUE);
    if (!brut) return null;
    const vue = JSON.parse(brut) as Partial<VueHm>;
    return typeof vue.prenom === "string" && typeof vue.expireAt === "string"
      ? { prenom: vue.prenom, expireAt: vue.expireAt }
      : null;
  } catch {
    return null;
  }
}

/** Entre dans la vue : à suivre d'un rechargement, le client se recrée dessus. */
export function entrerVueHm(vue: VueHm, session: unknown): void {
  const s = stockage();
  if (!s) throw new Error("Stockage de l'onglet indisponible : impossible d'ouvrir la vue.");
  s.setItem(CLE_SESSION_VUE, JSON.stringify(session));
  s.setItem(CLE_VUE, JSON.stringify(vue));
}

export function sortirVueHm(): void {
  const s = stockage();
  s?.removeItem(CLE_SESSION_VUE);
  s?.removeItem(CLE_VUE);
}

/** Millisecondes avant l'échéance (négatif = expirée). */
export function resteVueHm(vue: VueHm, maintenant = Date.now()): number {
  return new Date(vue.expireAt).getTime() - maintenant;
}
