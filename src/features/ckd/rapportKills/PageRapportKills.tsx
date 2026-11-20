/**
 * 18/11 (Max) : kills, partie 3. Le rapport du samedi (le même que dans #a-os-tickets) : combien de posteurs et de
 * comptes killés, par HM et par pays ; chaque étape du kill OK / en échec avec les noms ; les milestones à corriger ;
 * et les incohérences de toute la base. « Recalculer » relit tout maintenant, sans rien envoyer sur Slack.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, RefreshCw, TriangleAlert } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { type Inactifs, ligneInactifs } from "./inactifs";

export interface EtapeRapport { etape: string; libelle: string; ok: number; echec: number; a_faire: number; noms: { nom: string; statut: string; detail: string | null }[] }
export interface RapportKills {
  samedi: string;
  complets: number;
  comptes_partiels: number;
  par_hm: { hm: string; complets: number; partiels: number }[];
  par_pays: { pays: string; complets: number; partiels: number }[];
  etapes_complets: EtapeRapport[];
  etapes_partiels: EtapeRapport[];
  milestones_a_corriger: { nom: string; detail: string }[];
  controle: { type: string; libelle: string; nb: number; lignes: { poster_id: string; nom: string; detail: string | null }[] }[];
  /** 0797 : les inactifs arrêtés automatiquement (sans validation) ce samedi. */
  inactifs?: Inactifs;
}
interface Lu { samedi: string; contenu: RapportKills; cree_at: string; slack_at: string | null }

async function lire(): Promise<Lu | null> {
  const { data, error } = await supabase.rpc("samedi_rapport_lire", { p_samedi: null });
  if (error) throw new Error(error.message);
  return (data ?? null) as Lu | null;
}

const STATUT: Record<string, { libelle: string; ton: string }> = {
  echec: { libelle: "échec", ton: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  a_faire: { libelle: "à faire", ton: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  main: { libelle: "à la main", ton: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
};

export function PageRapportKills() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["rapport-kills"], queryFn: lire });
  const recalculer = useMutation({
    mutationFn: () => invoke("support", { action: "rapport_samedi", envoyer: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rapport-kills"] }),
  });
  const r = q.data?.contenu;
  return (
    <div className="space-y-6" data-testid="rapport-kills">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {q.data ? <>Rapport du samedi {jour(q.data.samedi)} · calculé {heure(q.data.cree_at)}{q.data.slack_at ? " · envoyé dans #a-os-tickets" : ""}</> : "Pas encore de rapport."}
        </p>
        <Button variant="outline" size="sm" onClick={() => recalculer.mutate()} disabled={recalculer.isPending}>
          <RefreshCw className={cn("size-3.5", recalculer.isPending && "animate-spin")} /> Recalculer maintenant
        </Button>
      </div>
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {r && (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border/70 shadow-sm lg:grid-cols-4">
            <Chiffre label="Posteurs killés" valeur={r.complets} detail="tous leurs comptes" />
            <Chiffre label="Comptes killés" valeur={r.comptes_partiels} detail="posteurs à 2 comptes" />
            <Chiffre label="Milestones à corriger" valeur={r.milestones_a_corriger.length} detail="passage à 1 compte" alerte={r.milestones_a_corriger.length > 0} />
            <Chiffre label="Incohérences" valeur={r.controle.reduce((t, c) => t + c.nb, 0)} detail="dans toute la base" alerte={r.controle.length > 0} />
          </div>
          {r.inactifs && <LigneInactifs i={r.inactifs} />}
          <div className="grid gap-4 lg:grid-cols-2">
            <Repartition titre="Par HM" lignes={r.par_hm.map((h) => ({ cle: h.hm, c: h.complets, p: h.partiels }))} />
            <Repartition titre="Par pays" lignes={r.par_pays.map((p) => ({ cle: p.pays, c: p.complets, p: p.partiels }))} />
          </div>
          <Etapes titre="Kills complets : les 8 étapes" etapes={r.etapes_complets} />
          <Etapes titre="Un compte sur deux" etapes={r.etapes_partiels} />
          {r.milestones_a_corriger.length > 0 && (
            <Bloc titre="Milestones à corriger (passage à 1 compte)" alerte>
              <ul className="divide-y text-sm">{r.milestones_a_corriger.map((m) => <li key={m.nom + m.detail} className="flex justify-between gap-3 px-4 py-2"><span>{m.nom}</span><span className="text-muted-foreground">{m.detail}</span></li>)}</ul>
            </Bloc>
          )}
          <section className="space-y-2">
            <h2 className="text-base font-semibold">Contrôle de toute la base</h2>
            {!r.controle.length && <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="size-4" /> Aucune incohérence.</p>}
            {r.controle.map((c) => <Controle key={c.type} c={c} />)}
          </section>
        </>
      )}
    </div>
  );
}

const jour = (j: string) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const heure = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

function Chiffre({ label, valeur, detail, alerte }: { label: string; valeur: number; detail: string; alerte?: boolean }) {
  return (
    <div className="bg-card px-5 py-4">
      <p className={MICRO_LABEL}>{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", alerte && "text-amber-700 dark:text-amber-300")}>{valeur}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Bloc({ titre, alerte, children }: { titre: string; alerte?: boolean; children: React.ReactNode }) {
  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", alerte && "border-amber-200 dark:border-amber-900")}>
      <h2 className="border-b bg-muted/40 px-4 py-2 text-sm font-semibold">{titre}</h2>
      {children}
    </section>
  );
}

function Repartition({ titre, lignes }: { titre: string; lignes: { cle: string; c: number; p: number }[] }) {
  return (
    <Bloc titre={titre}>
      <table className="w-full text-sm">
        <thead><tr className="text-left"><th className={cn(MICRO_LABEL, "px-4 py-1.5 font-medium")}> </th><th className={cn(MICRO_LABEL, "px-4 py-1.5 text-right font-medium")}>Posteurs</th><th className={cn(MICRO_LABEL, "px-4 py-1.5 text-right font-medium")}>Comptes (2 comptes)</th></tr></thead>
        <tbody className="divide-y">
          {lignes.map((l) => <tr key={l.cle}><td className="px-4 py-1.5">{l.cle}</td><td className="px-4 py-1.5 text-right tabular-nums">{l.c}</td><td className="px-4 py-1.5 text-right tabular-nums">{l.p || "—"}</td></tr>)}
          {!lignes.length && <tr><td colSpan={3} className="px-4 py-3 text-center text-xs text-muted-foreground">Aucun kill ce samedi.</td></tr>}
        </tbody>
      </table>
    </Bloc>
  );
}

function Etapes({ titre, etapes }: { titre: string; etapes: EtapeRapport[] }) {
  if (!etapes.length) return null;
  return (
    <Bloc titre={titre}>
      <ul className="divide-y">{etapes.map((e) => <LigneEtape key={e.etape} e={e} />)}</ul>
    </Bloc>
  );
}

const CATEGORIE: Record<Inactifs["liste"][number]["categorie"], string> = {
  A: "jamais connecté",
  B: "jamais posté",
  alerte: "bug d'assignation",
};

function LigneInactifs({ i }: { i: Inactifs }) {
  const [ouvert, setOuvert] = React.useState(false);
  return (
    <section className="rounded-xl border shadow-sm" data-testid="inactifs-auto">
      <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
        onClick={() => setOuvert(!ouvert)} disabled={!i.liste.length}>
        <span className="flex-1">{ligneInactifs(i)}</span>
        {i.liste.length > 0 && <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", ouvert && "rotate-180")} />}
      </button>
      {ouvert && (
        <ul className="space-y-1 border-t bg-muted/20 px-6 py-2 text-xs">
          {i.liste.map((n) => (
            <li key={n.nom + n.categorie} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{n.nom}</span>
              <span className="text-muted-foreground">{CATEGORIE[n.categorie]} · {n.canal === "ruul" ? "Ruul" : "Upwork"}</span>
              {n.categorie !== "alerte" && <span className="text-muted-foreground">message de fin : {n.message_fin ? "oui" : "non"}</span>}
              {n.erreur && <span className="text-red-700 dark:text-red-300">{n.erreur}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LigneEtape({ e }: { e: EtapeRapport }) {
  const [ouvert, setOuvert] = React.useState(false);
  const ko = e.echec + e.a_faire;
  return (
    <li>
      <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent" onClick={() => setOuvert(!ouvert)} disabled={!ko}>
        {ko ? <TriangleAlert className="size-4 shrink-0 text-amber-600" /> : <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}
        <span className="w-5 font-mono text-xs text-muted-foreground">{e.etape})</span>
        <span className="flex-1">{e.libelle}</span>
        <span className="tabular-nums text-emerald-700 dark:text-emerald-300">{e.ok} OK</span>
        {e.echec > 0 && <span className="tabular-nums text-red-700 dark:text-red-300">{e.echec} échec</span>}
        {e.a_faire > 0 && <span className="tabular-nums text-amber-700 dark:text-amber-300">{e.a_faire} à faire</span>}
        {ko > 0 && <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", ouvert && "rotate-180")} />}
      </button>
      {ouvert && (
        <ul className="space-y-1 border-t bg-muted/20 px-12 py-2 text-xs">
          {e.noms.map((n) => (
            <li key={n.nom} className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", STATUT[n.statut]?.ton)}>{STATUT[n.statut]?.libelle ?? n.statut}</span>
              <span className="font-medium">{n.nom}</span>
              {n.detail && <span className="text-muted-foreground">{n.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Controle({ c }: { c: RapportKills["controle"][number] }) {
  const [ouvert, setOuvert] = React.useState(false);
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/40" onClick={() => setOuvert(!ouvert)}>
        <span className="flex min-w-9 justify-center rounded-md bg-amber-100 px-2 py-0.5 font-semibold tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-200">{c.nb}</span>
        <span className="flex-1">{c.libelle}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", ouvert && "rotate-180")} />
      </button>
      {ouvert && (
        <ul className="divide-y border-t text-xs">
          {c.lignes.map((l) => <li key={l.poster_id + (l.detail ?? "")} className="flex justify-between gap-3 px-4 py-1.5"><span className="font-medium">{l.nom}</span><span className="text-muted-foreground">{l.detail}</span></li>)}
        </ul>
      )}
    </div>
  );
}
