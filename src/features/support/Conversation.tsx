import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { type CanalReponse, canalDefaut, type ElementFil, LIBELLE_CANAL, lireConversation, repondreCanal } from "./conversation";

const quand = (at: string) => new Date(at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

function qui(e: ElementFil): string {
  if (e.sens === "action") return `⚡ ${e.qui}`;
  if (e.sens === "in") return "Posteur";
  return e.qui === "bot" ? "Bot" : e.qui === "équipe" ? "Équipe" : e.qui;
}

/**
 * 13/11 (Max) : tout le fil avec un posteur (ce qu'on lui a envoyé, ses réponses, le bot, les actions,
 * l'équipe), sa fiche à côté, et une case pour lui répondre sur le même canal.
 */
export function ConversationPosteur({ posterId, demandeId = null, source = null }: { posterId: string; demandeId?: string | null; source?: string | null }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["support", "conversation", posterId], queryFn: () => lireConversation(posterId) });
  const [texte, setTexte] = React.useState("");
  const [canal, setCanal] = React.useState<CanalReponse | null>(null);
  const finRef = React.useRef<HTMLDivElement>(null);
  const c = q.data;
  const canalChoisi: CanalReponse = canal ?? canalDefaut(source, c?.canaux);
  const envoyer = useMutation({
    mutationFn: () => repondreCanal({ poster_id: posterId, canal: canalChoisi, texte: texte.trim(), demande_id: demandeId }),
    onSuccess: () => {
      setTexte("");
      void qc.invalidateQueries({ queryKey: ["support"] });
    },
  });
  React.useEffect(() => { finRef.current?.scrollIntoView?.({ block: "end" }); }, [c?.fil.length]);
  if (q.error) return <p className="text-destructive text-sm">{(q.error as Error).message}</p>;
  if (!c) return <p className="text-muted-foreground text-sm">Chargement de la conversation…</p>;
  const f = c.fiche;
  const canauxPossibles: CanalReponse[] = [
    ...(demandeId ? (["help"] as const) : []),
    ...(c.canaux.email ? (["email"] as const) : []),
    ...(c.canaux.slack ? (["slack"] as const) : []),
    ...(c.canaux.upwork && c.canaux.plateforme !== "ruul" ? (["upwork"] as const) : []),
  ];
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_16rem]" data-testid="conversation">
      <div className="space-y-2">
        <div className="max-h-[28rem] space-y-1.5 overflow-y-auto rounded-md border bg-muted/20 p-2" data-testid="fil-conversation">
          {c.fil.length === 0 && <p className="p-2 text-muted-foreground text-sm">Aucun échange sur les 60 derniers jours.</p>}
          {c.fil.map((e, i) => (
            <div
              key={i}
              data-testid="element-fil"
              data-sens={e.sens}
              className={cn(
                "max-w-[90%] rounded-lg px-3 py-1.5 text-sm",
                e.sens === "in" && "mr-auto border bg-background",
                e.sens === "out" && "ml-auto bg-primary/10",
                e.sens === "action" && "mx-auto bg-amber-50 text-amber-900 text-xs dark:bg-amber-950/30 dark:text-amber-200",
              )}
            >
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                <span className="font-medium">{qui(e)}</span>
                <span>· {LIBELLE_CANAL[e.canal] ?? e.canal}</span>
                {e.type && !["message", "fil", "demande", "action"].includes(e.type) && <span>· {e.type}</span>}
                <span>· {quand(e.at)}</span>
                {e.vu && <Badge variant="outline" className="h-4 px-1 text-[10px]" data-testid="vu">vu</Badge>}
                {e.statut && e.canal === "email" && <span>· {e.statut}</span>}
              </div>
              <p className="whitespace-pre-wrap">{e.texte}</p>
            </div>
          ))}
          <div ref={finRef} />
        </div>
        <div className="space-y-1.5 rounded-md border p-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Répondre sur :</span>
            {canauxPossibles.map((k) => (
              <label key={k} className="flex items-center gap-1">
                <input type="radio" name={`canal-${posterId}`} checked={canalChoisi === k} onChange={() => setCanal(k)} /> {LIBELLE_CANAL[k]}
              </label>
            ))}
          </div>
          <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={3} placeholder="Ta réponse (en anglais)…" aria-label="Répondre au posteur" />
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={texte.trim().length < 2 || envoyer.isPending || !canauxPossibles.includes(canalChoisi)} onClick={() => envoyer.mutate()} data-testid="envoyer-conversation">
              Envoyer sur {LIBELLE_CANAL[canalChoisi]}
            </Button>
            {envoyer.isSuccess && <span className="text-success text-xs">Envoyé.</span>}
            {envoyer.error && <span className="text-destructive text-xs">{(envoyer.error as Error).message}</span>}
          </div>
        </div>
      </div>
      <aside className="space-y-1 rounded-md border bg-muted/30 p-3 text-xs" data-testid="fiche-conversation">
        <p className="font-semibold text-sm">{f?.nom ?? "?"}</p>
        {f ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            <dt className="text-muted-foreground">Plateforme</dt><dd>{f.plateforme === "ruul" ? "Ruul" : "Upwork"}{f.debut ? ` · début ${f.debut}` : ""}</dd>
            <dt className="text-muted-foreground">Étape</dt><dd>{f.manque.length ? `manque : ${f.manque.join(", ")}` : "tout fait"}</dd>
            <dt className="text-muted-foreground">Paie</dt>
            <dd>{f.derniere_paie?.semaine ? `${f.derniere_paie.semaine} · ${f.derniere_paie.statut ?? "?"}${f.derniere_paie.montant != null ? ` · ${f.derniere_paie.montant} $` : ""}` : "—"}</dd>
            {f.ruul && <><dt className="text-muted-foreground">Ruul</dt><dd>{f.ruul.statut ?? "?"}</dd></>}
            <dt className="text-muted-foreground">Slack</dt><dd>{f.slack_relie ? "relié" : "non"}</dd>
            {f.tiktok && <><dt className="text-muted-foreground">TikTok</dt><dd>@{f.tiktok}</dd></>}
          </dl>
        ) : <p className="text-muted-foreground">Pas de fiche.</p>}
      </aside>
    </div>
  );
}
