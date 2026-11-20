import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { type CanalReponse, canalDefaut, LIBELLE_CANAL, lireConversation, repondreCanal } from "@/features/support/conversation";
import { cn } from "@/lib/utils";

import { type DemandeJour, type LigneJour, lireDetails, type PosteurJour } from "./api";
import { depuisCourt, derniersEchanges, PASTILLE } from "./tableau";

const quand = (at: string) => new Date(at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const MAX_POSTEURS = 25;

/**
 * 21/11 (Max, point 7) : le panneau de droite d'une ligne : les posteurs concernés ; pour chacun, sa fiche en bref,
 * les 5 derniers échanges (« voir tout »), et la réponse proposée (brouillon ou réponse du bot), modifiable, avec
 * « Envoyer » sur le même canal (repondre_canal). Rien ne part sans le clic de Max.
 */
export function PanneauLigne({ ligne, onFermer, refEdition }: { ligne: LigneJour | null; onFermer: () => void; refEdition: React.RefObject<HTMLTextAreaElement> }) {
  const details = useQuery({
    queryKey: ["aujourdhui", "details", ligne?.id, ligne?.posteurs.length],
    queryFn: () => lireDetails(ligne!.posteurs.slice(0, MAX_POSTEURS), ligne!.demandes.length ? ligne!.demandes : null),
    enabled: Boolean(ligne && ligne.posteurs.length),
  });
  const posteurs = details.data?.posteurs ?? [];
  const demandes = details.data?.demandes ?? [];
  return (
    <Sheet open={Boolean(ligne)} onOpenChange={(o) => !o && onFermer()}>
      <SheetPopup side="right" className="max-w-xl" data-testid="panneau-ligne">
        {ligne && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-start gap-2 pr-8 text-lg">
                <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", PASTILLE[ligne.ton])} aria-hidden />
                {ligne.titre}
              </SheetTitle>
              {ligne.detail && <p className="text-sm text-muted-foreground">{ligne.detail}</p>}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {ligne.depuis && <span>depuis {depuisCourt(ligne.depuis)}</span>}
                {ligne.lien && (
                  <Link to={ligne.lien} className={buttonVariants({ size: "sm" })} data-testid="lien-ligne">{ligne.lien_label ?? "Ouvrir"}</Link>
                )}
              </div>
            </SheetHeader>
            <SheetPanel className="space-y-3">
              {!ligne.posteurs.length && <p className="text-sm text-muted-foreground">Pas de posteur sur cette ligne : le bouton ouvre la page qui la règle.</p>}
              {details.error && <p className="text-sm text-destructive">{(details.error as Error).message}</p>}
              {details.isLoading && <p className="text-sm text-muted-foreground">Chargement des posteurs…</p>}
              {posteurs.map((p, i) => (
                <BlocPosteur
                  key={p.id}
                  posteur={p}
                  demandes={demandes.filter((d) => d.poster_id === p.id)}
                  ouvertParDefaut={i < 3}
                  refEdition={i === 0 ? refEdition : undefined}
                />
              ))}
              {ligne.posteurs.length > MAX_POSTEURS && (
                <p className="text-xs text-muted-foreground">… et {ligne.posteurs.length - MAX_POSTEURS} autres (page de la ligne).</p>
              )}
            </SheetPanel>
          </>
        )}
      </SheetPopup>
    </Sheet>
  );
}

function BlocPosteur({ posteur, demandes, ouvertParDefaut, refEdition }: {
  posteur: PosteurJour; demandes: DemandeJour[]; ouvertParDefaut: boolean; refEdition?: React.Ref<HTMLTextAreaElement>;
}) {
  const [ouvert, setOuvert] = React.useState(ouvertParDefaut);
  const handle = posteur.handles[0];
  return (
    <div className="rounded-lg border" data-testid="bloc-posteur">
      <button type="button" className="flex w-full items-center gap-2 p-3 text-left" onClick={() => setOuvert((o) => !o)}>
        <span className="min-w-0 flex-1 truncate font-medium">{posteur.nom ?? "—"}</span>
        {handle && <span className="truncate text-xs text-muted-foreground">@{handle.replace(/^@/, "")}</span>}
        <Badge variant="outline" className="text-[10px]">{posteur.plateforme === "ruul" ? "Ruul" : "Upwork"}</Badge>
        <span className="text-xs text-muted-foreground">{ouvert ? "▾" : "▸"}</span>
      </button>
      {ouvert && <DetailPosteur posteur={posteur} demandes={demandes} refEdition={refEdition} />}
    </div>
  );
}

function DetailPosteur({ posteur, demandes, refEdition }: { posteur: PosteurJour; demandes: DemandeJour[]; refEdition?: React.Ref<HTMLTextAreaElement> }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["support", "conversation", posteur.id], queryFn: () => lireConversation(posteur.id) });
  const [tout, setTout] = React.useState(false);
  // La demande à laquelle on répond : la plus récente qui a une réponse proposée, sinon la plus récente.
  const demande = [...demandes].reverse().find((d) => d.proposition) ?? demandes[demandes.length - 1] ?? null;
  const [texte, setTexte] = React.useState(demande?.proposition ?? "");
  React.useEffect(() => setTexte(demande?.proposition ?? ""), [demande?.id, demande?.proposition]);
  const [canal, setCanal] = React.useState<CanalReponse | null>(null);
  const c = q.data;
  const canalChoisi: CanalReponse = canal ?? canalDefaut(demande?.source, c?.canaux);
  const canaux: CanalReponse[] = [
    ...(demande ? (["help"] as const) : []),
    ...(c?.canaux.email ? (["email"] as const) : []),
    ...(c?.canaux.slack ? (["slack"] as const) : []),
    ...(c?.canaux.upwork && c?.canaux.plateforme !== "ruul" ? (["upwork"] as const) : []),
  ];
  const envoyer = useMutation({
    mutationFn: () => repondreCanal({ poster_id: posteur.id, canal: canalChoisi, texte: texte.trim(), demande_id: demande?.id ?? null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support"] });
      void qc.invalidateQueries({ queryKey: ["aujourdhui"] });
    },
  });
  const f = c?.fiche;
  const fil = c ? (tout ? c.fil : derniersEchanges(c.fil)) : [];
  return (
    <div className="space-y-3 border-t p-3 text-sm">
      {q.error && <p className="text-destructive">{(q.error as Error).message}</p>}
      {f && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="fiche-resume">
          {f.debut && <span>depuis le {new Date(f.debut).toLocaleDateString("fr-FR")}</span>}
          <span>{f.slack_relie ? "Slack relié" : "Slack non relié"}</span>
          {f.derniere_paie && <span>paie {f.derniere_paie.semaine ?? "—"} : {f.derniere_paie.statut ?? "—"}{f.derniere_paie.montant ? ` (${f.derniere_paie.montant} $)` : ""}</span>}
          {f.ruul?.statut && <span>Ruul : {f.ruul.statut}</span>}
          {f.manque.length > 0 && <span className="text-amber-700 dark:text-amber-400">manque : {f.manque.join(", ")}</span>}
          {posteur.email && <span>{posteur.email}</span>}
        </div>
      )}
      <div className="space-y-1.5" data-testid="fil-court">
        {!c && !q.error && <p className="text-muted-foreground">Chargement de la conversation…</p>}
        {c && fil.length === 0 && <p className="text-muted-foreground">Aucun échange sur les 60 derniers jours.</p>}
        {fil.map((e, i) => (
          <div key={i} className={cn("rounded-md px-2.5 py-1.5", e.sens === "in" ? "mr-8 border bg-background" : e.sens === "action" ? "text-xs text-muted-foreground" : "ml-8 bg-primary/10")}>
            <div className="text-[11px] text-muted-foreground">
              {e.sens === "in" ? "Posteur" : e.qui} · {LIBELLE_CANAL[e.canal] ?? e.canal} · {quand(e.at)}
            </div>
            <div className="whitespace-pre-wrap break-words">{(e.texte ?? "").slice(0, tout ? 4000 : 400)}</div>
          </div>
        ))}
        {c && c.fil.length > fil.length && !tout && (
          <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => setTout(true)}>
            voir tout ({c.fil.length})
          </button>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{demande?.proposition ? "Réponse proposée (modifiable)" : "Ta réponse"}</span>
          <select
            className="ml-auto rounded border bg-background px-1.5 py-0.5 text-xs"
            value={canalChoisi}
            onChange={(ev) => setCanal(ev.target.value as CanalReponse)}
            aria-label="Canal"
          >
            {(canaux.length ? canaux : [canalChoisi]).map((x) => <option key={x} value={x}>{LIBELLE_CANAL[x] ?? x}</option>)}
          </select>
        </div>
        <Textarea ref={refEdition} value={texte} onChange={(ev) => setTexte(ev.target.value)} rows={4} data-testid="reponse-proposee" />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!texte.trim() || envoyer.isPending || envoyer.isSuccess} onClick={() => envoyer.mutate()} data-testid="envoyer">
            {envoyer.isSuccess ? "Envoyé ✓" : envoyer.isPending ? "Envoi…" : `Envoyer (${LIBELLE_CANAL[canalChoisi] ?? canalChoisi})`}
          </Button>
          {envoyer.error && <span className="text-xs text-destructive">{(envoyer.error as Error).message}</span>}
        </div>
      </div>
    </div>
  );
}
