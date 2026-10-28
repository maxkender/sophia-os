import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthContext";
import { lireInterrupteurs } from "@/features/interrupteurs/api";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import {
  CAS_REPONSE,
  CLES_TEXTES_REPONSES,
  corrigerReponse,
  enregistrerTextesReponses,
  lireReponses,
  lireTextesReponses,
  type CasReponse,
  type ReponsePosteur,
  type TexteReponse,
} from "./api";

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

/** Un message reçu : le texte, le cas, ce que l'OS a fait ; « Mauvais cas » et « Lu ». */
function Ligne({ r, dansListe }: { r: ReponsePosteur; dansListe?: boolean }) {
  const { t } = useTranslation();
  const date = useDate();
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
      </p>
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
        {dansListe && !r.lu_at && (
          <Button size="sm" variant="outline" className="h-7" disabled={maj.isPending} onClick={() => maj.mutate({ cas: null, lu: true })}>
            {t("reponses.lu")}
          </Button>
        )}
        {r.canal === "upwork" && r.upwork_contrat_url && (
          <a href={r.upwork_contrat_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-2 hover:underline">
            {t("reponses.ouvrirUpwork")}
          </a>
        )}
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

function Bloc({ titre, aide, lignes, testid, dansListe }: { titre: string; aide: string; lignes: ReponsePosteur[]; testid: string; dansListe?: boolean }) {
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
              <Ligne key={r.id} r={r} dansListe={dansListe} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Les textes des réponses automatiques (admin) : en anglais, éditables. */
function TextesReponses() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["reglages", "reponses-textes"], queryFn: lireTextesReponses });
  const [textes, setTextes] = React.useState<Record<TexteReponse, string> | null>(null);
  React.useEffect(() => {
    if (lu.data) setTextes(lu.data);
  }, [lu.data]);
  const enregistrer = useMutation({
    mutationFn: (x: Record<TexteReponse, string>) => enregistrerTextesReponses(x),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reglages", "reponses-textes"] }),
  });
  if (!textes) return null;
  return (
    <Card data-testid="reponses-textes">
      <CardHeader>
        <CardTitle>{t("reponses.textes.titre")}</CardTitle>
        <CardDescription>{t("reponses.textes.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(Object.keys(CLES_TEXTES_REPONSES) as TexteReponse[]).map((k) => (
          <label key={k} className="block space-y-1 text-sm">
            <span className="font-medium">{t(`reponses.textes.${k}`)}</span>
            <Textarea value={textes[k]} onChange={(e) => setTextes({ ...textes, [k]: e.target.value })} aria-label={t(`reponses.textes.${k}`)} />
          </label>
        ))}
        <div className="flex items-center gap-2">
          <Button disabled={enregistrer.isPending} onClick={() => enregistrer.mutate(textes)}>
            {t("common.save")}
          </Button>
          {enregistrer.isSuccess && <span className="text-sm text-muted-foreground">{t("reponses.textes.ok")}</span>}
          {enregistrer.error && <span className="text-sm text-destructive">{(enregistrer.error as Error).message}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Réponses (système du 2 nov., partie E) : « À lire » et « Questions de
 * paie » en tête (pas de réponse automatique), puis tous les messages des 14
 * derniers jours, avec le cas et ce que l'OS a fait. « Mauvais cas » note le
 * bon cas ; rien n'est renvoyé au posteur.
 */
export function PageReponses() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const depuis = React.useMemo(il_y_a_14_jours, []);
  const lu = useQuery({ queryKey: [...CLE, depuis], queryFn: () => lireReponses(depuis) });
  const interrupteurs = useQuery({ queryKey: ["interrupteurs"], queryFn: lireInterrupteurs });
  const mode = interrupteurs.data?.reponses_auto ?? "test";
  const toutes = lu.data ?? [];
  const aLire = toutes.filter((r) => r.liste === "a_lire" && !r.lu_at);
  const paie = toutes.filter((r) => r.liste === "paie" && !r.lu_at);
  return (
    <div className="space-y-6" data-testid="page-reponses">
      <PageHeader title={t("reponses.titre")} description={t("reponses.description")} />
      <p className="flex items-center gap-2 text-sm">
        <Badge variant={mode === "on" ? "success" : mode === "test" ? "warning" : "secondary"}>{t(`interrupteurs.modes.${mode}`)}</Badge>
        <span className="text-muted-foreground">{t(`reponses.aide.${mode}`)}</span>
      </p>
      {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
      <Bloc titre={t("reponses.aLire", { n: aLire.length })} aide={t("reponses.aLireAide")} lignes={aLire} testid="reponses-a-lire" dansListe />
      <Bloc titre={t("reponses.paie", { n: paie.length })} aide={t("reponses.paieAide")} lignes={paie} testid="reponses-paie" dansListe />
      <Bloc titre={t("reponses.toutes", { n: toutes.length })} aide={t("reponses.toutesAide")} lignes={toutes} testid="reponses-toutes" />
      {role === "admin" && <TextesReponses />}
    </div>
  );
}
