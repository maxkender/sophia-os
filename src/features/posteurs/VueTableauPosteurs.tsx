import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { Input } from "@/components/ui/input";
import { lireBrouillonsSamedi, lundiDuProchainSamedi } from "@/features/ckd/decisions/semaineComptes";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * 17/11 (Max) : la « vue tableau » des posteurs. Lignes = labels, colonnes = pays ; dans chaque case, les
 * comptes actifs de ce label et de ce pays, avec le lien TikTok, le lien de la fiche (nouvel onglet), la
 * couleur du classement (star → mauvaises vues) et la décision préparée pour samedi (Kill, Recreate…).
 */

export type Classement = "star" | "bien" | "passable" | "mauvaises_vues" | "inactif";

export interface CompteTableau {
  compte_id: string;
  poster_id: string;
  nom: string;
  handle: string | null;
  pays: string;
  labels: { id: string; nom: string }[];
  classement: Classement;
  cohorte: string | null;
  canal: "upwork" | "ruul";
}

interface LigneBrute {
  id: string;
  poster_id: string;
  handle_tiktok: string | null;
  pays: string | null;
  classement: Classement | null;
  profiles: { prenom: string | null; nom: string | null; cohorte_lundi: string | null; canal_paie: string | null; is_active: boolean } | null;
  compte_labels: { labels: { id: string; nom: string } | null }[] | null;
}

export async function lireComptesTableau(): Promise<CompteTableau[]> {
  const lignes: LigneBrute[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase
      .from("comptes")
      .select("id, poster_id, handle_tiktok, pays, classement, profiles(prenom, nom, cohorte_lundi, canal_paie, is_active), compte_labels(labels(id, nom))")
      .eq("is_active", true)
      .neq("type_compte", "cm")
      .order("id")
      .range(debut, debut + 999);
    if (error) throw error;
    lignes.push(...((data ?? []) as unknown as LigneBrute[]));
    if ((data ?? []).length < 1000) break;
  }
  return lignes
    .filter((l) => l.profiles?.is_active !== false)
    .map((l) => ({
      compte_id: l.id,
      poster_id: l.poster_id,
      nom: [l.profiles?.prenom, l.profiles?.nom].filter(Boolean).join(" ") || "?",
      handle: l.handle_tiktok,
      pays: (l.pays ?? "").toUpperCase() || "??",
      labels: (l.compte_labels ?? []).map((x) => x.labels).filter((x): x is { id: string; nom: string } => !!x),
      classement: l.classement ?? "passable",
      cohorte: l.profiles?.cohorte_lundi ?? null,
      canal: l.profiles?.canal_paie === "ruul" ? "ruul" : "upwork",
    }));
}

export const COULEUR_CLASSEMENT: Record<Classement, string> = {
  star: "border-amber-400 bg-amber-100 dark:bg-amber-500/20",
  bien: "border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10",
  passable: "border-border bg-background",
  mauvaises_vues: "border-red-300 bg-red-50 dark:bg-red-500/15",
  inactif: "border-zinc-300 bg-zinc-100 text-muted-foreground dark:bg-zinc-500/15",
};

export const LIBELLE_CLASSEMENT: Record<Classement, string> = {
  star: "⭐ Star",
  bien: "Bien",
  passable: "Passable",
  mauvaises_vues: "Très peu de vues",
  inactif: "Inactif",
};

const LIBELLE_CHOIX: Record<string, string> = {
  kill: "Kill samedi",
  kill_np: "Kill sans paie",
  double: "Doubler",
  recreate: "Recreate",
  pause: "Pause",
  repondre: "Répondre",
};

export interface Filtres {
  cohorte: string;
  canal: "" | "upwork" | "ruul";
  classement: "" | Classement;
  recherche: string;
}

export function filtrer(comptes: CompteTableau[], f: Filtres): CompteTableau[] {
  const r = f.recherche.trim().toLowerCase().replace(/^@/, "");
  return comptes.filter((c) =>
    (!f.cohorte || (f.cohorte === "aucune" ? !c.cohorte : c.cohorte === f.cohorte)) &&
    (!f.canal || c.canal === f.canal) &&
    (!f.classement || c.classement === f.classement) &&
    (!r || c.nom.toLowerCase().includes(r) || (c.handle ?? "").toLowerCase().includes(r)));
}

/** Lignes (labels) et colonnes (pays), triées du plus fourni au moins fourni ; une case = ses comptes. */
export function grille(comptes: CompteTableau[]) {
  const cases = new Map<string, CompteTableau[]>();
  const parLabel = new Map<string, { nom: string; n: number }>();
  const parPays = new Map<string, number>();
  for (const c of comptes) {
    const labels = c.labels.length ? c.labels : [{ id: "_", nom: "Sans label" }];
    for (const l of labels) {
      const cle = `${l.id}|${c.pays}`;
      cases.set(cle, [...(cases.get(cle) ?? []), c]);
      parLabel.set(l.id, { nom: l.nom, n: (parLabel.get(l.id)?.n ?? 0) + 1 });
    }
    parPays.set(c.pays, (parPays.get(c.pays) ?? 0) + 1);
  }
  const labels = [...parLabel.entries()].sort((a, b) => b[1].n - a[1].n || a[1].nom.localeCompare(b[1].nom)).map(([id, v]) => ({ id, ...v }));
  const pays = [...parPays.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code, n]) => ({ code, n }));
  const ordre: Record<Classement, number> = { star: 0, bien: 1, passable: 2, mauvaises_vues: 3, inactif: 4 };
  const dans = (label: string, p: string) =>
    [...(cases.get(`${label}|${p}`) ?? [])].sort((a, b) => ordre[a.classement] - ordre[b.classement] || (a.handle ?? "").localeCompare(b.handle ?? ""));
  return { labels, pays, dans };
}

function nomPays(code: string): string {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function PuceCompte({ c, choix }: { c: CompteTableau; choix: string | undefined }) {
  const fiche = `/admin/posters?fiche=${c.poster_id}`;
  return (
    <div className={cn("rounded border px-1.5 py-1 text-xs leading-tight", COULEUR_CLASSEMENT[c.classement])} data-compte={c.compte_id} data-classement={c.classement}>
      <div className="flex items-center gap-1">
        {c.handle ? (
          <a href={`https://www.tiktok.com/@${c.handle}`} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline" title="Ouvrir le TikTok">
            @{c.handle}
          </a>
        ) : (
          <span className="text-muted-foreground">sans @</span>
        )}
        <a href={fiche} target="_blank" rel="noreferrer" className="ml-auto text-muted-foreground hover:text-foreground" title={`Fiche de ${c.nom} (nouvel onglet)`} aria-label={`Fiche de ${c.nom}`}>
          <ExternalLink className="size-3" />
        </a>
      </div>
      <div className="truncate text-[11px] text-muted-foreground">{c.nom}{c.canal === "ruul" ? " · Ruul" : ""}</div>
      {choix && choix !== "keep" && LIBELLE_CHOIX[choix] && (
        <div className={cn("mt-0.5 rounded px-1 text-[10px] font-semibold", choix.startsWith("kill") ? "bg-red-600 text-white" : "bg-sky-600 text-white")} data-testid="choix-samedi">
          {LIBELLE_CHOIX[choix]}
        </div>
      )}
    </div>
  );
}

export function VueTableauPosteurs() {
  const lundi = lundiDuProchainSamedi(aujourdhuiParis());
  const comptes = useQuery({ queryKey: ["posteurs-tableau"], queryFn: lireComptesTableau });
  const brouillons = useQuery({ queryKey: ["samedi-brouillons", lundi], queryFn: () => lireBrouillonsSamedi(lundi) });
  const [f, setF] = React.useState<Filtres>({ cohorte: "", canal: "", classement: "", recherche: "" });
  const tous = comptes.data ?? [];
  const cohortes = [...new Set(tous.map((c) => c.cohorte).filter((x): x is string => !!x))].sort().reverse();
  const visibles = filtrer(tous, f);
  const g = grille(visibles);
  const choixDe = (id: string) => brouillons.data?.get(id)?.choix;

  if (comptes.isLoading) return <p className="text-sm text-muted-foreground">Chargement du tableau…</p>;
  if (comptes.error) return <p className="text-sm text-destructive">{(comptes.error as Error).message}</p>;

  return (
    <div className="space-y-3" data-testid="vue-tableau-posteurs">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Cohorte" className="h-9 rounded-md border bg-background px-2 text-sm" value={f.cohorte} onChange={(e) => setF({ ...f, cohorte: e.target.value })}>
          <option value="">Toutes les cohortes</option>
          {cohortes.map((c) => <option key={c} value={c}>Cohorte du {c.slice(8, 10)}/{c.slice(5, 7)}</option>)}
          <option value="aucune">Sans cohorte</option>
        </select>
        <select aria-label="Paie" className="h-9 rounded-md border bg-background px-2 text-sm" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value as Filtres["canal"] })}>
          <option value="">Upwork et Ruul</option>
          <option value="upwork">Upwork</option>
          <option value="ruul">Ruul</option>
        </select>
        <select aria-label="Classement" className="h-9 rounded-md border bg-background px-2 text-sm" value={f.classement} onChange={(e) => setF({ ...f, classement: e.target.value as Filtres["classement"] })}>
          <option value="">Tous les classements</option>
          {(Object.keys(LIBELLE_CLASSEMENT) as Classement[]).map((k) => <option key={k} value={k}>{LIBELLE_CLASSEMENT[k]}</option>)}
        </select>
        <Input aria-label="Rechercher" placeholder="Nom ou @" className="h-9 w-44" value={f.recherche} onChange={(e) => setF({ ...f, recherche: e.target.value })} />
        <span className="text-sm text-muted-foreground">{visibles.length} comptes</span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(LIBELLE_CLASSEMENT) as Classement[]).map((k) => (
          <span key={k} className={cn("rounded border px-1.5 py-0.5", COULEUR_CLASSEMENT[k])}>{LIBELLE_CLASSEMENT[k]}</span>
        ))}
        <span className="text-muted-foreground">· décision du samedi {lundi.slice(8, 10)}/{lundi.slice(5, 7)} + 5 j : à préparer dans la fiche</span>
      </div>
      <div className="max-h-[75vh] overflow-auto rounded-md border">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-40 border-b border-r bg-background p-2 text-left">Label \ Pays</th>
              {g.pays.map((p) => (
                <th key={p.code} className="sticky top-0 z-20 min-w-44 border-b bg-background p-2 text-left font-semibold" title={p.code}>
                  {nomPays(p.code)} <span className="font-normal text-muted-foreground">({p.n})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.labels.map((l) => (
              <tr key={l.id}>
                <th className="sticky left-0 z-10 border-b border-r bg-background p-2 text-left align-top font-semibold">
                  {l.nom} <span className="font-normal text-muted-foreground">({l.n})</span>
                </th>
                {g.pays.map((p) => {
                  const dedans = g.dans(l.id, p.code);
                  return (
                    <td key={p.code} className="border-b p-1 align-top">
                      <div className="flex flex-col gap-1">
                        {dedans.map((c) => <PuceCompte key={c.compte_id} c={c} choix={choixDe(c.compte_id)} />)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
