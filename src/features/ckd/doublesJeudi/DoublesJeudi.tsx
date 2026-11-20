/**
 * 18/11 (Max), règle du 19/11 (0761) : le doublement du jeudi. Au plus 40 posteurs, classés par vues (vues médianes,
 * puis % de posts viraux sur les 7 derniers jours) ; une proposition par posteur ; pour chacun OUI ou NON et le label
 * du 2e compte (toujours un autre label). Rien ne se fait sans OUI. À côté : ce qui démarre lundi par pays.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, RefreshCw, Sparkles, Star, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { drapeauPays } from "@/features/moteur/pays";
import { cn } from "@/lib/utils";

import {
  ajouterJours, compteurs, creerDeuxieme, decider, formaterVues, jeudiDeLaSemaine, type LabelPossible, lireLabelsPossibles,
  etatReponse, lireLundi, lirePropositions, lireReponses, type LigneLundi, pctViraux, preparerPropositions, type PropositionDouble,
  type ReponseDouble, toutRefuser,
} from "./api";

const dateCourte = (jour: string) => new Date(`${jour}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function DoublesJeudi({ maintenant = new Date(), jeudi: jeudiForce }: { maintenant?: Date; jeudi?: string }) {
  const jeudi = jeudiForce ?? jeudiDeLaSemaine(aujourdhuiParis(maintenant));
  const lundi = ajouterJours(jeudi, 4);
  const qc = useQueryClient();
  const cle = ["doubles-jeudi", jeudi];
  const q = useQuery({ queryKey: cle, queryFn: () => lirePropositions(jeudi) });
  const lundiQ = useQuery({ queryKey: ["doubles-jeudi-lundi", jeudi], queryFn: () => lireLundi(jeudi) });
  const reponsesQ = useQuery({ queryKey: ["doubles-jeudi-reponses", jeudi], queryFn: () => lireReponses(jeudi), refetchInterval: 60_000 });
  const reponseDe = new Map((reponsesQ.data ?? []).map((r) => [r.id, r]));
  const rafraichir = () => {
    void qc.invalidateQueries({ queryKey: cle });
    void qc.invalidateQueries({ queryKey: ["doubles-jeudi-lundi", jeudi] });
  };
  const preparer = useMutation({ mutationFn: () => preparerPropositions(jeudi), onSuccess: rafraichir });
  const refuser = useMutation({ mutationFn: () => toutRefuser(jeudi), onSuccess: rafraichir });
  const liste = q.data ?? [];
  const c = compteurs(liste);

  return (
    <section className="space-y-4" data-testid="doubles-jeudi">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="size-4 text-amber-500" /> Doublement du jeudi</h2>
          <p className="text-sm text-muted-foreground">
            Jeudi {dateCourte(jeudi).replace(/^jeudi /, "")} · au plus 40 posteurs, classés par vues médianes puis % de posts viraux (7 derniers jours).
            Le 2e compte fait son warm-up jusqu'à dimanche et démarre lundi {dateCourte(lundi).replace(/^lundi /, "")} ; la paie passe à 2 comptes ce lundi-là. Rien ne part sans ton OUI.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Compteur n={c.oui} libelle="OUI" ton="text-emerald-700 dark:text-emerald-300" />
          <Compteur n={c.non} libelle="NON" ton="text-zinc-500" />
          <Compteur n={c.reste} libelle="à décider" ton="text-amber-700 dark:text-amber-300" />
          <Button variant="outline" size="sm" onClick={() => preparer.mutate()} disabled={preparer.isPending}>
            <RefreshCw className={cn("size-3.5", preparer.isPending && "animate-spin")} /> {liste.length ? "Compléter" : "Calculer les propositions"}
          </Button>
          <Button variant="outline" size="sm" disabled={!c.reste || refuser.isPending}
            onClick={() => { if (window.confirm(`Refuser les ${c.reste} comptes restants ?`)) refuser.mutate(); }}>
            <X className="size-3.5" /> Tout refuser
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-2">
          {q.isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
          {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
          {!q.isLoading && !liste.length && (
            <div className="rounded-xl border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">
              Pas encore de propositions pour ce jeudi. Elles se calculent jeudi à 7 h (ou avec « Calculer les propositions »).
            </div>
          )}
          {liste.map((p) => <LigneProposition key={p.id} p={p} reponse={reponseDe.get(p.id)} onChange={rafraichir} />)}
        </div>
        <ResumeLundi lundi={lundi} lignes={lundiQ.data ?? []} />
      </div>
    </section>
  );
}

function Compteur({ n, libelle, ton }: { n: number; libelle: string; ton: string }) {
  return <span className="rounded-full border bg-card px-2.5 py-1 text-xs"><b className={cn("tabular-nums", ton)}>{n}</b> {libelle}</span>;
}

function LigneProposition({ p, reponse, onChange }: { p: PropositionDouble; reponse?: ReponseDouble; onChange: () => void }) {
  const [label, setLabel] = React.useState<string | null>(p.label_choisi_id ?? p.label_propose_id);
  const [ouvert, setOuvert] = React.useState(false);
  const labels = useQuery({ queryKey: ["doubles-jeudi-labels", p.compte_id], queryFn: () => lireLabelsPossibles(p.compte_id), enabled: ouvert, staleTime: 10 * 60_000 });
  const oui = useMutation({
    mutationFn: async () => {
      await decider(p.id, "oui", label);
      const r = await creerDeuxieme(p.id);
      if (!r.ok) throw new Error(r.error ?? "création impossible");
    },
    onSettled: onChange,
  });
  const non = useMutation({ mutationFn: () => decider(p.id, "non", null), onSettled: onChange });
  const decide = p.decision !== null;
  const cree = p.statut === "cree";
  const bord = cree ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/10"
    : p.decision === "non" ? "opacity-60" : p.statut === "erreur" ? "border-red-300 dark:border-red-900" : "";
  const options: LabelPossible[] = labels.data ?? [];
  const nomPropose = options.find((l) => l.label_id === label)?.nom ?? (label === p.label_propose_id ? p.label_propose_nom : null);

  return (
    <article className={cn("grid gap-3 rounded-xl border bg-card p-3 shadow-sm sm:grid-cols-[2rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center", bord)} data-testid="proposition-double">
      <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">{p.rang ?? "·"}</span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          <span aria-hidden>{drapeauPays(p.pays)}</span>{p.poster_nom ?? "—"}
          {p.star && <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200"><Star className="size-3 fill-current" /> star</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {p.handle ? <a href={`https://www.tiktok.com/@${p.handle}`} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">@{p.handle}</a> : "—"}
          {" · "}{p.label_nom ?? "?"}{p.app_nom ? ` (${p.app_nom})` : ""}{p.canal_paie === "ruul" ? " · Ruul" : ""}{p.hm_nom ? ` · HM ${p.hm_nom}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div><p className={MICRO_LABEL}>Vues méd.</p><p className="font-semibold tabular-nums">{formaterVues(p.vues_med)}</p></div>
        <div title="Posts viraux : au moins 5 fois les vues médianes de la langue sur la semaine">
          <p className={MICRO_LABEL}>Viraux</p>
          <p className="tabular-nums">{p.viraux ?? 0}/{p.posts ?? 0}{pctViraux(p) != null && <span className="ml-1 text-xs text-muted-foreground">{pctViraux(p)} %</span>}</p>
        </div>
        {p.meilleur_url && (
          <a href={p.meilleur_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            meilleur {formaterVues(p.meilleur_vues)} <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <div className="min-w-0">
        <p className={MICRO_LABEL}>2e compte</p>
        <select
          className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs disabled:opacity-60"
          value={label ?? ""}
          onFocus={() => setOuvert(true)}
          onChange={(e) => setLabel(e.target.value || null)}
          disabled={decide}
          aria-label="Label du 2e compte"
        >
          {!options.some((l) => l.label_id === label) && label && <option value={label}>{nomPropose ?? "label proposé"}</option>}
          {!label && <option value="">Choisir un label</option>}
          {options.map((l) => (
            <option key={l.label_id} value={l.label_id}>
              {l.nom}{l.app_nom ? ` · ${l.app_nom}` : ""}{l.vues_med != null ? ` · ${formaterVues(l.vues_med)}` : ""}{l.autre_app ? "" : " (même app)"}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        {p.decision === "oui" && p.statut !== "erreur" ? (
          <EtatPosteur r={reponse} cree={cree} />
        ) : p.decision === "non" ? (
          <span className="text-xs text-muted-foreground">Refusé</span>
        ) : (
          <>
            <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={!label || oui.isPending || (decide && p.statut !== "erreur")} onClick={() => oui.mutate()}>
              {oui.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {p.statut === "erreur" ? "Réessayer" : "OUI"}
            </Button>
            {!decide && <Button size="sm" variant="outline" disabled={non.isPending} onClick={() => non.mutate()}>NON</Button>}
          </>
        )}
      </div>
      {(p.statut === "erreur" || oui.error) && (
        <p className="text-xs text-destructive sm:col-span-5">{(oui.error as Error | null)?.message ?? p.erreur}</p>
      )}
    </article>
  );
}

/** 0802 : après le OUI, la réponse du posteur (le compte n'est créé qu'à son accord). */
function EtatPosteur({ r, cree }: { r?: ReponseDouble; cree: boolean }) {
  const e = etatReponse(r);
  const ton = e.ton === "ok" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
    : e.ton === "non" ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  return (
    <span className={cn("inline-flex max-w-[16rem] items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", ton)} title={cree ? "2e compte créé" : "2e compte créé à l'accord du posteur"} data-testid="etat-posteur">
      {e.ton === "ok" && <Check className="size-3.5" />}<span className="truncate">{e.texte}</span>
    </span>
  );
}

function ResumeLundi({ lundi, lignes }: { lundi: string; lignes: LigneLundi[] }) {
  const tot = lignes.reduce((a, l) => ({ n: a.n + l.nouveaux, d: a.d + l.doubles, t: a.t + l.total }), { n: 0, d: 0, t: 0 });
  return (
    <aside className="h-fit overflow-hidden rounded-xl border bg-card shadow-sm" data-testid="resume-lundi">
      <div className="border-b bg-muted/40 px-4 py-3">
        <p className={MICRO_LABEL}>Démarrent lundi</p>
        <p className="text-sm font-semibold first-letter:uppercase">{dateCourte(lundi)}</p>
      </div>
      <div className="grid grid-cols-3 gap-px bg-border/70 text-center">
        <Chiffre n={tot.n} libelle="nouveaux" />
        <Chiffre n={tot.d} libelle="2e comptes" />
        <Chiffre n={tot.t} libelle="comptes" fort />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y bg-muted/20 text-left">
            <th className={cn(MICRO_LABEL, "px-4 py-1.5 font-medium")}>Pays</th>
            <th className={cn(MICRO_LABEL, "px-2 py-1.5 text-right font-medium")}>Nouv.</th>
            <th className={cn(MICRO_LABEL, "px-2 py-1.5 text-right font-medium")}>2e</th>
            <th className={cn(MICRO_LABEL, "px-4 py-1.5 text-right font-medium")}>Total</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {lignes.map((l) => (
            <tr key={l.pays}>
              <td className="px-4 py-1.5"><span className="mr-1.5" aria-hidden>{drapeauPays(l.pays)}</span>{l.pays}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{l.nouveaux}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{l.doubles || "—"}</td>
              <td className="px-4 py-1.5 text-right font-semibold tabular-nums">{l.total}</td>
            </tr>
          ))}
          {!lignes.length && <tr><td colSpan={4} className="px-4 py-4 text-center text-xs text-muted-foreground">Personne pour lundi pour l'instant.</td></tr>}
        </tbody>
      </table>
    </aside>
  );
}

function Chiffre({ n, libelle, fort }: { n: number; libelle: string; fort?: boolean }) {
  return (
    <div className="bg-card px-2 py-3">
      <p className={cn("text-xl font-semibold tabular-nums", fort && "text-primary")}>{n}</p>
      <p className="text-[11px] text-muted-foreground">{libelle}</p>
    </div>
  );
}
