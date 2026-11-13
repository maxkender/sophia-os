import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segments } from "@/components/ui/segments";
import { cn } from "@/lib/utils";

import {
  AGENTS, annuler, CANAUX, LIBELLES_ACTIONS, LIBELLES_JOURNAL, lireControle, lirePropositions, listeActions, type Mode, regler, traiterProposition,
} from "./controle";

const MODES: readonly { cle: Mode; contenu: string }[] = [
  { cle: "eteint", contenu: "Éteint" },
  { cle: "proposer", contenu: "Proposer" },
  { cle: "agir", contenu: "Agir" },
];

const quand = (at: string) => new Date(at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/**
 * 13/11 (Max) : « Tout doit être contrôlable par moi. » STOP général, chaque agent et chaque action
 * (Éteint / Proposer / Agir) avec son compteur du jour, le bot par canal, les plafonds de Pay BOT,
 * les propositions à faire d'un clic, et le journal (qui, quoi, posteur, canal, montant, résultat).
 */
export function Controle() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["controle"], queryFn: lireControle, refetchInterval: 30_000 });
  const props = useQuery({ queryKey: ["controle", "propositions"], queryFn: lirePropositions, refetchInterval: 30_000 });
  const m = useMutation({
    mutationFn: (p: { chemin: string[]; valeur: unknown }) => regler(p.chemin, p.valeur),
    onSettled: () => qc.invalidateQueries({ queryKey: ["controle"] }),
  });
  if (q.error) return <p className="text-destructive text-sm">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-muted-foreground text-sm">Chargement…</p>;
  const { reglage: r, compteurs, propositions } = q.data;
  const stop = r.stop;
  return (
    <div className="space-y-4" data-testid="controle">
      <Card className={cn(stop && "border-destructive bg-destructive/5")}>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{stop ? "⛔ Tout est arrêté" : "STOP général"}</p>
            <p className="text-muted-foreground text-xs">
              Arrête d'un coup le support et tous les bots (aucune réponse, aucune action). L'onboarding continue (emails de bienvenue, relances).
            </p>
          </div>
          <Button
            variant={stop ? "default" : "destructive"}
            size="lg"
            disabled={m.isPending}
            data-testid="stop-general"
            onClick={() => {
              if (!stop && !window.confirm("Tout arrêter (support et bots) ?")) return;
              m.mutate({ chemin: ["stop"], valeur: !stop });
            }}
          >
            {stop ? "Tout relancer" : "⛔ STOP"}
          </Button>
        </CardContent>
      </Card>
      {m.error && <p className="text-destructive text-sm">{(m.error as Error).message}</p>}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Agents</CardTitle>
          <p className="text-muted-foreground text-xs">Éteint : ne fait rien. Proposer : prépare, tu valides. Agir : fait seul et note tout au journal.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {AGENTS.map((a) => (
            <div key={a.cle} className="flex flex-wrap items-center gap-2 border-b pb-2 last:border-0" data-testid={`agent-${a.cle}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{a.libelle}</p>
                <p className="text-muted-foreground text-xs">{a.detail}</p>
              </div>
              <Segments
                libelle={a.libelle}
                options={MODES}
                actif={stop ? "eteint" : r.agents[a.cle] ?? "proposer"}
                disabled={stop || m.isPending}
                onChange={(v) => m.mutate({ chemin: ["agents", a.cle], valeur: v })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Le bot répond sur…</CardTitle>
          <p className="text-muted-foreground text-xs">Décoché : aucun message automatique sur ce canal ; la demande arrive chez toi avec le brouillon.</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          {CANAUX.map((c) => (
            <label key={c.cle} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={!stop && r.canaux[c.cle] !== false}
                disabled={stop || m.isPending}
                onChange={(e) => m.mutate({ chemin: ["canaux", c.cle], valeur: e.target.checked })}
                aria-label={`Le bot répond sur ${c.libelle}`}
              />
              {c.libelle}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Actions</CardTitle>
          <p className="text-muted-foreground text-xs">Une nouvelle action démarre en « Proposer ». Compteur : aujourd'hui (heure de Paris).</p>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {listeActions(r).map((a) => (
            <div key={a} className="flex flex-wrap items-center gap-2 border-b pb-1.5 last:border-0" data-testid={`action-${a}`}>
              <span className="min-w-0 flex-1 text-sm">{LIBELLES_ACTIONS[a] ?? a}</span>
              <span className="text-muted-foreground text-xs" data-testid="compteur">
                {compteurs[a] ?? 0} fait{(compteurs[a] ?? 0) > 1 ? "s" : ""}{propositions[a] ? ` · ${propositions[a]} proposé${propositions[a] > 1 ? "s" : ""}` : ""}
              </span>
              <Segments
                libelle={LIBELLES_ACTIONS[a] ?? a}
                options={MODES}
                actif={stop ? "eteint" : r.actions[a] ?? "proposer"}
                disabled={stop || m.isPending}
                onChange={(v) => m.mutate({ chemin: ["actions", a], valeur: v })}
              />
            </div>
          ))}
          <p className="pt-1 text-muted-foreground text-xs">
            Réponses envoyées aujourd'hui : {compteurs.reponse ?? 0}{propositions.reponse ? ` · ${propositions.reponse} brouillon(s) pour toi` : ""}
          </p>
        </CardContent>
      </Card>

      <PlafondsPay plafondMilestone={r.pay.plafond_milestone} plafondJour={r.pay.plafond_jour} onSave={(k, v) => m.mutate({ chemin: ["pay", k], valeur: v })} />

      <Card data-testid="propositions">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Propositions à valider ({props.data?.length ?? 0})</CardTitle>
          <p className="text-muted-foreground text-xs">Ce que le bot voulait faire (action en « Proposer ») : un clic et c'est fait.</p>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {props.error && <p className="text-destructive text-sm">{(props.error as Error).message}</p>}
          {(props.data ?? []).length === 0 && <p className="text-muted-foreground text-sm">Rien en attente 👌</p>}
          {(props.data ?? []).map((p) => <LigneProposition key={p.id} p={p} />)}
        </CardContent>
      </Card>

      <Journal />
    </div>
  );
}

function PlafondsPay({ plafondMilestone, plafondJour, onSave }: { plafondMilestone: number; plafondJour: number; onSave: (k: string, v: number) => void }) {
  const [ms, setMs] = React.useState(String(plafondMilestone));
  const [jour, setJour] = React.useState(String(plafondJour));
  React.useEffect(() => { setMs(String(plafondMilestone)); setJour(String(plafondJour)); }, [plafondMilestone, plafondJour]);
  return (
    <Card data-testid="plafonds-pay">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Plafonds de Pay BOT</CardTitle>
        <p className="text-muted-foreground text-xs">Au-dessus d'un plafond, ou un montant hors barème (14 / 10 / 7 $, doublé pour un 2e compte) : Pay BOT attend ton OK.</p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Par milestone ($)</span>
          <Input type="number" min={0} value={ms} onChange={(e) => setMs(e.target.value)} className="w-28" aria-label="Plafond par milestone" />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Par jour ($)</span>
          <Input type="number" min={0} value={jour} onChange={(e) => setJour(e.target.value)} className="w-28" aria-label="Plafond par jour" />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={!(Number(ms) >= 0) || !(Number(jour) >= 0) || (Number(ms) === plafondMilestone && Number(jour) === plafondJour)}
          onClick={() => {
            if (Number(ms) !== plafondMilestone) onSave("plafond_milestone", Number(ms));
            if (Number(jour) !== plafondJour) onSave("plafond_jour", Number(jour));
          }}
        >
          Enregistrer
        </Button>
      </CardContent>
    </Card>
  );
}

function LigneProposition({ p }: { p: Awaited<ReturnType<typeof lirePropositions>>[number] }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (faire: boolean) => traiterProposition(p.id, faire),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["controle"] }),
  });
  const action = p.details.action ?? p.quoi;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-sm" data-testid="proposition">
      <span className="text-muted-foreground text-xs">{quand(p.at)}</span>
      <Badge variant="outline">{p.qui}</Badge>
      <span className="min-w-0 flex-1">{LIBELLES_ACTIONS[action] ?? LIBELLES_JOURNAL[action] ?? action}{action === "pay_ok" ? ` : ${p.resultat ?? ""}` : p.details.valeur ? ` : ${p.details.valeur}` : ""}</span>
      {m.data?.resultat ? <span className="text-success text-xs">{m.data.resultat}</span> : (
        <>
          <Button size="sm" disabled={m.isPending} onClick={() => m.mutate(true)}>Faire</Button>
          <Button size="sm" variant="ghost" disabled={m.isPending} onClick={() => m.mutate(false)}>Ignorer</Button>
        </>
      )}
      {m.error && <span className="text-destructive text-xs">{(m.error as Error).message}</span>}
    </div>
  );
}

function Journal() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["controle"], queryFn: lireControle });
  const [qui, setQui] = React.useState("");
  const m = useMutation({ mutationFn: (id: string) => annuler(id), onSettled: () => qc.invalidateQueries({ queryKey: ["controle"] }) });
  const lignes = (q.data?.journal ?? []).filter((l) => !qui || l.qui === qui).slice(0, 150);
  const quis = [...new Set((q.data?.journal ?? []).map((l) => l.qui))].sort();
  return (
    <Card data-testid="journal">
      <CardHeader className="flex-row flex-wrap items-center gap-2 pb-2">
        <CardTitle className="flex-1 text-base">Journal (3 derniers jours)</CardTitle>
        <select className="rounded-md border bg-background px-2 py-1 text-xs" value={qui} onChange={(e) => setQui(e.target.value)} aria-label="Filtrer par agent">
          <option value="">Tous</option>
          {quis.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1.5 pr-2">Quand</th><th className="py-1.5 pr-2">Qui</th><th className="py-1.5 pr-2">Quoi</th><th className="py-1.5 pr-2">Posteur</th>
              <th className="py-1.5 pr-2">Canal</th><th className="py-1.5 pr-2">Montant</th><th className="py-1.5 pr-2">Résultat</th><th />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={`${l.source}-${l.id}`} className={cn("border-border/40 border-b", l.annule_at && "line-through opacity-60")} data-testid="ligne-journal">
                <td className="whitespace-nowrap py-1 pr-2">{quand(l.at)}</td>
                <td className="py-1 pr-2">{l.qui}</td>
                <td className="py-1 pr-2">{LIBELLES_ACTIONS[l.quoi] ?? LIBELLES_JOURNAL[l.quoi] ?? l.quoi}{l.mode !== "agir" && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">{l.mode === "proposer" ? "proposé" : "bloqué"}</Badge>}</td>
                <td className="py-1 pr-2">{l.nom ?? "—"}</td>
                <td className="py-1 pr-2">{l.canal ?? "—"}</td>
                <td className="py-1 pr-2">{l.montant != null ? `${l.montant} $` : "—"}</td>
                <td className="max-w-[24rem] truncate py-1 pr-2" title={l.resultat ?? ""}>{l.resultat ?? "—"}</td>
                <td className="py-1">
                  {l.annulable && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={m.isPending} onClick={() => m.mutate(l.id)}>Annuler</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lignes.length === 0 && <p className="py-2 text-muted-foreground text-sm">Rien pour l'instant.</p>}
        {m.error && <p className="text-destructive text-sm">{(m.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}
