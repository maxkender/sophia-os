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
    /** 25/11 : faux quand le code WhatsApp n'est pas demandé (code par email seulement). */
    whatsapp_code?: boolean;
    decision: "auto" | "a_traiter" | "refusee" | null;
    handle_tiktok: string | null;
    ferme?: boolean;
  };
  expiree?: boolean;
  /** 26/11 : l'OS a arrêté ce posteur (fiche désactivée ou arrêt) : la page affiche « inscription arrêtée ». */
  arretee?: boolean;
  offre?: { cohorte: string; date_limite: string };
  signature: { signe_at: string } | null;
  etapes: Etape[];
  premier_post: string | null;
  /**
   * Le profil TikTok à créer : SEULEMENT celui du compte créé par l'OS (26/11), le même que sur le dashboard. `pret`
   * faux (pas encore de compte de l'OS) : toutes les valeurs sont null.
   */
  profil_suggere?: { pret?: boolean; handle?: string | null; nom: string | null; bio: string | null; photo_url?: string | null };
  ruul_visible: boolean;
  /** 0858 : la checklist (cochée quand l'OS voit l'étape faite) et les liens de ses boutons. */
  checklist?: { etape: "contrat" | "dashboard" | "ruul" | "tiktok" | "warmup" | "slack" | "premier_post"; fait: boolean }[];
  liens?: { dashboard: string; slack: string; tiktok: string; ruul: string; ruul_personnel: boolean };
  handle?: string | null;
  ruul_email?: string | null;
  compte_os?: boolean;
  /**
   * 26/11 : la connexion au dashboard de l'OS : son adresse, l'identifiant de l'OS (jamais de mot de passe), et si le
   * bouton « Choose my password » peut demander le lien personnel « Set my password » (action `mot_de_passe`).
   */
  connexion?: { dashboard: string; login: string | null; lien_mot_de_passe: boolean };
  /** 26/11 : les sous-étapes Ruul lues dans l'OS (les mêmes que le bloc « Get paid » de son dashboard). */
  ruul_etapes?: { inscrit: boolean; identite: boolean; banque: boolean; pret: boolean; kyc: string | null } | null;
  /** 26/11 : la première paie (lundi de départ + 7 jours), AAAA-MM-JJ. */
  premiere_paie?: string | null;
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

// ---------------------------------------------------------------------------------------------------------------
// Admin (/admin) : la session Supabase Auth d'un admin de l'OS (jetons rendus par la fonction seulement si
// is_admin()). Gardée dans sessionStorage (onglet) ; chaque appel porte le JWT dans `admin_jwt`.
// ---------------------------------------------------------------------------------------------------------------

const CLE_ADMIN = "join_admin";

export interface SessionAdmin {
  access_token: string;
  refresh_token: string;
  expire_at: number;
  email: string | null;
}

export function lireSessionAdmin(): SessionAdmin | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(CLE_ADMIN) ?? "null") as SessionAdmin | null;
    return s?.access_token ? s : null;
  } catch {
    return null;
  }
}

export function garderSessionAdmin(s: SessionAdmin | null): void {
  try {
    if (s) sessionStorage.setItem(CLE_ADMIN, JSON.stringify(s));
    else sessionStorage.removeItem(CLE_ADMIN);
  } catch {
    // stockage indisponible : la session ne survivra pas au rechargement
  }
}

type Jetons = { access_token: string; refresh_token: string; expires_in: number; email: string | null };

function versSession(r: Jetons): SessionAdmin {
  return { access_token: r.access_token, refresh_token: r.refresh_token, expire_at: Date.now() + r.expires_in * 1000, email: r.email };
}

export async function connexionAdmin(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const r = await appeler<Jetons>("admin_connexion", { email, password });
  if (!r.ok) return { ok: false, error: r.error };
  garderSessionAdmin(versSession(r));
  return { ok: true };
}

/** Un appel admin : rafraîchit le jeton s'il expire dans moins de 2 minutes ; 403 : session effacée. */
export async function appelerAdmin<T = Reponse>(action: string, donnees: Record<string, unknown> = {}): Promise<T & Reponse> {
  let s = lireSessionAdmin();
  if (!s) return { ok: false, error: "forbidden" } as T & Reponse;
  if (s.expire_at - Date.now() < 120_000) {
    const r = await appeler<Jetons>("admin_rafraichir", { refresh_token: s.refresh_token });
    if (!r.ok) {
      if (r.error !== "network") garderSessionAdmin(null);
      return { ok: false, error: r.error ?? "forbidden" } as T & Reponse;
    }
    s = versSession(r);
    garderSessionAdmin(s);
  }
  const r = await appeler<T>(action, { ...donnees, admin_jwt: s.access_token });
  if (!r.ok && r.error === "forbidden") garderSessionAdmin(null);
  return r;
}
