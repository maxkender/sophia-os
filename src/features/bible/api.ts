/** 18/11 (Max) : « Bible des comptes ». Lectures et écritures (admin au sens strict, RLS en base). */
import { supabase } from "@/lib/supabase/client";

import type { AppBible, CompteImporte, FicheBible, Historique, LabelBible, LabelPropose, PostBible, RegleSujet, StatutBible } from "./types";

export async function lireFiches(): Promise<FicheBible[]> {
  const { data, error } = await supabase.from("bible_comptes").select("*").order("ajoute_at", { ascending: false }).limit(2000);
  if (error) throw error;
  return (data ?? []) as FicheBible[];
}

export async function lireProposes(): Promise<LabelPropose[]> {
  const { data, error } = await supabase.from("labels_proposes").select("*").neq("statut", "refuse").order("propose_at");
  if (error) throw error;
  return (data ?? []) as LabelPropose[];
}

export async function lireImportes(): Promise<CompteImporte[]> {
  const { data, error } = await supabase.rpc("bible_importes");
  if (error) throw error;
  return (data ?? []) as CompteImporte[];
}

export async function lireApps(): Promise<AppBible[]> {
  const { data, error } = await supabase.from("applications").select("id, slug, nom").eq("actif", true).order("created_at");
  if (error) throw error;
  return (data ?? []) as AppBible[];
}

export async function lireLabels(): Promise<LabelBible[]> {
  const [l, la] = await Promise.all([
    supabase.from("labels").select("id, nom, style_theme, application_id, manuel").order("nom"),
    supabase.from("label_applications").select("label_id, application_id"),
  ]);
  if (l.error) throw l.error;
  if (la.error) throw la.error;
  const parLabel = new Map<string, string[]>();
  for (const r of (la.data ?? []) as { label_id: string; application_id: string }[]) {
    parLabel.set(r.label_id, [...(parLabel.get(r.label_id) ?? []), r.application_id]);
  }
  return ((l.data ?? []) as (Omit<LabelBible, "apps"> & { manuel: boolean })[])
    .filter((x) => !x.manuel)
    .map((x) => ({ id: x.id, nom: x.nom, style_theme: x.style_theme, application_id: x.application_id, apps: parLabel.get(x.id) ?? [x.application_id] }));
}

export async function lireNoms(ids: string[]): Promise<Record<string, string>> {
  const uniques = [...new Set(ids.filter(Boolean))];
  if (!uniques.length) return {};
  const { data } = await supabase.from("profiles").select("id, prenom, nom, email").in("id", uniques);
  const out: Record<string, string> = {};
  for (const p of (data ?? []) as { id: string; prenom: string | null; nom: string | null; email: string | null }[]) {
    out[p.id] = [p.prenom, p.nom].filter(Boolean).join(" ") || (p.email ?? "").split("@")[0] || "?";
  }
  return out;
}

export async function lireHistorique(id: string): Promise<Historique[]> {
  const { data, error } = await supabase.from("bible_historique").select("*").eq("bible_id", id).order("at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as Historique[];
}

export interface Doublon {
  handle: string;
  bible_id: string | null;
  compte_reference_id: string | null;
}

export async function chercherDoublon(handle: string): Promise<Doublon> {
  const { data, error } = await supabase.rpc("bible_doublon", { p_handle: handle });
  if (error) throw error;
  return data as Doublon;
}

/** Le label proposé de ce nom (encore à valider), sinon un nouveau. */
export async function proposerLabel(p: { nom: string; description_da?: string | null; application_ids: string[]; apps_attente: string[] }): Promise<string> {
  const { data: existant } = await supabase.from("labels_proposes").select("id").eq("nom", p.nom).neq("statut", "refuse").maybeSingle();
  if (existant) return (existant as { id: string }).id;
  const { data, error } = await supabase.from("labels_proposes").insert({
    nom: p.nom, description_da: p.description_da ?? null, application_ids: p.application_ids, apps_attente: p.apps_attente,
  }).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export interface NouvelleFiche {
  handle: string;
  profil_url?: string | null;
  statut?: StatutBible;
  application_ids?: string[];
  apps_attente?: string[];
  label_id?: string | null;
  label_propose?: { nom: string; description_da?: string | null } | null;
  note_import?: string | null;
  angle?: string | null;
  niche_statut?: FicheBible["niche_statut"];
  niche?: string | null;
  polyvalent?: boolean;
  polyvalent_regles?: RegleSujet[];
  langue?: string | null;
  pays?: string | null;
  posts?: string[];
}

export type ResultatAjout = { cree: true; id: string } | { cree: false; doublon: Doublon };

/** Une fiche : si le handle existe déjà (bible ou compte de référence), rien n'est créé. */
export async function ajouterFiche(f: NouvelleFiche): Promise<ResultatAjout> {
  const doublon = await chercherDoublon(f.handle);
  if (doublon.bible_id || doublon.compte_reference_id) return { cree: false, doublon };
  let labelPropose: string | null = null;
  if (f.label_propose?.nom) {
    labelPropose = await proposerLabel({
      nom: f.label_propose.nom, description_da: f.label_propose.description_da ?? null,
      application_ids: f.application_ids ?? [], apps_attente: f.apps_attente ?? [],
    });
  }
  const posts: PostBible[] = (f.posts ?? []).filter(Boolean).slice(0, 3).map((url) => ({ url }));
  const { data, error } = await supabase.from("bible_comptes").insert({
    // 20/11 (Max) : toujours le lien du compte, jamais celui d'une vidéo.
    handle: f.handle, profil_url: `https://www.tiktok.com/@${f.handle.replace(/^@+/, "").toLowerCase()}`, statut: f.statut ?? "a_trier",
    application_ids: f.application_ids ?? [], apps_attente: f.apps_attente ?? [],
    label_id: labelPropose ? null : f.label_id ?? null, label_propose_id: labelPropose,
    note_import: f.note_import || null, angle: f.angle || null, niche_statut: f.niche_statut ?? null, niche: f.niche || null,
    polyvalent: f.polyvalent ?? false, polyvalent_regles: f.polyvalent_regles ?? [], langue: f.langue || null, pays: f.pays || null,
    posts, miniatures_statut: "a_faire",
  }).select("id").single();
  if (error) throw error;
  return { cree: true, id: (data as { id: string }).id };
}

export async function majFiche(id: string, patch: Partial<FicheBible>): Promise<void> {
  const { error } = await supabase.from("bible_comptes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function rafraichirMiniatures(id: string): Promise<{ ok: boolean; statut?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("bible", { body: { action: "miniatures", id } });
  if (error) throw error;
  return data as { ok: boolean; statut?: string; error?: string };
}

export async function validerLabel(id: string): Promise<void> {
  const { error } = await supabase.rpc("label_propose_valider", { p_id: id });
  if (error) throw error;
}

export async function refuserLabel(id: string): Promise<void> {
  const { error } = await supabase.rpc("label_propose_refuser", { p_id: id });
  if (error) throw error;
}

export async function majLabelPropose(id: string, patch: Partial<LabelPropose>): Promise<void> {
  const { error } = await supabase.from("labels_proposes").update(patch).eq("id", id);
  if (error) throw error;
}

/** Les liens courts (vm.tiktok.com…) suivis jusqu'au vrai lien, côté serveur. */
export async function resoudreLiens(urls: string[]): Promise<Record<string, string | null>> {
  if (!urls.length) return {};
  const { data, error } = await supabase.functions.invoke("bible", { body: { action: "resoudre", urls } });
  if (error) throw error;
  const out: Record<string, string | null> = {};
  for (const l of ((data as { liens?: { url: string; resolu: string | null }[] })?.liens ?? [])) out[l.url] = l.resolu;
  return out;
}
