import * as React from "react";
import { BadgePlateforme } from "@/features/ruul/BadgePlateforme";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lireBrouillonsSamedi, lundiDuProchainSamedi } from "@/features/ckd/decisions/semaineComptes";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * 17/11 (Max) : la « vue tableau » des posteurs, plein écran. Lignes = labels, colonnes = pays ; chaque compte
 * actif est une petite case (@ et nom du posteur), colorée par tranche de vues (moyenne par post, dernier relevé),
 * cerclée si une décision est préparée pour samedi ; le @ ouvre le TikTok, ↗ la fiche (nouvel onglet). Le menu de gauche
 * et la barre du haut restent visibles.
 * Les labels se masquent pour alléger la lecture ; la taille des cases se règle.
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
  /** Vues moyennes par post au dernier relevé (null : pas encore relevé). */
  vues_post?: number | null;
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

/** Le dernier relevé de chaque compte : vues moyennes par post (0742, admin). */
async function lireVuesParPost(): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc("comptes_vues_par_post");
  if (error) throw error;
  return new Map(((data ?? []) as { compte_id: string; vues_post: number }[]).map((r) => [r.compte_id, Number(r.vues_post)]));
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
  const vues = await lireVuesParPost().catch(() => new Map<string, number>());
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
      vues_post: vues.get(l.id) ?? null,
    }));
}

/** Les tranches de vues moyennes par post, de la plus faible à la plus forte (un éventail de couleurs). */
export const TRANCHES: readonly { min: number; libelle: string; classe: string }[] = [
  { min: 0, libelle: "< 300", classe: "bg-red-600 text-white" },
  { min: 300, libelle: "300 – 1k", classe: "bg-orange-500 text-white" },
  { min: 1_000, libelle: "1k – 2k", classe: "bg-amber-400 text-black" },
  { min: 2_000, libelle: "2k – 5k", classe: "bg-yellow-300 text-black" },
  { min: 5_000, libelle: "5k – 10k", classe: "bg-lime-400 text-black" },
  { min: 10_000, libelle: "10k – 20k", classe: "bg-emerald-500 text-white" },
  { min: 20_000, libelle: "20k – 50k", classe: "bg-sky-500 text-white" },
  { min: 50_000, libelle: "50k – 100k", classe: "bg-indigo-600 text-white" },
  { min: 100_000, libelle: "100k +", classe: "bg-fuchsia-600 text-white" },
];
const SANS_VUES = "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300";

export function tranche(vues: number | null | undefined): number {
  if (vues == null) return -1;
  let i = 0;
  for (let k = 0; k < TRANCHES.length; k++) if (vues >= TRANCHES[k]!.min) i = k;
  return i;
}

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

/** Lignes (labels) et colonnes (pays), du plus fourni au moins fourni ; dans une case, les plus vus d'abord. */
export function grille(comptes: CompteTableau[], labelsMasques: ReadonlySet<string> = new Set()) {
  const cases = new Map<string, CompteTableau[]>();
  const parLabel = new Map<string, { nom: string; n: number }>();
  const parPays = new Map<string, number>();
  for (const c of comptes) {
    const labels = (c.labels.length ? c.labels : [{ id: "_", nom: "Sans label" }]).filter((l) => !labelsMasques.has(l.id));
    if (labels.length === 0) continue;
    for (const l of labels) {
      const cle = `${l.id}|${c.pays}`;
      cases.set(cle, [...(cases.get(cle) ?? []), c]);
      parLabel.set(l.id, { nom: l.nom, n: (parLabel.get(l.id)?.n ?? 0) + 1 });
    }
    parPays.set(c.pays, (parPays.get(c.pays) ?? 0) + 1);
  }
  const labels = [...parLabel.entries()].sort((a, b) => b[1].n - a[1].n || a[1].nom.localeCompare(b[1].nom)).map(([id, v]) => ({ id, ...v }));
  const pays = [...parPays.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code, n]) => ({ code, n }));
  const dans = (label: string, p: string) =>
    [...(cases.get(`${label}|${p}`) ?? [])].sort((a, b) => (b.vues_post ?? -1) - (a.vues_post ?? -1) || a.nom.localeCompare(b.nom));
  return { labels, pays, dans };
}

/** Tous les labels présents (pour les masquer), du plus fourni au moins fourni. */
export function tousLesLabels(comptes: CompteTableau[]): { id: string; nom: string; n: number }[] {
  return grille(comptes).labels;
}

function nomPays(code: string): string {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const vuesTexte = (v: number | null | undefined) =>
  v == null ? "pas encore relevé" : v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k vues / post` : `${v} vues / post`;

const TAILLES = [
  { case: "w-24 text-[8px]", icone: "size-2", col: "min-w-[6.5rem]" },
  { case: "w-28 text-[9px]", icone: "size-2.5", col: "min-w-[7.5rem]" },
  { case: "w-36 text-[10px]", icone: "size-3", col: "min-w-[9.5rem]" },
  { case: "w-44 text-xs", icone: "size-3", col: "min-w-[11.5rem]" },
] as const;

function lireMasques(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem("posteurs-tableau-labels-masques") ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function Case({ c, choix, taille }: { c: CompteTableau; choix: string | undefined; taille: number }) {
  const t = tranche(c.vues_post);
  const decision = choix && choix !== "keep" ? LIBELLE_CHOIX[choix] : undefined;
  const kill = !!decision && choix!.startsWith("kill");
  const T = TAILLES[taille]!;
  return (
    <div
      data-compte={c.compte_id}
      data-tranche={t}
      title={`${c.nom}${c.handle ? ` · @${c.handle}` : ""} · ${vuesTexte(c.vues_post)} · ${LIBELLE_CLASSEMENT[c.classement]}${decision ? ` · ${decision}` : ""}`}
      className={cn(
        "rounded-[3px] px-1 py-0.5 leading-tight",
        T.case,
        t < 0 ? SANS_VUES : TRANCHES[t]!.classe,
        decision && (kill ? "ring-2 ring-black ring-offset-1 dark:ring-white" : "ring-2 ring-sky-700 ring-offset-1"),
        c.classement === "inactif" && "opacity-50",
      )}
    >
      <div className="flex items-center gap-0.5">
        {c.handle ? (
          <a href={`https://www.tiktok.com/@${c.handle}`} target="_blank" rel="noreferrer" className="truncate font-semibold hover:underline" title="Ouvrir le TikTok">
            @{c.handle}
          </a>
        ) : (
          <span className="truncate opacity-70">sans @</span>
        )}
        <a href={`/admin/posters?fiche=${c.poster_id}`} target="_blank" rel="noreferrer" aria-label={`Fiche de ${c.nom}`} title={`Fiche de ${c.nom} (nouvel onglet)`}
          className="ml-auto shrink-0 opacity-80 hover:opacity-100">
          <ExternalLink className={T.icone} />
        </a>
      </div>
      <div className="truncate opacity-85">
        {decision && <span className="font-bold" data-testid="choix-samedi">{kill ? "✕ " : "↻ "}{decision} · </span>}
        {c.nom} <BadgePlateforme ruul={c.canal === "ruul"} />
      </div>
    </div>
  );
}

export function VueTableauPosteurs({ onFermer }: { onFermer?: () => void }) {
  const lundi = lundiDuProchainSamedi(aujourdhuiParis());
  const comptes = useQuery({ queryKey: ["posteurs-tableau"], queryFn: lireComptesTableau });
  const brouillons = useQuery({ queryKey: ["samedi-brouillons", lundi], queryFn: () => lireBrouillonsSamedi(lundi) });
  const [f, setF] = React.useState<Filtres>({ cohorte: "", canal: "", classement: "", recherche: "" });
  const [masques, setMasques] = React.useState<Set<string>>(lireMasques);
  const [taille, setTaille] = React.useState(1);
  const [labelsOuverts, setLabelsOuverts] = React.useState(false);
  const tous = comptes.data ?? [];
  const cohortes = [...new Set(tous.map((c) => c.cohorte).filter((x): x is string => !!x))].sort().reverse();
  const visibles = filtrer(tous, f);
  const labels = tousLesLabels(visibles);
  const g = grille(visibles, masques);
  const choixDe = (id: string) => brouillons.data?.get(id)?.choix;

  const basculer = (id: string) => {
    const m = new Set(masques);
    if (m.has(id)) m.delete(id);
    else m.add(id);
    setMasques(m);
    try {
      localStorage.setItem("posteurs-tableau-labels-masques", JSON.stringify([...m]));
    } catch {
      /* stockage indisponible : le choix vaut pour cette visite */
    }
  };

  React.useEffect(() => {
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer?.();
    };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);

  return (
    <div className="fixed inset-x-0 bottom-0 top-14 z-20 flex flex-col border-t bg-background lg:left-64" data-testid="vue-tableau-posteurs">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <span className="font-semibold">Posteurs · vue tableau</span>
        <select aria-label="Cohorte" className="h-8 rounded-md border bg-background px-2 text-xs" value={f.cohorte} onChange={(e) => setF({ ...f, cohorte: e.target.value })}>
          <option value="">Toutes les cohortes</option>
          {cohortes.map((c) => <option key={c} value={c}>Cohorte du {c.slice(8, 10)}/{c.slice(5, 7)}</option>)}
          <option value="aucune">Sans cohorte</option>
        </select>
        <select aria-label="Paie" className="h-8 rounded-md border bg-background px-2 text-xs" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value as Filtres["canal"] })}>
          <option value="">Upwork et Ruul</option>
          <option value="upwork">Upwork</option>
          <option value="ruul">Ruul</option>
        </select>
        <select aria-label="Classement" className="h-8 rounded-md border bg-background px-2 text-xs" value={f.classement} onChange={(e) => setF({ ...f, classement: e.target.value as Filtres["classement"] })}>
          <option value="">Tous les classements</option>
          {(Object.keys(LIBELLE_CLASSEMENT) as Classement[]).map((k) => <option key={k} value={k}>{LIBELLE_CLASSEMENT[k]}</option>)}
        </select>
        <Input aria-label="Rechercher" placeholder="Nom ou @" className="h-8 w-36 text-xs" value={f.recherche} onChange={(e) => setF({ ...f, recherche: e.target.value })} />
        <Button size="sm" variant={masques.size ? "default" : "outline"} onClick={() => setLabelsOuverts(!labelsOuverts)} data-testid="bouton-labels">
          Labels{masques.size ? ` (${masques.size} masqué${masques.size > 1 ? "s" : ""})` : ""}
        </Button>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Taille
          <input type="range" min={0} max={TAILLES.length - 1} value={taille} onChange={(e) => setTaille(Number(e.target.value))} aria-label="Taille des cases" />
        </label>
        <span className="text-xs text-muted-foreground">{visibles.length} comptes</span>
        {onFermer && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={onFermer}><X className="size-4" /> Retour à la liste</Button>
        )}
      </div>
      {labelsOuverts && (
        <div className="flex flex-wrap gap-1 border-b px-3 py-2" data-testid="choix-labels">
          {labels.map((l) => (
            <button key={l.id} type="button" onClick={() => basculer(l.id)} aria-pressed={!masques.has(l.id)}
              className={cn("rounded-full border px-2 py-0.5 text-xs", masques.has(l.id) ? "text-muted-foreground line-through opacity-60" : "bg-foreground text-background")}>
              {l.nom} ({l.n})
            </button>
          ))}
          {masques.size > 0 && (
            <button type="button" className="px-2 text-xs underline" onClick={() => { setMasques(new Set()); try { localStorage.removeItem("posteurs-tableau-labels-masques"); } catch { /* rien */ } }}>
              Tout afficher
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 text-[11px]" data-testid="legende-vues">
        <span className="text-muted-foreground">Vues moyennes par post :</span>
        {TRANCHES.map((t) => <span key={t.min} className={cn("rounded px-1.5 py-0.5", t.classe)}>{t.libelle}</span>)}
        <span className={cn("rounded px-1.5 py-0.5", SANS_VUES)}>pas relevé</span>
        <span className="ml-2 text-muted-foreground">✕ cerclé noir = Kill samedi · cerclé bleu = autre décision ({lundi.slice(8, 10)}/{lundi.slice(5, 7)}) · @ = TikTok · ↗ = fiche (nouvel onglet)</span>
      </div>
      {comptes.isLoading ? <p className="p-4 text-sm text-muted-foreground">Chargement du tableau…</p>
        : comptes.error ? <p className="p-4 text-sm text-destructive">{(comptes.error as Error).message}</p>
        : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 border-b border-r bg-background px-2 py-1 text-left">Label \ Pays</th>
                  {g.pays.map((p) => (
                    <th key={p.code} className={cn("sticky top-0 z-20 border-b bg-background px-1 py-1 text-left font-semibold", TAILLES[taille]!.col)} title={p.code}>
                      {nomPays(p.code)} <span className="font-normal text-muted-foreground">{p.n}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.labels.map((l) => (
                  <tr key={l.id}>
                    <th className="sticky left-0 z-10 whitespace-nowrap border-b border-r bg-background px-2 py-1 text-left align-top font-semibold">
                      {l.nom} <span className="font-normal text-muted-foreground">{l.n}</span>
                    </th>
                    {g.pays.map((p) => (
                      <td key={p.code} className="border-b border-r border-border/40 p-1 align-top">
                        <div className="flex flex-wrap gap-0.5">
                          {g.dans(l.id, p.code).map((c) => (
                            <Case key={c.compte_id} c={c} choix={choixDe(c.compte_id)} taille={taille} />
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
