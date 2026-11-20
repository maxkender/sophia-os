/**
 * 19/11 (Max) : sur une ligne de Décisions, un posteur RUUL : son contrat (la signature sur le Hub), ses pastilles Ruul
 * (inscrit, identité, banque, prêt, payable lundi) et son contexte (derniers emails, relances Ruul, ses réponses, ses
 * demandes au support). Jamais de contrat Upwork ni de conversation Upwork.
 */
import { Check, Mail, MessageSquare, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { emailRevenu, enPause, type InfoRuul, jjmm, payableLundi } from "./ruulDecisions";

export { BadgePlateforme } from "@/features/ruul/BadgePlateforme";

function Pastille({ ok, libelle }: { ok: boolean; libelle: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium ring-1",
        ok ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200",
      )}
    >
      {ok ? <Check className="size-2.5" aria-hidden /> : <X className="size-2.5" aria-hidden />}
      {libelle}
    </span>
  );
}

const ilYa = (iso: string, maintenant: Date) => {
  const j = Math.floor((maintenant.getTime() - new Date(iso).getTime()) / 86_400_000);
  return j <= 0 ? "aujourd'hui" : j === 1 ? "hier" : `il y a ${j} j`;
};

export function LigneRuul({ i, maintenant = new Date() }: { i: InfoRuul | undefined; maintenant?: Date }) {
  if (!i) return <p className="mt-1 text-[11px] text-muted-foreground">Ruul : chargement…</p>;
  const email = i.emails[0];
  const relance = i.relances[0];
  const reponse = i.reponses[0];
  const demande = i.demandes[0];
  return (
    <div className="mt-1 max-w-80 space-y-1 text-[11px]" data-testid="ligne-ruul">
      <p className={cn("font-medium", i.signe_at ? "text-foreground" : "text-warning-foreground")} data-testid="contrat-hub">
        {i.signe_at ? `Contrat signé le ${jjmm(i.signe_at)} (Hub)` : "Contrat Hub : signature introuvable"}
      </p>
      <div className="flex flex-wrap gap-1" data-testid="pastilles-ruul">
        <Pastille ok={i.inscrit} libelle="Inscrit sur Ruul" />
        <Pastille ok={i.kyc} libelle="Identité (KYC)" />
        <Pastille ok={i.banque} libelle="Banque" />
        <Pastille ok={i.pret} libelle="Ruul prêt" />
        <Pastille ok={payableLundi(i)} libelle={`Payable lundi : ${payableLundi(i) ? "oui" : "non"}`} />
      </div>
      <div className="space-y-0.5 text-muted-foreground" data-testid="contexte-ruul">
        {email ? (
          <p className="flex items-start gap-1">
            <Mail className="mt-px size-3 shrink-0" aria-hidden />
            <span>
              <span className="text-foreground">{email.objet ?? "Email"}</span> · {ilYa(email.at, maintenant)}
              {emailRevenu(email.statut) && <span className="ml-1 font-medium text-destructive">· email revenu ({email.statut})</span>}
            </span>
          </p>
        ) : (
          <p className="flex items-center gap-1"><Mail className="size-3" aria-hidden /> Aucun email envoyé</p>
        )}
        {relance && (
          <p>
            Relance Ruul « {relance.etape ?? "?"} » · {ilYa(relance.at, maintenant)}
            {(relance.canaux ?? []).length ? ` · par ${(relance.canaux ?? []).join(" + ")}` : ""}
            {relance.erreur ? (enPause(relance.erreur) ? " · DM Slack en pause" : ` · ${relance.erreur}`) : ""}
          </p>
        )}
        {reponse ? (
          <p className="flex items-start gap-1">
            <MessageSquare className="mt-px size-3 shrink-0" aria-hidden />
            <span className="line-clamp-2">Sa réponse ({reponse.canal ?? "?"}, {ilYa(reponse.at, maintenant)}) : « {reponse.texte ?? ""} »</span>
          </p>
        ) : (
          <p>Pas de réponse de sa part</p>
        )}
        {demande && (
          <p className="line-clamp-2">
            <Badge variant="secondary" className="mr-1 h-4 px-1 text-[10px]">Support</Badge>
            {demande.categorie ?? "demande"} · {demande.statut ?? "?"} · {ilYa(demande.at, maintenant)}{demande.texte ? ` : ${demande.texte}` : ""}
          </p>
        )}
        {i.dernier_nudge?.at && (
          <p data-testid="dernier-nudge">
            Nudge {jjmm(i.dernier_nudge.at)} :{" "}
            {(i.dernier_nudge.canaux ?? []).length
              ? `parti par ${(i.dernier_nudge.canaux ?? []).join(" + ")}`
              : enPause(i.dernier_nudge.erreur) ? "pas encore parti (DM Slack en pause) : à envoyer par email + bandeau" : "pas encore parti"}
          </p>
        )}
      </div>
    </div>
  );
}
