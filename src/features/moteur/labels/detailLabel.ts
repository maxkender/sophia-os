/**
 * Le détail d'un label, sur la page Labels (20/11) : ce qu'il fait en vues,
 * les comptes TikTok qui le portent, et lesquels ont percé.
 *
 * Tout se lit sur les posts PUBLIÉS et MESURÉS des `FENETRE_JOURS` derniers
 * jours : les `passages`, hors rappels J+7, comme le classement des comptes. Un compte « a percé » quand un de ses posts de la
 * fenêtre atteint `SEUIL_PERCEE` vues : le seuil des percées partout ailleurs
 * dans l'OS (page Podz, posts à rejouer).
 */
import { supabase } from "@/lib/supabase/client";

export const FENETRE_JOURS = 30;
export const SEUIL_PERCEE = 30_000;

export type CaseCompte = "star" | "bien" | "passable" | "mauvaises_vues" | "inactif";

export interface CompteDuLabel {
  id: string;
  handle: string | null;
  langue: string | null;
  pays: string | null;
  classement: CaseCompte | null;
  created_at: string | null;
  warmup_ends_at: string | null;
  posteur: string | null;
}

export interface PostMesure {
  compte_id: string;
  vues: number;
  publie_at: string;
  publie_url: string | null;
}

export type EtatPercee = "perce" | "pas_perce" | "warmup" | "sans_post";

export interface LigneCompte extends CompteDuLabel {
  posts: number;
  mediane: number | null;
  meilleure: number | null;
  meilleureUrl: string | null;
  percees: number;
  etat: EtatPercee;
}

export interface ResumeLabel {
  comptes: LigneCompte[];
  nbComptes: number;
  nbPerces: number;
  nbPasPerces: number;
  nbWarmup: number;
  nbSansPost: number;
  posts: number;
  mediane: number | null;
  vuesTotales: number;
  percees: number;
  meilleure: number | null;
  parCase: Record<CaseCompte, number>;
}

export function mediane(valeurs: readonly number[]): number | null {
  if (valeurs.length === 0) return null;
  const t = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m]! : Math.round((t[m - 1]! + t[m]!) / 2);
}

/** Le résumé du label et une ligne par compte, les comptes qui ont percé d'abord, puis par meilleure vue. */
export function resumerLabel(comptes: readonly CompteDuLabel[], posts: readonly PostMesure[], maintenant = new Date()): ResumeLabel {
  const parCompte = new Map<string, PostMesure[]>();
  for (const p of posts) parCompte.set(p.compte_id, [...(parCompte.get(p.compte_id) ?? []), p]);
  const lignes = comptes.map((c): LigneCompte => {
    const siens = parCompte.get(c.id) ?? [];
    const meilleur = siens.reduce<PostMesure | null>((m, p) => (!m || p.vues > m.vues ? p : m), null);
    const percees = siens.filter((p) => p.vues >= SEUIL_PERCEE).length;
    const enWarmup = Boolean(c.warmup_ends_at && new Date(c.warmup_ends_at).getTime() > maintenant.getTime());
    return {
      ...c,
      posts: siens.length,
      mediane: mediane(siens.map((p) => p.vues)),
      meilleure: meilleur?.vues ?? null,
      meilleureUrl: meilleur?.publie_url ?? null,
      percees,
      etat: percees > 0 ? "perce" : siens.length > 0 ? "pas_perce" : enWarmup ? "warmup" : "sans_post",
    };
  });
  const ordre: Record<EtatPercee, number> = { perce: 0, pas_perce: 1, warmup: 2, sans_post: 3 };
  lignes.sort((a, b) => ordre[a.etat] - ordre[b.etat] || (b.meilleure ?? -1) - (a.meilleure ?? -1) || (a.handle ?? "").localeCompare(b.handle ?? ""));
  const ids = new Set(comptes.map((c) => c.id));
  const duLabel = posts.filter((p) => ids.has(p.compte_id));
  const parCase: Record<CaseCompte, number> = { star: 0, bien: 0, passable: 0, mauvaises_vues: 0, inactif: 0 };
  for (const c of comptes) if (c.classement && c.classement in parCase) parCase[c.classement]++;
  const compte = (e: EtatPercee) => lignes.filter((l) => l.etat === e).length;
  return {
    comptes: lignes,
    nbComptes: lignes.length,
    nbPerces: compte("perce"),
    nbPasPerces: compte("pas_perce"),
    nbWarmup: compte("warmup"),
    nbSansPost: compte("sans_post"),
    posts: duLabel.length,
    mediane: mediane(duLabel.map((p) => p.vues)),
    vuesTotales: duLabel.reduce((s, p) => s + p.vues, 0),
    percees: duLabel.filter((p) => p.vues >= SEUIL_PERCEE).length,
    meilleure: duLabel.length ? Math.max(...duLabel.map((p) => p.vues)) : null,
    parCase,
  };
}

const PAQUET = 100;
const PAGE = 1000;

/** Les comptes actifs qui portent le label, et leurs posts mesurés de la fenêtre. */
export async function lireDetailLabel(labelId: string, maintenant = new Date()): Promise<ResumeLabel> {
  const { data, error } = await supabase
    .from("compte_labels")
    .select("compte_id, comptes!inner(id, handle_tiktok, langue, pays, classement, is_active, created_at, warmup_ends_at, profiles(prenom, nom))")
    .eq("label_id", labelId)
    .eq("comptes.is_active", true);
  if (error) throw error;
  type Ligne = { comptes: { id: string; handle_tiktok: string | null; langue: string | null; pays: string | null; classement: CaseCompte | null; created_at: string | null; warmup_ends_at: string | null; profiles: { prenom: string | null; nom: string | null } | null } | null };
  const comptes: CompteDuLabel[] = ((data ?? []) as unknown as Ligne[]).flatMap((l) => l.comptes ? [{
    id: l.comptes.id, handle: l.comptes.handle_tiktok, langue: l.comptes.langue, pays: l.comptes.pays, classement: l.comptes.classement,
    created_at: l.comptes.created_at, warmup_ends_at: l.comptes.warmup_ends_at,
    posteur: [l.comptes.profiles?.prenom, l.comptes.profiles?.nom].filter(Boolean).join(" ") || null,
  }] : []);
  const depuis = new Date(maintenant.getTime() - FENETRE_JOURS * 86_400_000).toISOString();
  const posts: PostMesure[] = [];
  for (let i = 0; i < comptes.length; i += PAQUET) {
    const ids = comptes.slice(i, i + PAQUET).map((c) => c.id);
    // Une lecture rend 1 000 lignes au plus : page par page.
    for (let debut = 0; ; debut += PAGE) {
      const { data: lot, error: e } = await supabase
        .from("passages")
        .select("id, compte_id, vues, publie_at, publie_url")
        .in("compte_id", ids)
        .gte("publie_at", depuis)
        .not("vues", "is", null)
        .eq("est_rappel", false)
        .order("id")
        .range(debut, debut + PAGE - 1);
      if (e) throw e;
      for (const p of (lot ?? []) as { compte_id: string; vues: number; publie_at: string; publie_url: string | null }[]) {
        posts.push({ compte_id: p.compte_id, vues: Number(p.vues), publie_at: p.publie_at, publie_url: p.publie_url });
      }
      if ((lot ?? []).length < PAGE) break;
    }
  }
  return resumerLabel(comptes, posts, maintenant);
}
