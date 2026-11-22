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
  };
  signature: { signe_at: string } | null;
  etapes: Etape[];
  premier_post: string | null;
  profil_suggere: { nom: string; bio: string; photo: string };
  ruul_visible: boolean;
}
