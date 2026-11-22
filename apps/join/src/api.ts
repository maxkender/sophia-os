// L'API de la fonction Edge `join` (POST JSON { action, ... }). VITE_JOIN_API peut la remplacer.
export const API: string =
  import.meta.env.VITE_JOIN_API || "https://mbikecieskoobeizixig.supabase.co/functions/v1/join";

const CLE_JETON = "join_jeton";

export function lireJeton(): string | null {
  try {
    return localStorage.getItem(CLE_JETON);
  } catch {
    return null;
  }
}

export function garderJeton(j: string | null): void {
  try {
    if (j) localStorage.setItem(CLE_JETON, j);
    else localStorage.removeItem(CLE_JETON);
  } catch {
    // stockage indisponible : la session ne survivra pas au rechargement
  }
}

export type Reponse = { ok: boolean; error?: string; [k: string]: unknown };

export async function appeler<T = Reponse>(action: string, donnees: Record<string, unknown> = {}): Promise<T & Reponse> {
  const jeton = lireJeton();
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) },
      body: JSON.stringify({ action, ...donnees }),
    });
    return (await r.json()) as T & Reponse;
  } catch {
    return { ok: false, error: "network" } as T & Reponse;
  }
}

export interface PaysPaie {
  pays: string;
  zone: string;
  tarif: number | null;
}

export interface Etape {
  etape: string;
  statut: string;
  valeur: Record<string, unknown> | null;
}

export interface Moi {
  mode: string;
  candidature: {
    id: string;
    prenom: string;
    email: string;
    whatsapp: string;
    email_verifie: boolean;
    whatsapp_verifie: boolean;
    decision: "auto" | "a_traiter" | null;
    handle_tiktok: string | null;
    ferme?: boolean;
  };
  expiree?: boolean;
  offre?: { cohorte: string; date_limite: string };
  signature: { signe_at: string } | null;
  etapes: Etape[];
  premier_post: string | null;
  profil_suggere: { nom: string; bio: string; photo: string };
  ruul_visible: boolean;
}

// Provenance (?ref=, utm_*, fbclid) : gardée 30 jours dans le navigateur, envoyée avec la candidature.
const CLE_SOURCE = "join_source";
const TRENTE_JOURS = 30 * 24 * 3600 * 1000;

export function capterSource(): void {
  try {
    const p = new URLSearchParams(location.search);
    const cles = ["ref", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"];
    const trouve = Object.fromEntries(cles.map((k) => [k, p.get(k)]).filter(([, v]) => v)) as Record<string, string>;
    if (!Object.keys(trouve).length) return;
    const avant = lireSource();
    // Le dernier code de parrainage / UTM l'emporte ; le reste est gardé.
    localStorage.setItem(CLE_SOURCE, JSON.stringify({
      ...avant, ...trouve, landing: `${location.pathname}${location.search}`.slice(0, 200), at: new Date().toISOString(),
    }));
  } catch {
    // stockage indisponible
  }
}

export function lireSource(): Record<string, string> {
  try {
    const s = JSON.parse(localStorage.getItem(CLE_SOURCE) ?? "{}") as Record<string, string>;
    if (s.at && Date.now() - new Date(s.at).getTime() > TRENTE_JOURS) {
      localStorage.removeItem(CLE_SOURCE);
      return {};
    }
    return s;
  } catch {
    return {};
  }
}
