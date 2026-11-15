import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Segments } from "@/components/ui/segments";
import { Textarea } from "@/components/ui/textarea";

import { nomBot } from "./api";
import {
  ACTIONS_CARTE,
  aEntrainer,
  BOTS_CARTE,
  type Choix,
  decider,
  LIBELLE_STATUT,
  lireDirect,
  lireQuestionsTypes,
  type QuestionType,
  regrouper,
} from "./entrainement";

type Sous = "entrainer" | "types" | "direct" | "actions";
const SOUS: readonly { cle: Sous; contenu: string }[] = [
  { cle: "entrainer", contenu: "🎯 Entraîner" },
  { cle: "types", contenu: "📚 Questions types" },
  { cle: "direct", contenu: "🔴 En direct" },
  { cle: "actions", contenu: "⚡ Actions possibles" },
];

const quand = (at: string) => new Date(at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/**
 * 13/11 (Max) : « Entraîner le bot ». Même système qu'avant (Help, support_demandes, consignes,
 * règles, documents) : chaque choix devient une réponse validée du catalogue, lue par le bot tout de suite.
 */
export function Entrainer() {
  const [sous, setSous] = React.useState<Sous>("entrainer");
  return (
    <div className="space-y-4" data-testid="entrainer-bot">
      <div className="-mx-1 overflow-x-auto px-1">
        <Segments libelle="Entraîner le bot" options={SOUS} actif={sous} onChange={setSous} className="flex-nowrap whitespace-nowrap" />
      </div>
      {sous === "entrainer" && <ModeEntrainement />}
      {sous === "types" && <QuestionsTypes />}
      {sous === "direct" && <EnDirect />}
      {sous === "actions" && <ActionsPossibles />}
    </div>
  );
}

function useTypes() {
  return useQuery({ queryKey: ["entrainement", "types"], queryFn: lireQuestionsTypes });
}

function BoutonRegrouper() {
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: regrouper, onSuccess: () => qc.invalidateQueries({ queryKey: ["entrainement"] }) });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate()} data-testid="regrouper">
        {m.isPending ? "Lecture de l'historique…" : "Relire l'historique"}
      </Button>
      {m.data && <span className="text-muted-foreground text-xs">{m.data.lues} questions lues → {m.data.types} questions types</span>}
      {m.error && <span className="text-destructive text-xs">{(m.error as Error).message}</span>}
    </span>
  );
}

// --- 1. Mode entraînement : une carte à la fois ------------------------------------------

function ModeEntrainement() {
  const q = useTypes();
  const [passees, setPassees] = React.useState<string[]>([]);
  if (q.error) return <p className="text-destructive text-sm">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-muted-foreground text-sm">…</p>;
  const cartes = aEntrainer(q.data).filter((c) => !passees.includes(c.id));
  const total = aEntrainer(q.data).length;
  const carte = cartes[0];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          En premier : durée du contrat · changer son @ TikTok (action) · suivis bloqués à 7 sur un compte neuf · post sans musique assignée.
          Puis le reste, du plus fréquent au moins fréquent.
        </p>
        <BoutonRegrouper />
      </div>
      {carte ? (
        <CarteEntrainement key={carte.id} q={carte} rang={total - cartes.length + 1} total={total} onPasser={() => setPassees([...passees, carte.id])} />
      ) : (
        <Card><CardContent className="p-6 text-center">Rien à entraîner 👌{passees.length > 0 && <Button variant="link" onClick={() => setPassees([])}>Revoir les cartes passées</Button>}</CardContent></Card>
      )}
    </div>
  );
}

function CarteEntrainement({ q, rang, total, onPasser }: { q: QuestionType; rang: number; total: number; onPasser: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = React.useState<Choix | null>(null);
  const [up, setUp] = React.useState(q.reponse_upwork ?? q.reponse_actuelle ?? "");
  const [ru, setRu] = React.useState(q.reponse_ruul ?? q.reponse_actuelle ?? "");
  const [meme, setMeme] = React.useState(false);
  const [action, setAction] = React.useState(q.action ?? ACTIONS_CARTE[0]!.action);
  const [bot, setBot] = React.useState<string>(q.action_bot ?? "cerveau support");
  const [repAction, setRepAction] = React.useState(ACTIONS_CARTE.find((a) => a.action === (q.action ?? ACTIONS_CARTE[0]!.action))?.modele ?? "");
  const [vers, setVers] = React.useState<"adrien" | "max">(q.escalade_vers ?? "adrien");
  const m = useMutation({
    mutationFn: (p: { choix: Choix; args?: Record<string, unknown> }) => decider(q.id, p.choix, p.args),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entrainement"] }),
  });
  return (
    <Card data-testid="carte-entrainement">
      <CardContent className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">{LIBELLE_STATUT[q.statut]}</span>
          <span className="text-muted-foreground text-xs">
            Carte {rang} / {total} · posée {q.nb} fois {q.upwork && <Badge variant="outline">Upwork</Badge>} {q.ruul && <Badge variant="outline">Ruul</Badge>}
          </span>
        </div>
        <p className="font-semibold text-base">« {q.question} »</p>
        {q.exemples.length > 0 ? (
          <ul className="space-y-1 rounded-md border bg-muted/30 p-3 text-xs">
            {q.exemples.map((e, i) => (
              <li key={i}><b>{e.qui ?? "?"}</b> · {quand(e.at)} · {e.source} — « {e.texte} »</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">Pas encore d'exemple : « Relire l'historique » les ajoute.</p>
        )}
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="pb-1 text-muted-foreground text-xs uppercase">Réponse actuelle du bot</p>
          <p className="whitespace-pre-wrap">{q.reponse_actuelle ?? "Aucune (passée à l'équipe)."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={m.isPending || !q.reponse_actuelle} onClick={() => m.mutate({ choix: "ok" })} data-testid="choix-ok">✅ OK</Button>
          <Button variant={mode === "corriger" ? "default" : "outline"} onClick={() => setMode("corriger")} data-testid="choix-corriger">✏️ Corriger</Button>
          <Button variant={mode === "action" ? "default" : "outline"} onClick={() => setMode("action")} data-testid="choix-action">⚡ Action</Button>
          <Button variant={mode === "escalader" ? "default" : "outline"} onClick={() => setMode("escalader")} data-testid="choix-escalader">↗ Escalader</Button>
          <Button variant="ghost" onClick={onPasser}>Passer →</Button>
        </div>
        {mode === "corriger" && (
          <div className="space-y-2 rounded-md border border-dashed p-3" data-testid="panneau-corriger">
            <p className="font-medium">✏️ Corriger — ta réponse devient LA réponse</p>
            <label className="block space-y-1">
              <span className="text-xs">{meme ? "Réponse (Upwork et Ruul)" : "Version Upwork"}</span>
              <Textarea value={up} onChange={(e) => setUp(e.target.value)} rows={3} aria-label="Version Upwork" />
            </label>
            {!meme && (
              <label className="block space-y-1">
                <span className="text-xs">Version Ruul</span>
                <Textarea value={ru} onChange={(e) => setRu(e.target.value)} rows={3} aria-label="Version Ruul" />
              </label>
            )}
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={meme} onChange={(e) => setMeme(e.target.checked)} /> Même réponse pour Upwork et Ruul</label>
            <Button size="sm" disabled={m.isPending || !up.trim()} onClick={() => m.mutate({ choix: "corriger", args: { reponse_upwork: up, reponse_ruul: meme ? null : ru, meme } })}>
              Enregistrer
            </Button>
          </div>
        )}
        {mode === "action" && (
          <div className="space-y-2 rounded-md border border-dashed p-3" data-testid="panneau-action">
            <p className="font-medium">⚡ Ce que le bot doit FAIRE</p>
            <div className="flex flex-wrap gap-2">
              {ACTIONS_CARTE.map((a) => (
                <label key={a.action} className="flex items-center gap-1 text-xs">
                  <input type="radio" checked={action === a.action} onChange={() => { setAction(a.action); setRepAction(a.modele); }} /> {a.libelle}
                </label>
              ))}
            </div>
            <label className="block space-y-1 text-xs">
              <span>Quel bot</span>
              <select className="h-8 rounded-md border bg-background px-2" value={bot} onChange={(e) => setBot(e.target.value)} aria-label="Quel bot">
                {BOTS_CARTE.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs">Réponse au posteur (après l'action)</span>
              <Textarea value={repAction} onChange={(e) => setRepAction(e.target.value)} rows={2} aria-label="Réponse après l'action" />
            </label>
            <Button size="sm" disabled={m.isPending || !repAction.trim()} onClick={() => m.mutate({ choix: "action", args: { action, bot, reponse: repAction } })}>Enregistrer</Button>
          </div>
        )}
        {mode === "escalader" && (
          <div className="space-y-2 rounded-md border border-dashed p-3" data-testid="panneau-escalader">
            <p className="font-medium">↗ Le bot ne répond pas seul : la demande va à</p>
            <div className="flex gap-3 text-xs">
              <label className="flex items-center gap-1"><input type="radio" checked={vers === "adrien"} onChange={() => setVers("adrien")} /> l'équipe (Adrien)</label>
              <label className="flex items-center gap-1"><input type="radio" checked={vers === "max"} onChange={() => setVers("max")} /> Max</label>
            </div>
            <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ choix: "escalader", args: { vers } })}>Enregistrer</Button>
          </div>
        )}
        {m.error && <p className="text-destructive">{(m.error as Error).message}</p>}
        {m.isSuccess && <p className="text-success">Enregistré : le bot l'utilise dès maintenant.</p>}
      </CardContent>
    </Card>
  );
}

// --- 2. Questions types ------------------------------------------------------------------

function QuestionsTypes() {
  const q = useTypes();
  if (q.error) return <p className="text-destructive text-sm">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-muted-foreground text-sm">…</p>;
  const liste = [...q.data].sort((a, b) => b.nb - a.nb);
  const lues = liste.reduce((s, x) => s + x.nb, 0);
  const aRevoir = liste.filter((x) => x.statut === "a_revoir").length;
  return (
    <div className="space-y-3" data-testid="questions-types">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">{lues} questions lues (Help, chatbot, Slack, email) → {liste.length} questions types.</p>
        <BoutonRegrouper />
      </div>
      {aRevoir > 0 && (
        <p className="rounded-md border border-amber-400/60 bg-amber-50 p-2 text-sm dark:bg-amber-950/30">
          ⚠️ {aRevoir} réponse{aRevoir > 1 ? "s" : ""} à revoir : une règle, une consigne ou un document qu'elle{aRevoir > 1 ? "s" : ""} utilise{aRevoir > 1 ? "nt" : ""} a changé. Elle{aRevoir > 1 ? "s" : ""} revien{aRevoir > 1 ? "nent" : "t"} dans l'entraînement.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground text-xs">
              <th className="py-2 pr-3">Question type</th><th className="py-2 pr-3">Fois</th><th className="py-2 pr-3">Pour</th><th className="py-2 pr-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((x) => (
              <tr key={x.id} className="border-border/40 border-b">
                <td className="py-1.5 pr-3">{x.question}</td>
                <td className="py-1.5 pr-3">{x.nb}</td>
                <td className="py-1.5 pr-3 text-xs">{[x.upwork && "U", x.ruul && "R"].filter(Boolean).join(" ") || "—"}</td>
                <td className="py-1.5 pr-3">{LIBELLE_STATUT[x.statut]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- 3. En direct ------------------------------------------------------------------------

const ISSUES: Record<string, { libelle: string; fleche: string }> = {
  repondu: { libelle: "Répondu seul", fleche: "→ répondu" },
  action: { libelle: "Actions", fleche: "→ ⚡" },
  escalade: { libelle: "Escaladé", fleche: "→ ↗" },
  bloque: { libelle: "Bloqué", fleche: "→ ⛔" },
};
const SOURCES: Record<string, string> = { help: "Help", slack_salon: "Slack", slack_aide: "Slack", email: "Email" };

function EnDirect() {
  const q = useQuery({ queryKey: ["entrainement", "direct"], queryFn: lireDirect, refetchInterval: 30_000 });
  if (q.error) return <p className="text-destructive text-sm">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-muted-foreground text-sm">…</p>;
  const d = q.data;
  return (
    <div className="space-y-3" data-testid="en-direct">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["repondu", "action", "escalade", "bloque"] as const).map((k) => (
          <Card key={k}><CardContent className="p-3"><div className="font-semibold text-2xl">{d.compteurs[k] ?? 0}</div><div className="text-muted-foreground text-xs">{ISSUES[k]!.libelle}</div></CardContent></Card>
        ))}
      </div>
      <ul className="space-y-1 text-sm">
        {d.fil.map((l) => (
          <li key={l.id} className="rounded-md border p-2">
            <span className="text-muted-foreground text-xs">{quand(l.cree_at)} · {SOURCES[l.source] ?? l.source} · {l.nom}</span>
            <span> — « {l.texte.slice(0, 140)} » </span>
            <b>{ISSUES[l.issue]!.fleche}</b>{" "}
            <span className="text-xs">
              {l.issue === "escalade"
                ? l.ticket_at ? "#a-os-tickets (système d'Adrien)" : l.remonte_par ? `remonté par ${nomBot(l.remonte_par)}` : `vers ${l.niveau === "max" ? "Max" : "l'équipe"}${l.bot_responsable && l.bot_responsable !== "max" ? ` (${nomBot(l.bot_responsable)})` : ""}`
                : l.action_faite ?? ""}
            </span>
          </li>
        ))}
        {d.fil.length === 0 && <li className="text-muted-foreground">Rien aujourd'hui.</li>}
      </ul>
      <p className="text-muted-foreground text-xs">« We're checking… » ne part qu'avec une vraie escalade (ligne ↗).</p>
    </div>
  );
}

// --- 4. Actions possibles ----------------------------------------------------------------

/** 13/11 : les actions se règlent maintenant dans l'onglet « Contrôle » (Éteint / Proposer / Agir). */
function ActionsPossibles() {
  return (
    <p className="text-sm" data-testid="actions-possibles">
      Les actions se règlent maintenant dans l'onglet <a className="underline" href="?onglet=controle">🎛️ Contrôle</a> (Éteint / Proposer / Agir, compteur du jour, journal).
    </p>
  );
}
