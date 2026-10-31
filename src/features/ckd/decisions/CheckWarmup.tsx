import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { conversationDe, type Conversations, useConversations } from "@/features/upwork/conversation";
import { LienConversation } from "@/features/upwork/LienConversation";

import { deciderWarmup, lienTiktok, type LigneWarmup, lireCheckWarmup, prochainLundi } from "./checkWarmup";
import { TD, TH } from "./TableauComptes";

const P = "autoOnglets.decisions.dimanche";

const jourHeure = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(iso))
    : "—";

/** Une recrue : @, profil TikTok, derniers relevés, conversation Upwork, et les deux boutons. */
function Ligne({ l, lundi, conv }: { l: LigneWarmup; lundi: string; conv: Conversations | undefined }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const decider = useMutation({
    mutationFn: (d: "ok" | "pas_chaud") => deciderWarmup(l.poster_id, lundi, d),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["check-warmup", lundi] }),
  });
  const tiktok = lienTiktok(l.handle);
  return (
    <tr className="border-b border-border/40 align-top" data-warmup={l.poster_id}>
      <td className={TD}>
        <p className="font-medium">{l.nom ?? "—"}</p>
        <p className="text-muted-foreground">{l.hm_nom ?? "—"}{l.pays ? ` · ${l.pays}` : ""}</p>
        <LienConversation c={conversationDe(conv, { posteur: l.poster_id, contrat: l.contrat_id })} />
      </td>
      <td className={TD}>
        {tiktok ? (
          <a className="underline" href={tiktok} target="_blank" rel="noreferrer" data-testid="lien-tiktok">
            @{l.handle}
          </a>
        ) : (
          <span className="text-muted-foreground">{t(`${P}.sansCompte`)}</span>
        )}
        <p className="text-muted-foreground">
          {l.warmup_started_at ? t(`${P}.demarre`, { date: jourHeure(l.warmup_started_at) }) : t(`${P}.pasDemarre`)}
        </p>
      </td>
      <td className={TD}>
        {l.releves.length === 0 ? (
          <span className="text-muted-foreground">{t(`${P}.aucunReleve`)}</span>
        ) : (
          <ul className="space-y-0.5">
            {l.releves.map((r) => (
              <li key={r.at}>
                <span className="text-muted-foreground">{jourHeure(r.at)} · </span>
                {r.existe === false
                  ? t(`${P}.releve.introuvable`)
                  : r.existe === null
                  ? t(`${P}.releve.illisible`)
                  : t(`${P}.releve.ok`, { abonnements: r.abonnements ?? 0, posts: r.videos ?? 0 })}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className={TD}>
        <div className="flex flex-wrap gap-1">
          {l.risques.map((r) => (
            <Badge key={r} variant="error" data-risque={r}>{t(`${P}.risques.${r}`)}</Badge>
          ))}
        </div>
      </td>
      <td className={TD}>
        {l.decision ? (
          <div className="space-y-0.5">
            <Badge variant={l.decision === "ok" ? "success" : "warning"} data-decision={l.decision}>
              {t(`${P}.decisions.${l.decision}`)}
            </Badge>
            {l.decision === "pas_chaud" && (
              <p className={l.message_statut === "envoye" ? "text-muted-foreground" : "text-destructive"}>
                {l.message_statut === "envoye" ? t(`${P}.messageParti`) : t(`${P}.messagePasParti`, { erreur: l.message_erreur ?? "?" })}
              </p>
            )}
          </div>
        ) : l.groupe === "report" ? (
          <span className="text-muted-foreground">{t(`${P}.reporte`)}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" loading={decider.isPending && decider.variables === "ok"} onClick={() => decider.mutate("ok")}>
              {t(`${P}.ok`)}
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={decider.isPending && decider.variables === "pas_chaud"}
              onClick={() => {
                if (window.confirm(t(`${P}.confirmer`, { nom: l.nom ?? "", canal: l.slack ? "Slack" : "Upwork" }))) decider.mutate("pas_chaud");
              }}
            >
              {t(`${P}.pasChaud`)}
            </Button>
          </div>
        )}
        {decider.error && <p className="text-destructive" role="alert">{(decider.error as Error).message}</p>}
      </td>
    </tr>
  );
}

function Tableau({ lignes, lundi, conv }: { lignes: LigneWarmup[]; lundi: string; conv: Conversations | undefined }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b">
            <th className={TH}>{t(`${P}.colonnes.recrue`)}</th>
            <th className={TH}>{t(`${P}.colonnes.compte`)}</th>
            <th className={TH}>{t(`${P}.colonnes.releves`)}</th>
            <th className={TH}>{t(`${P}.colonnes.risques`)}</th>
            <th className={TH}>{t(`${P}.colonnes.decision`)}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <Ligne key={l.poster_id} l={l} lundi={lundi} conv={conv} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 0474 : Weekly decisions → Sunday. Le dimanche 20:00, les recrues de la
 * cohorte du lendemain qui ont cliqué Start warmup : à risque en haut, les
 * autres repliées ; sans compte ou sans Start warmup : reportées d'une semaine.
 */
export function CheckWarmup() {
  const { t } = useTranslation();
  const [lundi, setLundi] = React.useState(() => prochainLundi(aujourdhuiParis()));
  const lu = useQuery({ queryKey: ["check-warmup", lundi], queryFn: () => lireCheckWarmup(lundi) });
  const liste = lu.data ?? [];
  const conv = useConversations(liste.map((l) => l.poster_id), liste.map((l) => l.contrat_id));
  const risque = liste.filter((l) => l.groupe === "risque");
  const ok = liste.filter((l) => l.groupe === "ok");
  const illisibles = liste.filter((l) => l.groupe === "illisible");
  const report = liste.filter((l) => l.groupe === "report");
  const decides = liste.filter((l) => l.decision).length;
  return (
    <Card data-testid="check-warmup">
      <CardHeader>
        <CardTitle className="text-base">{t(`${P}.titre`, { date: lundi })}</CardTitle>
        <CardDescription>{t(`${P}.aide`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            {t(`${P}.cohorte`)}
            <Input type="date" className="h-8 w-40" value={lundi} onChange={(e) => e.target.value && setLundi(e.target.value)} />
          </label>
          <span className="text-xs text-muted-foreground" data-testid="compteur-warmup">
            {t(`${P}.compteur`, { risque: risque.length, illisible: illisibles.length, ok: ok.length, report: report.length, decides })}
          </span>
        </div>
        {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
        <section className="space-y-1">
          <h3 className="font-medium">{t(`${P}.aRisque`, { n: risque.length })}</h3>
          {risque.length ? <Tableau lignes={risque} lundi={lundi} conv={conv.data} /> : <p className="text-xs text-muted-foreground">{t(`${P}.rien`)}</p>}
        </section>
        <details className="rounded-md border px-3 py-2" data-testid="warmup-illisible">
          <summary className="cursor-pointer font-medium">{t(`${P}.illisibles`, { n: illisibles.length })}</summary>
          <div className="mt-2">{illisibles.length ? <Tableau lignes={illisibles} lundi={lundi} conv={conv.data} /> : null}</div>
        </details>
        <details className="rounded-md border px-3 py-2" data-testid="warmup-ok">
          <summary className="cursor-pointer font-medium">{t(`${P}.autres`, { n: ok.length })}</summary>
          <div className="mt-2">{ok.length ? <Tableau lignes={ok} lundi={lundi} conv={conv.data} /> : null}</div>
        </details>
        <details className="rounded-md border px-3 py-2" data-testid="warmup-report">
          <summary className="cursor-pointer font-medium">{t(`${P}.reportes`, { n: report.length })}</summary>
          <div className="mt-2">{report.length ? <Tableau lignes={report} lundi={lundi} conv={conv.data} /> : null}</div>
        </details>
      </CardContent>
    </Card>
  );
}
