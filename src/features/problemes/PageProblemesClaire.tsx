import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import { ConversationPosteur } from "@/features/support/Conversation";

import { lireModeProblemes, lireProblemes, type Probleme } from "./api";
import { CarteUnique } from "./CarteUnique";

const BOTS: Record<string, string> = { new_cohort_bot: "new_cohort_bot", control_bot: "control_bot", pay_bot: "pay_bot" };

async function lirePassages(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("problemes_passages");
  if (error) throw new Error(error.message);
  return (data ?? {}) as Record<string, number>;
}

/** « depuis 3 h », « depuis 2 j ». */
export function depuis(at: string, maintenant = Date.now()): string {
  const h = Math.max(0, Math.round((maintenant - new Date(at).getTime()) / 3_600_000));
  return h < 24 ? `depuis ${h} h` : `depuis ${Math.round(h / 24)} j`;
}

/** Les 3 sections : 🔴 urgent, 🤖 chez les bots, 📅 samedi (regroupé par type, le plus nombreux d'abord). */
export function sections(liste: readonly Probleme[]) {
  const urgent = liste.filter((p) => p.niveau === "urgent").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const bots = liste.filter((p) => p.niveau === "bots").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const groupes = new Map<string, Probleme[]>();
  for (const p of liste.filter((x) => x.niveau === "samedi")) groupes.set(p.categorie, [...(groupes.get(p.categorie) ?? []), p]);
  const samedi = [...groupes.entries()].map(([categorie, l]) => ({ categorie, liste: l })).sort((a, b) => b.liste.length - a.liste.length);
  return { urgent, bots, samedi };
}

/** L'action proposée en une ligne (réponse proposée ou action du bot). */
export function actionProposee(p: Probleme): string | null {
  if (p.proposition_reponse?.trim()) return `Répondre : « ${p.proposition_reponse.trim().replace(/\s+/g, " ").slice(0, 110)} »`;
  if (p.proposition_action && p.proposition_action !== "none") return p.proposition_action;
  return null;
}

/**
 * 13/11 (Max) : UNE page « Problèmes » dans le menu. 🔴 Urgent (pour Max), 🤖 Chez les bots (passage n/2),
 * 📅 Samedi (regroupé par type). Une ligne = posteur, problème en une phrase, depuis quand, action proposée,
 * « Régler » ; le clic ouvre la conversation complète et les gestes de la carte.
 */
export function PageProblemesClaire() {
  const q = useQuery({ queryKey: ["problemes", "ouverts"], queryFn: () => lireProblemes("ouverts"), refetchInterval: 60_000 });
  const mode = useQuery({ queryKey: ["problemes", "mode"], queryFn: lireModeProblemes });
  const passages = useQuery({ queryKey: ["problemes", "passages"], queryFn: lirePassages, refetchInterval: 120_000 });
  if (q.error) return <p className="text-destructive text-sm">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-muted-foreground text-sm">Chargement…</p>;
  const s = sections(q.data.filter((p) => p.statut === "ouvert"));
  const m = mode.data ?? "test";
  return (
    <div className="space-y-4" data-testid="page-problemes-claire">
      <Section titre="🔴 Urgent (pour Max)" sous="Paie urgente, STOP, hors plateforme, demande de 2e compte, questions bloquantes urgentes." n={s.urgent.length} testid="section-urgent">
        {s.urgent.map((p) => <Ligne key={p.id} p={p} mode={m} />)}
      </Section>
      <Section titre="🤖 Chez les bots" sous="Ce que chaque bot est en train de régler. Après 2 passages sans action, ça remonte chez toi." n={s.bots.length} testid="section-bots">
        {s.bots.map((p) => <Ligne key={p.id} p={p} mode={m} passages={passages.data?.[p.id] ?? 0} />)}
      </Section>
      <Section titre="📅 Samedi" sous="Le reste, regroupé par type." n={s.samedi.reduce((t, g) => t + g.liste.length, 0)} testid="section-samedi">
        {s.samedi.map((g) => <GroupeSamedi key={g.categorie} categorie={g.categorie} liste={g.liste} mode={m} />)}
      </Section>
    </div>
  );
}

function Section({ titre, sous, n, testid, children }: { titre: string; sous: string; n: number; testid: string; children: React.ReactNode }) {
  return (
    <Card data-testid={testid}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titre} <span className="text-muted-foreground">({n})</span></CardTitle>
        <p className="text-muted-foreground text-xs">{sous}</p>
      </CardHeader>
      <CardContent className="space-y-1">{n === 0 ? <p className="text-muted-foreground text-sm">Rien 👌</p> : children}</CardContent>
    </Card>
  );
}

function GroupeSamedi({ categorie, liste, mode }: { categorie: string; liste: Probleme[]; mode: "test" | "on" }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = React.useState(false);
  return (
    <div className="rounded-md border" data-testid="groupe-samedi">
      <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40" onClick={() => setOuvert(!ouvert)}>
        <span className="font-medium">{t(`problemes.categories.${categorie}`, { defaultValue: categorie })}</span>
        <Badge variant="outline">{liste.length}</Badge>
      </button>
      {ouvert && <div className="space-y-1 border-t p-2">{liste.map((p) => <Ligne key={p.id} p={p} mode={mode} />)}</div>}
    </div>
  );
}

function Ligne({ p, mode, passages }: { p: Probleme; mode: "test" | "on"; passages?: number }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = React.useState(false);
  const action = actionProposee(p);
  return (
    <div className="rounded-md border" data-testid="ligne-probleme">
      <div className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40" onClick={() => setOuvert(!ouvert)}>
        <b className="min-w-[8rem]">{p.nom ?? p.hm_nom ?? "?"}</b>
        <Badge variant="outline">{t(`problemes.categories.${p.categorie}`, { defaultValue: p.categorie })}</Badge>
        <span className="min-w-0 flex-1 truncate">{p.resume}</span>
        <span className="text-muted-foreground text-xs">{depuis(p.created_at)}</span>
        {passages !== undefined && (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-800 text-xs dark:bg-indigo-950 dark:text-indigo-200" data-testid="passages">
            {BOTS[p.proprietaire] ?? p.proprietaire} · passage {Math.min(passages, 2)}/2
          </span>
        )}
        <Button size="sm" variant={ouvert ? "default" : "outline"} onClick={(e) => { e.stopPropagation(); setOuvert(!ouvert); }} data-testid="regler">Régler</Button>
      </div>
      {action && !ouvert && <p className="truncate px-3 pb-2 text-muted-foreground text-xs">→ {action}</p>}
      {ouvert && (
        <div className="space-y-3 border-t bg-muted/10 p-3">
          <CarteUnique p={p} mode={mode} />
          {p.poster_id && <ConversationPosteur posterId={p.poster_id} source={p.canal_reponse ?? null} />}
        </div>
      )}
    </div>
  );
}
