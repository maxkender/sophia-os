import { supabase } from "@/lib/supabase/client";

/**
 * 0494 : le pop-up « Start Tuesday » / « Postpone » du dashboard, calculé en
 * direct d'après le dernier relevé TikTok du compte. Rien ne manque (relevé
 * suivant) : plus de pop-up. Keep : pas de pop-up (mon_debut ne rend rien).
 */
export interface EtatDebut {
  cas: "mardi" | "reporter";
  /** Le jour de début : mardi (Start Tuesday) ou le lundi de la nouvelle cohorte (Postpone). */
  debut: string;
  handle: string | null;
  existe: boolean | null;
  abonnements: number | null;
  videos: number | null;
  warmup_started_at: string | null;
  textes: Record<string, string> | null;
}

export const FOLLOWS_MIN = 5;

/** Les textes par défaut (les réglages debut_popup_* de 0494, modifiables dans Settings). */
export const TEXTES_DEBUT: Record<string, string> = {
  debut_popup_mardi: "You can't post yet: {ce_qui_manque}. Do it before Monday 12:00 (Paris) and you start posting on Tuesday {date}.",
  debut_popup_reporter: "You can't post yet: {ce_qui_manque}. Your start has been moved: you start posting on Monday {date}.",
  debut_popup_introuvable: "we can't find your TikTok account: create @{handle} exactly (same spelling)",
  debut_popup_start: "click Start warmup on your dashboard",
  debut_popup_follows: "you still need to follow {n} more accounts with @{handle} (you have {x}/5)",
  debut_popup_posts: "you posted during the warm-up: delete those posts and don't post before your start date",
  // 0498 : 0 follow plus de 24 h après Start warmup (remonté le 1er nov.) : un paragraphe à part.
  debut_popup_follows_bloque:
    "TikTok sometimes limits new accounts. Fill in your profile (photo, name, birthday), verify your phone in TikTok settings, watch videos on the For You page for 10–15 minutes, then follow accounts one by one (not too fast). If it still doesn't work, wait a few hours and try again, then tell us in #questions.",
};

/** TikTok bloque les follows : compte trouvé, 0 follow, Start warmup il y a plus de 24 h. */
export function followsBloquesDebut(e: EtatDebut, maintenant: Date = new Date()): boolean {
  if (!e.warmup_started_at || e.existe !== true || (e.abonnements ?? 0) > 0) return false;
  return maintenant.getTime() - new Date(e.warmup_started_at).getTime() > 24 * 3600_000;
}

const remplir = (modele: string, vars: Record<string, string>) =>
  modele.replace(/\{(\w+)\}/g, (tout, k: string) => (k in vars ? vars[k]! : tout));

/** « 3 November » (le texte dit déjà « Tuesday » ou « Monday »). */
export function dateAnglaise(jour: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${jour}T12:00:00Z`));
}

/** Ce qui manque encore, dans l'ordre : le compte, Start warmup, les abonnements, les posts du warm-up. */
export function manquesDebut(e: EtatDebut): ("introuvable" | "start" | "follows" | "posts")[] {
  const m: ("introuvable" | "start" | "follows" | "posts")[] = [];
  if (e.existe !== true) m.push("introuvable");
  if (!e.warmup_started_at) m.push("start");
  if (e.existe === true && (e.abonnements ?? 0) < FOLLOWS_MIN) m.push("follows");
  if (e.existe === true && (e.videos ?? 0) > 0) m.push("posts");
  return m;
}

/** Le texte du pop-up, ou null quand tout est fait. */
export function texteDebut(e: EtatDebut, maintenant: Date = new Date()): string | null {
  const manques = manquesDebut(e);
  if (manques.length === 0) return null;
  const t = { ...TEXTES_DEBUT, ...(e.textes ?? {}) };
  const handle = (e.handle ?? "").replace(/^@+/, "") || "your_account";
  const x = Math.max(0, e.abonnements ?? 0);
  const vars = { handle, n: String(Math.max(0, FOLLOWS_MIN - x)), x: String(Math.min(x, FOLLOWS_MIN)) };
  const morceaux = manques.map((k) => remplir(t[`debut_popup_${k}`] ?? TEXTES_DEBUT[`debut_popup_${k}`]!, vars).trim()).filter(Boolean);
  const cadre = t[e.cas === "mardi" ? "debut_popup_mardi" : "debut_popup_reporter"]!;
  const texte = remplir(cadre, { ...vars, ce_qui_manque: morceaux.join("; "), date: dateAnglaise(e.debut) }).trim();
  const conseil = followsBloquesDebut(e, maintenant) ? (t.debut_popup_follows_bloque ?? "").trim() : "";
  return conseil ? `${texte}\n\n${conseil}` : texte;
}

export async function lireMonDebut(): Promise<EtatDebut | null> {
  const { data, error } = await supabase.rpc("mon_debut");
  if (error) throw error;
  return ((data ?? []) as EtatDebut[])[0] ?? null;
}
