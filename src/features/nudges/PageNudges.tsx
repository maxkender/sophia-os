import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink, Send } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarreChargement } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ChoixHm } from "@/features/ckd/vueHm/ChoixHm";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";
import { localeDate } from "@/locales/localeDate";

import {
  apercuNudges,
  enregistrerMessagesNudge,
  envoyerNudges,
  lireARelancerUpwork,
  lireMessagesNudge,
  lireNudges,
  marquerNudge,
  TYPES_BLOCAGE,
  type CibleNudge,
  type TypeBlocage,
} from "./api";
import { etatNudge } from "./logique";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type Choix = CibleNudge | "hm";

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

function NudgeAll() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [choix, setChoix] = React.useState<Choix>("warmup");
  const [hm, setHm] = React.useState("");
  const cible: CibleNudge = choix === "hm" ? "actifs" : choix;
  const filtreHm = choix === "hm" ? hm : "";
  const [decoches, setDecoches] = React.useState<Set<string>>(new Set());
  const [demande, setDemande] = React.useState(false);

  const apercu = useQuery({
    queryKey: ["nudges", "apercu", cible, filtreHm],
    queryFn: () => apercuNudges(cible, filtreHm || null),
    enabled: demande && (choix !== "hm" || Boolean(hm)),
  });
  const lignes = apercu.data ?? [];
  const coches = lignes.filter((l) => !decoches.has(l.compte_id));
  const envoi = useMutation({
    mutationFn: () => envoyerNudges(cible, filtreHm || null, coches.map((l) => l.compte_id)),
    onSuccess: () => {
      setDemande(false);
      setDecoches(new Set());
      void qc.invalidateQueries({ queryKey: ["nudges"] });
    },
  });

  return (
    <Card data-testid="nudge-all">
      <CardHeader>
        <CardTitle>{t("nudges.all.titre")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("nudges.all.aide")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={selectClass}
            aria-label={t("nudges.all.cible")}
            value={choix}
            onChange={(e) => {
              setChoix(e.target.value as Choix);
              setDemande(false);
              setDecoches(new Set());
            }}
          >
            {(["warmup", "premiere_semaine", "actifs", "hm"] as const).map((c) => (
              <option key={c} value={c}>
                {t(`nudges.cibles.${c}`)}
              </option>
            ))}
          </select>
          {choix === "hm" && (
            <ChoixHm
              valeur={hm}
              onChange={(v) => {
                setHm(v);
                setDemande(false);
              }}
            />
          )}
          <Button variant="outline" disabled={choix === "hm" && !hm} onClick={() => setDemande(true)}>
            {t("nudges.all.apercu")}
          </Button>
        </div>

        {apercu.isFetching && <BarreChargement actif />}
        {apercu.error && <p className="text-sm text-destructive">{(apercu.error as Error).message}</p>}
        {demande && apercu.data && lignes.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("nudges.all.personne")}</p>
        )}
        {demande && lignes.length > 0 && (
          <>
            <ul className="divide-y rounded-xl border" data-testid="apercu-nudges">
              {lignes.map((l) => (
                <li key={l.compte_id} className="flex gap-3 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    aria-label={t("nudges.all.inclure", { nom: l.poster_nom ?? "—" })}
                    checked={!decoches.has(l.compte_id)}
                    onChange={(e) => {
                      const suivant = new Set(decoches);
                      if (e.target.checked) suivant.delete(l.compte_id);
                      else suivant.add(l.compte_id);
                      setDecoches(suivant);
                    }}
                  />
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{l.poster_nom ?? "—"}</span>
                      {l.handle && <span className="text-muted-foreground">@{l.handle}</span>}
                      <Badge variant="warning">{t(`nudges.types.${l.type}`)}</Badge>
                      <Badge variant={l.slack ? "info" : "secondary"}>
                        {l.slack ? t("nudges.canaux.slack") : t("nudges.canaux.os")}
                      </Badge>
                      {l.nudges_sans_reponse > 0 && (
                        <Badge variant="error">{t("nudges.all.dejaRelance", { n: l.nudges_sans_reponse })}</Badge>
                      )}
                      {l.hm_prenom && <span className="text-xs text-muted-foreground">{t("nudges.hm", { hm: l.hm_prenom })}</span>}
                    </p>
                    <p className="text-muted-foreground">{l.texte}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={coches.length === 0 || envoi.isPending} onClick={() => envoi.mutate()}>
                <Send className="size-4" />
                {t("nudges.all.envoyer", { count: coches.length })}
              </Button>
            </div>
          </>
        )}
        {envoi.data && (
          <p className="text-sm" data-testid="bilan-nudges">
            {t("nudges.all.bilan", { n: envoi.data.envoyes, slack: envoi.data.slack, os: envoi.data.os })}
          </p>
        )}
        {envoi.error && <p className="text-sm text-destructive">{(envoi.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

function RelancerUpwork() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const date = useDate();
  const liste = useQuery({ queryKey: ["nudges", "upwork"], queryFn: lireARelancerUpwork });
  const marquer = useMutation({
    mutationFn: (posterId: string) => marquerNudge(posterId, "upwork"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nudges"] }),
  });
  return (
    <Card data-testid="relancer-upwork">
      <CardHeader>
        <CardTitle>{t("nudges.upwork.titre")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("nudges.upwork.aide")}</p>
      </CardHeader>
      <CardContent>
        {liste.error && <p className="text-sm text-destructive">{(liste.error as Error).message}</p>}
        {liste.data && liste.data.length === 0 && <p className="text-sm text-muted-foreground">{t("nudges.upwork.vide")}</p>}
        {(liste.data ?? []).length > 0 && (
          <ul className="divide-y rounded-xl border">
            {liste.data!.map((p) => (
              <li key={p.poster_id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{p.poster_nom ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      p.hm_prenom ? t("nudges.hm", { hm: p.hm_prenom }) : null,
                      t("nudges.upwork.sansReponse", { n: p.nudges }),
                      t("nudges.upwork.dernier", { date: date(p.dernier_at) }),
                      p.types.map((ty) => t(`nudges.types.${ty}`)).join(", "),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {p.upwork_contrat_url || p.upwork_url ? (
                    <a
                      href={(p.upwork_contrat_url || p.upwork_url)!}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                    >
                      {t("nudges.upwork.ouvrir")}
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : (
                    <span className="text-xs text-destructive">{t("nudges.upwork.lienManquant")}</span>
                  )}
                  <Button size="sm" variant="outline" disabled={marquer.isPending} onClick={() => marquer.mutate(p.poster_id)}>
                    {t("nudges.upwork.relance")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Historique() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const date = useDate();
  const depuis = ajouterJours(aujourdhuiParis(), -14);
  const liste = useQuery({ queryKey: ["nudges", "liste", depuis], queryFn: () => lireNudges(depuis) });
  const repondu = useMutation({
    mutationFn: (id: string) => marquerNudge(id, "repondu"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nudges"] }),
  });
  const VARIANTE = { resolu: "success", repondu: "info", upwork: "warning", sans_reponse: "error" } as const;
  return (
    <Card data-testid="historique-nudges">
      <CardHeader>
        <CardTitle>{t("nudges.historique.titre")}</CardTitle>
      </CardHeader>
      <CardContent>
        {liste.data && liste.data.length === 0 && <p className="text-sm text-muted-foreground">{t("nudges.historique.vide")}</p>}
        {(liste.data ?? []).length > 0 && (
          <ul className="divide-y rounded-xl border">
            {liste.data!.map((n) => {
              const etat = etatNudge(n);
              return (
                <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{n.poster_nom ?? "—"}</span>
                      {n.handle && <span className="text-muted-foreground">@{n.handle}</span>}
                      <Badge variant="secondary">{t(`nudges.types.${n.type}`)}</Badge>
                      <Badge variant={VARIANTE[etat]}>{t(`nudges.etats.${etat}`)}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[date(n.envoye_at), t(`nudges.canaux.${n.canal}`), n.hm_prenom ? t("nudges.hm", { hm: n.hm_prenom }) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {etat === "sans_reponse" && (
                    <Button size="sm" variant="outline" disabled={repondu.isPending} onClick={() => repondu.mutate(n.id)}>
                      {t("nudges.historique.aRepondu")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ReglagesNudges() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["reglages", "nudge-messages"], queryFn: lireMessagesNudge });
  const [m, setM] = React.useState<Record<TypeBlocage, string> | null>(null);
  React.useEffect(() => {
    if (lu.data) setM(lu.data);
  }, [lu.data]);
  const enregistrer = useMutation({
    mutationFn: () => enregistrerMessagesNudge(m!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reglages", "nudge-messages"] }),
  });
  return (
    <Card data-testid="reglages-nudges">
      <CardHeader>
        <CardTitle>{t("nudges.reglages.titre")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("nudges.reglages.aide")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {m &&
          TYPES_BLOCAGE.map((ty) => (
            <div key={ty} className="space-y-1">
              <label className="text-sm font-medium" htmlFor={`nudge-${ty}`}>
                {t(`nudges.types.${ty}`)}
              </label>
              <Textarea id={`nudge-${ty}`} value={m[ty]} onChange={(e) => setM({ ...m, [ty]: e.target.value })} />
            </div>
          ))}
        {m && (
          <div className="flex items-center gap-2">
            <Button disabled={enregistrer.isPending || TYPES_BLOCAGE.some((ty) => !m[ty].trim())} onClick={() => enregistrer.mutate()}>
              {t("nudges.reglages.enregistrer")}
            </Button>
            {enregistrer.isSuccess && <span className="text-sm text-muted-foreground">{t("nudges.reglages.ok")}</span>}
            {enregistrer.error && <span className="text-sm text-destructive">{(enregistrer.error as Error).message}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Nudges (v3 point 6) : relancer d'un coup une cohorte, les actifs ou une HM,
 * avec un aperçu avant l'envoi ; suivre les réponses ; relancer sur Upwork
 * au 2ᵉ nudge sans réponse ; régler les messages par blocage.
 */
export function PageNudges() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader title={t("nudges.titre")} description={t("nudges.description")} />
      <NudgeAll />
      <RelancerUpwork />
      <Historique />
      <ReglagesNudges />
    </div>
  );
}
