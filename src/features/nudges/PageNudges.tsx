import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";
import { ReglagesRegles } from "@/features/regles/ReglagesRegles";
import { localeDate } from "@/locales/localeDate";

import {
  enregistrerReglagesRelances,
  DELAIS_ETAPES,
  CLES_DELAIS_ADMIN,
  KILL_H_MIN,
  ETAPES_RELANCE,
  lireNudges,
  lireReglagesRelances,
  lireRelancesPrevues,
  lireRougesDepuis,
  marquerNudge,
  type ModeRelances,
  type ReglagesRelances,
} from "./api";
import { ETAPES_STATS, etatNudge, statsRelances } from "./logique";
import { BoutonSendUpwork } from "@/features/pipeline/BoutonSendUpwork";
import { useAuth } from "@/features/auth/AuthContext";
import { JournalReglages } from "@/features/reglagesOs/JournalReglages";
import { HandleTiktok } from "@/features/ckd/cohorte/liens";

/** Le jour de l'étape 4 : jeudi, vendredi, samedi ou dimanche avant le lundi de la cohorte. */
const JOURS_ETAPE_4 = [4, 5, 6, 7] as const;

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

const MODES: readonly ModeRelances[] = ["off", "simulation", "on"];

/** Le journal (14 jours), en lecture seule ; « A répondu » reste jusqu'au prompt 16. */
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
  const VARIANTE = { resolu: "success", repondu: "info", sans_reponse: "warning" } as const;
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
                <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm" data-relance={n.id}>
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{n.poster_nom ?? "—"}</span>
                      {n.handle && <HandleTiktok handle={n.handle} className="font-normal text-muted-foreground" />}
                      <Badge variant="secondary">{t(`nudges.types.${n.type}`, { defaultValue: n.type })}</Badge>
                      <Badge variant={VARIANTE[etat]}>{t(`nudges.etats.${etat}`)}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[date(n.envoye_at), t(`nudges.canaux.${n.canal}`), n.hm_prenom ? t("nudges.hm", { hm: n.hm_prenom }) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {n.slack_erreur && (
                      <p className="text-xs text-destructive">{t("nudges.historique.erreur", { erreur: n.slack_erreur })}</p>
                    )}
                  </div>
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {/* Parti sur Slack, ou en échec : le même texte sur Upwork, en un clic. */}
                    {(n.canal !== "upwork" || n.slack_erreur) && n.texte && (
                      <BoutonSendUpwork posterId={n.poster_id} nom={n.poster_nom} texte={n.texte} type={n.type} />
                    )}
                    {etat === "sans_reponse" && (
                      <Button size="sm" variant="outline" disabled={repondu.isPending} onClick={() => repondu.mutate(n.id)}>
                        {t("nudges.historique.aRepondu")}
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** En haut de la page (28 oct., partie E) : 3 chiffres sur 7 jours, par étape. */
export function StatsRelances() {
  const { t } = useTranslation();
  const depuis = ajouterJours(aujourdhuiParis(), -7);
  const nudges = useQuery({ queryKey: ["nudges", "liste", depuis], queryFn: () => lireNudges(depuis) });
  const rouges = useQuery({
    queryKey: ["nudges", "rouges", depuis],
    queryFn: () => lireRougesDepuis(new Date(Date.now() - 7 * 86_400_000).toISOString()),
  });
  if (!nudges.data || !rouges.data) return null;
  const septJours = Date.now() - 7 * 86_400_000;
  const stats = statsRelances(
    nudges.data.filter((n) => Date.parse(n.envoye_at) >= septJours),
    rouges.data,
  );
  return (
    <Card data-testid="stats-relances">
      <CardHeader>
        <CardTitle>{t("nudges.stats.titre")}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-3 font-medium">{t("nudges.stats.etape")}</th>
              <th className="py-1 pr-3 font-medium">{t("nudges.stats.envoyees")}</th>
              <th className="py-1 pr-3 font-medium">{t("nudges.stats.faites")}</th>
              <th className="py-1 font-medium">{t("nudges.stats.rouges")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ETAPES_STATS.map((e) => (
              <tr key={e} data-etape={e}>
                <td className="py-1.5 pr-3">{t(`nudges.types.${e}`)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{stats[e].envoyees}</td>
                <td className="py-1.5 pr-3 tabular-nums">{stats[e].faites48h === null ? "—" : `${stats[e].faites48h} %`}</td>
                <td className="py-1.5 tabular-nums">{stats[e].rouges}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/**
 * Ce qui partirait maintenant (simulation, hors fenêtre) et ce qui ne peut pas
 * partir. Prompt 22 : l'onglet « Planned » de Messages sent ; « Send on
 * Upwork » pour l'admin seulement (le Head of Ops lit la page).
 */
export function Prevues() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const date = useDate();
  const liste = useQuery({ queryKey: ["nudges", "prevues"], queryFn: lireRelancesPrevues });
  return (
    <Card data-testid="relances-prevues">
      <CardHeader>
        <CardTitle>{t("nudges.prevues.titre")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("nudges.prevues.aide")}</p>
      </CardHeader>
      <CardContent>
        {liste.data && liste.data.length === 0 && <p className="text-sm text-muted-foreground">{t("nudges.prevues.vide")}</p>}
        {(liste.data ?? []).length > 0 && (
          <ul className="divide-y rounded-xl border">
            {liste.data!.map((p) => (
              <li key={`${p.poster_id}-${p.type}-${p.periode}`} className="space-y-1 p-3 text-sm">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{p.poster_nom ?? "—"}</span>
                  <Badge variant="secondary">{t(`nudges.types.${p.type}`)}</Badge>
                  <Badge variant={p.statut === "prevu" ? "info" : "error"}>
                    {p.statut === "prevu" ? t("nudges.prevues.prevu") : t("nudges.prevues.bloque")}
                  </Badge>
                  {p.canal && <span className="text-xs text-muted-foreground">{t(`nudges.canaux.${p.canal}`)}</span>}
                  {p.raison && (
                    <span className="text-xs text-muted-foreground">
                      · {t(`nudges.prevues.raisons.${p.raison}`, { defaultValue: p.raison })}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">· {date(p.maj_at)}</span>
                </p>
                {p.texte && <p className="whitespace-pre-line rounded-md bg-muted/40 p-2 text-xs">{p.texte}</p>}
                {p.texte && role === "admin" && (
                  <BoutonSendUpwork posterId={p.poster_id} nom={p.poster_nom} texte={p.texte} type={p.type} />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Le mode (arrêté / simulation / activé), les textes et les délais. */
function ReglagesRelancesCarte() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["reglages", "relances"], queryFn: lireReglagesRelances });
  const [r, setR] = React.useState<ReglagesRelances | null>(null);
  React.useEffect(() => {
    if (lu.data) setR(lu.data);
  }, [lu.data]);
  const enregistrer = useMutation({
    mutationFn: (x: ReglagesRelances) => enregistrerReglagesRelances(x, admin),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reglages", "relances"] });
      void qc.invalidateQueries({ queryKey: ["reglages-journal"] });
    },
  });
  if (!r) return null;
  // Prompt 21, A7 : le Kill jamais avant 24 h ; 0 refusé (vérifié aussi en base, 0413).
  const killTropCourt = !(Number(r.delais.kill_h) >= KILL_H_MIN);
  const changerMode = (mode: ModeRelances) => {
    if (mode === "on" && !window.confirm(t("nudges.mode.confirmOn"))) return;
    const x = { ...r, mode };
    setR(x);
    enregistrer.mutate(x);
  };
  return (
    <Card data-testid="reglages-relances">
      <CardHeader>
        <CardTitle>{t("nudges.mode.titre")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("nudges.mode.aide")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="inline-flex rounded-md border p-0.5 text-sm" role="group" aria-label={t("nudges.mode.titre")}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={r.mode === m}
              disabled={enregistrer.isPending || !admin}
              className={r.mode === m ? "rounded bg-primary px-3 py-1 text-primary-foreground" : "rounded px-3 py-1 text-muted-foreground hover:bg-muted"}
              onClick={() => changerMode(m)}
            >
              {t(`nudges.mode.${m}`)}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">{t("nudges.reglages.titre")}</p>
          <p className="text-xs text-muted-foreground">{t("nudges.reglages.aide")}</p>
        </div>
        {ETAPES_RELANCE.map((e) => (
          <div key={e} className="space-y-1">
            <label className="text-sm font-medium" htmlFor={`relance-${e}`}>
              {t(`nudges.types.${e}`)}
            </label>
            <Textarea id={`relance-${e}`} value={r.textes[e]} readOnly={!admin} onChange={(ev) => setR({ ...r, textes: { ...r.textes, [e]: ev.target.value } })} />
          </div>
        ))}
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("nudges.reglages.slack")}</span>
          <Input value={r.slack} readOnly={!admin} onChange={(ev) => setR({ ...r, slack: ev.target.value })} aria-label={t("nudges.reglages.slack")} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("nudges.reglages.lienEtapes")}</span>
          <Input value={r.lienEtapes} readOnly={!admin} onChange={(ev) => setR({ ...r, lienEtapes: ev.target.value })} aria-label={t("nudges.reglages.lienEtapes")} />
        </label>
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("nudges.reglages.delais")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {DELAIS_ETAPES.map((k) => (
              <label key={k} className="space-y-1 text-xs text-muted-foreground">
                <span className="block">{t(`nudges.reglages.${k}`)}</span>
                <Input
                  type="number"
                  min={k === "kill_h" ? KILL_H_MIN : 0}
                  value={String(r.delais[k])}
                  disabled={!admin}
                  aria-label={t(`nudges.reglages.${k}`)}
                  onChange={(ev) => setR({ ...r, delais: { ...r.delais, [k]: Number(ev.target.value) } })}
                />
              </label>
            ))}
            {/* Partie E (0411) : le jour de l'étape 4, et l'heure du check du lundi soir. */}
            <label className="space-y-1 text-xs text-muted-foreground">
              <span className="block">{t("nudges.reglages.warmup_bien_fait_jour")}</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                value={r.delais.warmup_bien_fait_jour}
                disabled={!admin}
                aria-label={t("nudges.reglages.warmup_bien_fait_jour")}
                onChange={(ev) => setR({ ...r, delais: { ...r.delais, warmup_bien_fait_jour: Number(ev.target.value) } })}
              >
                {JOURS_ETAPE_4.map((j) => (
                  <option key={j} value={j}>{t(`reglagesOs.jours.${j}`)}</option>
                ))}
              </select>
            </label>
            {/* Prompt 25 MAJ, 15 : le check du lundi soir part à minuit, heure de Paris (plus d'heure à régler). */}
            <p className="space-y-1 text-xs text-muted-foreground">{t("nudges.reglages.lundi_soir_heure")}</p>
          </div>
          {killTropCourt && <p className="text-xs text-destructive">{t("nudges.reglages.killMin", { n: KILL_H_MIN })}</p>}
          {!admin && <p className="text-xs text-muted-foreground">{t("reglagesOs.adminSeulement")}</p>}
          <JournalReglages cles={CLES_DELAIS_ADMIN} />
        </div>
        <div className="flex items-center gap-2">
          {admin && (
            <Button
              disabled={enregistrer.isPending || killTropCourt || ETAPES_RELANCE.some((e) => !r.textes[e].trim())}
              onClick={() => enregistrer.mutate(r)}
            >
              {t("nudges.reglages.enregistrer")}
            </Button>
          )}
          {enregistrer.isSuccess && <span className="text-sm text-muted-foreground">{t("nudges.reglages.ok")}</span>}
          {enregistrer.error && <span className="text-sm text-destructive">{(enregistrer.error as Error).message}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Relances (prompt 17, partie A) : l'OS envoie lui-même UNE relance par
 * étape (`recrues-check`, toutes les heures). Cette page est le journal en
 * lecture seule, ce qui est prévu ou bloqué, le mode et les textes. Plus de
 * « Nudge all », d'escalade ni de liste « À relancer sur Upwork ».
 */
export function PageNudges() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader title={t("nudges.titre")} description={t("nudges.description")} />
      <StatsRelances />
      <Prevues />
      <Historique />
      <ReglagesRelancesCarte />
      <ReglagesRegles />
    </div>
  );
}
