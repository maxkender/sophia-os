import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OngletsAuto, PanneauOnglet } from "@/features/auto/OngletsAuto";
import { lireMessagesEnvoyes, messageRepondu, type MessageEnvoye } from "@/features/auto/sent/api";
import { useLibelleType } from "@/features/auto/sent/journal";
import { useOnglet } from "@/features/auto/useOnglet";
import { lireInterrupteurs } from "@/features/interrupteurs/api";
import { localeDate } from "@/locales/localeDate";
import { BoutonContestation, RenvoiPaieDisputes } from "@/features/disputes/PageDisputes";
import { cn } from "@/lib/utils";

import { ReglagesReponses } from "./ReglagesReponses";
import {
  CAS_REPONSE,
  corrigerReponse,
  lireKillsArretes,
  lireReponses,
  lireSlackPosteurs,
  type CasReponse,
  type KillArrete,
  type ReponsePosteur,
} from "./api";
import { killArretePar, listesReponses, ONGLETS_REPONSES, type OngletReponses } from "./listes";
import { type Conversations, conversationDe, useConversations } from "@/features/upwork/conversation";
import { LienConversation } from "@/features/upwork/LienConversation";

const CLE = ["reponses-posteurs"] as const;

const VARIANTE_CAS: Record<CasReponse, "error" | "info" | "warning" | "secondary" | "success"> = {
  stop: "error",
  travail: "info",
  paie: "warning",
  absent: "secondary",
  a_lire: "warning",
  accuse: "success",
};

function il_y_a_14_jours(): string {
  return new Date(Date.now() - 14 * 86_400_000).toISOString();
}

function useDate() {
  const { i18n } = useTranslation();
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
  return (iso: string) => fmt.format(new Date(iso));
}

/** Ce qui entoure un message reçu : le message de l'OS auquel il répond, le Kill qu'il a arrêté, le lien Slack. */
interface Contexte {
  envoyes: readonly MessageEnvoye[];
  kills: readonly KillArrete[];
  slack: ReadonlyMap<string, string>;
  /** 0469 : la conversation Upwork de chaque posteur. */
  conv?: Conversations;
}

/** Un message reçu : le texte, le cas, ce que l'OS a fait ; « Mauvais cas », « Lu » et le lien vers la conversation. */
function Ligne({ r, ctx }: { r: ReponsePosteur; ctx: Contexte }) {
  const { t } = useTranslation();
  const date = useDate();
  const libelleType = useLibelleType();
  const qc = useQueryClient();
  const [corriger, setCorriger] = React.useState(false);
  const maj = useMutation({
    mutationFn: ({ cas, lu }: { cas: CasReponse | null; lu: boolean }) => corrigerReponse(r.id, cas, lu),
    onSuccess: () => {
      setCorriger(false);
      void qc.invalidateQueries({ queryKey: CLE });
    },
  });
  const cas = r.corrige_cas ?? r.cas;
  const repondu = messageRepondu(ctx.envoyes, r.poster_id, r.recu_at);
  const kill = killArretePar(ctx.kills, r);
  const slack = ctx.slack.get(r.poster_id);
  return (
    <li className={cn("space-y-1 px-3 py-2 text-sm", r.erreur && "bg-destructive/5")} data-reponse={r.id}>
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{r.poster_nom ?? "—"}</span>
        {r.hm_prenom && <span className="text-xs text-muted-foreground">{t("reponses.hm", { hm: r.hm_prenom })}</span>}
        <span className="text-xs text-muted-foreground">
          {t(`reponses.canaux.${r.canal}`)} · {date(r.recu_at)}
        </span>
        {cas ? (
          <Badge variant={VARIANTE_CAS[cas]}>{t(`reponses.cas.${cas}`)}</Badge>
        ) : (
          <Badge variant="secondary">{t("reponses.aClasser")}</Badge>
        )}
        {r.corrige_cas && <span className="text-xs text-muted-foreground">{t("reponses.corrige", { ia: r.cas_ia ? t(`reponses.cas.${r.cas_ia}`) : "—" })}</span>}
        {r.confiance !== null && <span className="text-xs tabular-nums text-muted-foreground">{Math.round(r.confiance * 100)} %</span>}
        {r.lu_at && <Badge variant="secondary">{t("autoOnglets.received.dejaLu")}</Badge>}
        <LienConversation c={conversationDe(ctx.conv, { posteur: r.poster_id })} />
        {kill && (
          <Badge variant="success" data-testid={`kill-arrete-${r.id}`}>
            {t("autoOnglets.received.killArrete")}
          </Badge>
        )}
      </p>
      {repondu && (
        <p className="text-xs text-muted-foreground" data-testid={`repond-a-${r.id}`}>
          {t("autoOnglets.received.repondA", { type: libelleType(repondu.type), date: date(repondu.at) })}
          {repondu.texte && <span className="mt-0.5 block truncate italic">« {repondu.texte} »</span>}
        </p>
      )}
      <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm">{r.texte || "—"}</p>
      {r.reponse_texte && (
        <p className="text-xs">
          <span className="font-medium">{t(`reponses.reponse.${r.reponse_statut ?? "aucune"}`)}</span> {r.reponse_texte}
        </p>
      )}
      {r.reponse_statut === "limite" && <p className="text-xs text-muted-foreground">{t("reponses.reponse.limite")}</p>}
      {r.action && <p className="text-xs text-muted-foreground">{t(`reponses.actions.${r.action}`, { defaultValue: r.action })}</p>}
      {r.erreur && <p className="text-xs font-medium text-destructive">{r.erreur}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {!r.lu_at && (
          <Button size="sm" variant="outline" className="h-7" disabled={maj.isPending} onClick={() => maj.mutate({ cas: null, lu: true })}>
            {t("reponses.lu")}
          </Button>
        )}
        {r.canal === "upwork" && r.upwork_contrat_url && (
          <a href={r.upwork_contrat_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-2 hover:underline">
            {t("reponses.ouvrirUpwork")}
          </a>
        )}
        {r.lien && (
          <a href={r.lien} target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-2 hover:underline" data-testid={`lien-${r.id}`}>
            {t("reponses.ouvrirMessageSlack")}
          </a>
        )}
        {r.canal !== "upwork" && slack && (
          <a
            href={`https://sophia-system.slack.com/team/${slack}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            {t("autoOnglets.received.ouvrirSlack")}
          </a>
        )}
        {/* Prompt 21, R2 : à la main, une contestation (page Disputes). */}
        <BoutonContestation reponseId={r.id} />
        {r.statut === "classe" &&
          (corriger ? (
            <span className="inline-flex flex-wrap items-center gap-1" role="group" aria-label={t("reponses.mauvaisCas")}>
              {CAS_REPONSE.filter((c) => c !== cas).map((c) => (
                <Button key={c} size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={maj.isPending} onClick={() => maj.mutate({ cas: c, lu: false })}>
                  {t(`reponses.cas.${c}`)}
                </Button>
              ))}
            </span>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCorriger(true)}>
              {t("reponses.mauvaisCas")}
            </Button>
          ))}
      </div>
      {maj.error && <p className="text-xs text-destructive">{(maj.error as Error).message}</p>}
    </li>
  );
}

function Bloc({ titre, aide, lignes, testid, ctx }: { titre: string; aide: string; lignes: ReponsePosteur[]; testid: string; ctx: Contexte }) {
  const { t } = useTranslation();
  return (
    <Card data-testid={testid}>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
        <CardDescription>{aide}</CardDescription>
      </CardHeader>
      <CardContent>
        {lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("reponses.vide")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {lignes.map((r) => (
              <Ligne key={r.id} r={r} ctx={ctx} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Les titres et aides des 4 onglets (prompt 22, partie 7). */
const TEXTES_ONGLET: Record<OngletReponses, { titre: string; aide: string }> = {
  a_lire: { titre: "reponses.aLire", aide: "reponses.aLireAide" },
  paie: { titre: "reponses.paie", aide: "reponses.paieAide" },
  stop: { titre: "autoOnglets.received.stop", aide: "autoOnglets.received.stopAide" },
  auto: { titre: "autoOnglets.received.auto", aide: "autoOnglets.received.autoAide" },
};

/**
 * Messages received (prompt 22, partie 7 ; ex Replies, système du 2 nov.,
 * partie E) : une boîte de réception, tous les messages reçus (DM Slack,
 * boutons, Upwork) avec le message de l'OS auquel ils répondent. 4 onglets :
 * To read · Pay questions · Stop requests · Answered by the OS. Sur chaque
 * message : « Lu », « Mauvais cas » (rien ne part au posteur), le lien vers la
 * conversation, et le compte à rebours du Kill qu'il a arrêté. Les textes des
 * réponses automatiques sont dans Messages sent → Texts.
 */
export function PageReponses() {
  const { t } = useTranslation();
  const depuis = React.useMemo(il_y_a_14_jours, []);
  const [onglet, choisir] = useOnglet(ONGLETS_REPONSES, "a_lire");
  const lu = useQuery({ queryKey: [...CLE, depuis], queryFn: () => lireReponses(depuis) });
  const interrupteurs = useQuery({ queryKey: ["interrupteurs"], queryFn: lireInterrupteurs });
  const mode = interrupteurs.data?.reponses_auto ?? "test";
  const toutes = React.useMemo(() => lu.data ?? [], [lu.data]);
  const posteurs = React.useMemo(() => [...new Set(toutes.map((r) => r.poster_id))].sort(), [toutes]);
  // Le message de l'OS auquel chacun répond : les envois des 4 dernières semaines.
  const depuisEnvois = React.useMemo(() => new Date(Date.now() - 28 * 86_400_000).toISOString(), []);
  const envoyes = useQuery({ queryKey: ["messages-envoyes", "reponses", depuisEnvois], queryFn: () => lireMessagesEnvoyes(depuisEnvois) });
  const kills = useQuery({ queryKey: [...CLE, "kills", posteurs], queryFn: () => lireKillsArretes(posteurs), enabled: posteurs.length > 0 });
  const slack = useQuery({ queryKey: [...CLE, "slack", posteurs], queryFn: () => lireSlackPosteurs(posteurs), enabled: posteurs.length > 0 });
  const conv = useConversations(posteurs);
  const ctx: Contexte = { envoyes: envoyes.data ?? [], kills: kills.data ?? [], slack: slack.data ?? new Map(), conv: conv.data };
  const listes = listesReponses(toutes);
  return (
    <div className="space-y-6" data-testid="page-reponses">
      <PageHeader title={t("reponses.titre")} description={t("reponses.description")} />
      <p className="flex items-center gap-2 text-sm">
        <Badge variant={mode === "on" ? "success" : mode === "test" ? "warning" : "secondary"}>{t(`interrupteurs.modes.${mode}`)}</Badge>
        <span className="text-muted-foreground">{t(`reponses.aide.${mode}`)}</span>
      </p>
      {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
      <OngletsAuto
        id="received"
        libelle={t("autoOnglets.received.ongletsAria")}
        onglets={ONGLETS_REPONSES.map((o) => ({ cle: o, titre: t(`autoOnglets.received.onglets.${o}`) }))}
        actif={onglet}
        onChange={choisir}
        compteurs={lu.data ? Object.fromEntries(ONGLETS_REPONSES.map((o) => [o, listes[o].length])) : {}}
        alerte={["a_lire", "paie", "stop"]}
      />
      <PanneauOnglet id="received" actif={onglet}>
        {/* Prompt 21, R2 : les questions de paie sont dans Disputes → Pay. */}
        {onglet === "paie" && <RenvoiPaieDisputes />}
        <Bloc
          titre={t(TEXTES_ONGLET[onglet].titre, { n: listes[onglet].length })}
          aide={t(TEXTES_ONGLET[onglet].aide)}
          lignes={listes[onglet]}
          testid={`reponses-${onglet.replace("_", "-")}`}
          ctx={ctx}
        />
      </PanneauOnglet>
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">{t("reponses.toutes", { n: toutes.length })}</summary>
        <div className="mt-4">
          <Bloc titre={t("reponses.toutes", { n: toutes.length })} aide={t("reponses.toutesAide")} lignes={toutes} testid="reponses-toutes" ctx={ctx} />
        </div>
      </details>
      <ReglagesReponses />
    </div>
  );
}
