import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthContext";
import { BoutonsTest } from "@/features/auto/test/ContratsTest";
import { reporterRecrue } from "@/features/cohortes/api";
import { demanderArretSamedi } from "@/features/ckd/decisions/semaineComptes";
import { envoyerSurUpwork } from "@/features/pipeline/api";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import {
  ETAPES_ONBOARDING,
  etapeCourante,
  etapesRecrue,
  type FiltresOnboarding,
  filtrerOnboarding,
  lireOnboarding,
  type RecrueOnboarding,
} from "./api";

const selectClass = "h-8 rounded-md border bg-background px-2 text-sm";

function useFormats() {
  const { i18n } = useTranslation();
  const langue = localeDate(i18n.resolvedLanguage ?? "fr");
  const heure = new Intl.DateTimeFormat(langue, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const jour = new Intl.DateTimeFormat(langue, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return {
    le: (iso: string | null) => (iso ? heure.format(new Date(iso)) : "—"),
    jour: (d: string) => jour.format(new Date(`${d}T12:00:00Z`)),
  };
}

/** Une recrue : qui, son contrat, ses étapes, ses messages, la prochaine relance, et les boutons. */
function CarteRecrue({ r }: { r: RecrueOnboarding }) {
  const { t } = useTranslation();
  const { le, jour } = useFormats();
  const admin = useAuth().role === "admin";
  const qc = useQueryClient();
  const [ecrire, setEcrire] = React.useState(false);
  const [texte, setTexte] = React.useState("");
  const [bilan, setBilan] = React.useState<string | null>(null);
  const recharger = () => void qc.invalidateQueries({ queryKey: ["onboarding"] });
  const envoyer = useMutation({
    mutationFn: () => envoyerSurUpwork(r.poster_id, texte.trim(), "onboarding"),
    onSuccess: () => {
      setEcrire(false);
      setTexte("");
      setBilan(t("onboardingPosters.envoye"));
      recharger();
    },
  });
  const reporter = useMutation({
    mutationFn: () => reporterRecrue(r.poster_id),
    onSuccess: (lundi) => {
      setBilan(t("onboardingPosters.reporte", { date: jour(lundi) }));
      recharger();
    },
  });
  const arreter = useMutation({
    // Décisions finales : rien ne s'arrête ici ; la personne va au samedi, Kill pré-coché.
    mutationFn: () => demanderArretSamedi(r.poster_id, null),
    onSuccess: () => {
      setBilan(t("onboardingPosters.arrete"));
      recharger();
    },
  });
  const contrat = r.contrat_url ?? (r.contrat_id ? `https://www.upwork.com/nx/wm/workroom/${r.contrat_id}/overview` : null);
  const erreur = envoyer.error ?? reporter.error ?? arreter.error;
  return (
    <Card id={`recrue-${r.poster_id}`} data-recrue={r.poster_id} data-etape={etapeCourante(r)}>
      <CardContent className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {r.test && <Badge variant="info">TEST</Badge>}
          <span className="font-semibold">{r.nom ?? "—"}</span>
          <span className="text-muted-foreground">
            {t("onboardingPosters.qui", { hm: r.hm_nom ?? "—", pays: r.pays ?? "—", cohorte: jour(r.cohorte_lundi) })}
          </span>
        </div>
        <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">{t("onboardingPosters.contrat")}</dt>
          <dd>
            {contrat ? (
              <a className="underline" href={contrat} target="_blank" rel="noreferrer">
                {r.contrat_id ?? contrat}
              </a>
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-muted-foreground">{t("onboardingPosters.login")}</dt>
          <dd>{r.email ?? "—"}</dd>
          <dt className="text-muted-foreground">{t("onboardingPosters.slack")}</dt>
          <dd>{t(r.slack ? "onboardingPosters.surSlack" : "onboardingPosters.pasSlack")}</dd>
          {r.handle && (
            <>
              <dt className="text-muted-foreground">{t("onboardingPosters.handle")}</dt>
              <dd>@{r.handle}</dd>
            </>
          )}
        </dl>

        <ol className="grid gap-1 text-xs sm:grid-cols-5" data-testid="etapes">
          {etapesRecrue(r).map((e, i) => (
            <li key={e.etape} className={cn("flex items-start gap-1.5", !e.fait && "text-muted-foreground")} data-etape-faite={e.fait}>
              {e.fait ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-foreground" aria-hidden /> : <Circle className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
              <span>
                {t(`onboardingPosters.etapes.${e.etape}`, { n: i })}
                {e.at && <span className="block tabular-nums">{le(e.at)}</span>}
              </span>
            </li>
          ))}
        </ol>

        <div className="space-y-1">
          <p className="text-xs font-medium">{t("onboardingPosters.messages", { n: r.messages.length })}</p>
          {r.messages.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("onboardingPosters.aucunMessage")}</p>
          ) : (
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border text-xs" data-testid="messages">
              {r.messages.map((m) => (
                <li key={m.id} className="space-y-0.5 p-2" data-message={m.type}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums text-muted-foreground">{le(m.at)}</span>
                    <span className="font-medium">{t(`autoOnglets.attente.types.${m.type}`, { defaultValue: m.type })}</span>
                    <Badge variant="secondary">{(m.canaux?.length ? m.canaux : [m.canal ?? "—"]).join(" + ")}</Badge>
                    <Badge variant={m.statut === "erreur" ? "error" : "success"}>{t(`onboardingPosters.statuts.${m.statut}`)}</Badge>
                  </div>
                  {m.texte && <p className="whitespace-pre-wrap break-words">{m.texte}</p>}
                  {m.erreur && <p className="text-destructive">{m.erreur}</p>}
                  {m.reponse && (
                    <p className="rounded bg-muted/50 px-2 py-1">
                      {t("onboardingPosters.reponse", { quand: le(m.reponse.at), canal: m.reponse.canal })} {m.reponse.texte}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs" data-testid="prochaine">
          <span className="font-medium">{t("onboardingPosters.prochaine")}</span>{" "}
          {r.prochaine
            ? t("onboardingPosters.prochaineDetail", {
              type: t(`autoOnglets.attente.types.${r.prochaine.type}`, { defaultValue: r.prochaine.type }),
              periode: jour(r.prochaine.periode),
              etat: t(r.prochaine.valide ? "onboardingPosters.enFile" : `onboardingPosters.raisons.${r.prochaine.raison ?? "prevu"}`, {
                defaultValue: r.prochaine.raison ?? "",
              }),
            })
            : etapeCourante(r) === "fini"
              ? t("onboardingPosters.rienAFaire")
              : t("onboardingPosters.demain")}
        </p>

        {r.test && admin && <BoutonsTest posterId={r.poster_id} />}

        {admin && (
          <div className="flex flex-wrap gap-2 border-t pt-2">
            <Button size="xs" variant="secondary" onClick={() => setEcrire((x) => !x)}>
              {t("onboardingPosters.ecrire")}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={reporter.isPending}
              onClick={() => {
                if (window.confirm(t("onboardingPosters.confirmReporter", { nom: r.nom ?? "?" }))) reporter.mutate();
              }}
            >
              {t("onboardingPosters.reporter")}
            </Button>
            <Button
              size="xs"
              variant="destructive-outline"
              disabled={arreter.isPending}
              onClick={() => {
                if (window.confirm(t("onboardingPosters.confirmArreter", { nom: r.nom ?? "?" }))) arreter.mutate();
              }}
            >
              {t("onboardingPosters.arreter")}
            </Button>
          </div>
        )}
        {ecrire && (
          <div className="space-y-2">
            <Textarea
              className="min-h-20 text-xs"
              value={texte}
              aria-label={t("onboardingPosters.texte", { nom: r.nom ?? "?" })}
              onChange={(e) => setTexte(e.target.value)}
            />
            <Button
              size="xs"
              disabled={!texte.trim() || envoyer.isPending}
              onClick={() => {
                if (window.confirm(t("onboardingPosters.confirmEnvoyer", { nom: r.nom ?? "?" }))) envoyer.mutate();
              }}
            >
              {t("onboardingPosters.envoyer")}
            </Button>
          </div>
        )}
        {bilan && <p className="text-xs">{bilan}</p>}
        {erreur && <p className="text-xs text-destructive">{(erreur as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Prompt 25 v4 : Onboarding posters (Recruitment Automation). Une carte par
 * recrue : HM, pays, cohorte, contrat Upwork, e-mail de connexion, Slack ou
 * pas, chaque étape avec sa date, tous les messages envoyés (date, canal,
 * texte, statut, réponse), la prochaine relance ; Send a message, Postpone,
 * Stop. Filtres : HM, cohorte, étape.
 */
export function PageOnboarding() {
  const { t } = useTranslation();
  const { jour } = useFormats();
  const lu = useQuery({ queryKey: ["onboarding"], queryFn: lireOnboarding, refetchInterval: 60_000 });
  const [f, setF] = React.useState<FiltresOnboarding>({ hm: "", cohorte: "", etape: "" });
  const tous = lu.data ?? [];
  const liste = filtrerOnboarding(tous, f);
  const hms = [...new Map(tous.filter((r) => r.hm_id).map((r) => [r.hm_id!, r.hm_nom ?? r.hm_id!])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const cohortes = [...new Set(tous.map((r) => r.cohorte_lundi))].sort();
  return (
    <section className="space-y-3" data-testid="page-onboarding">
      <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="filtres-onboarding">
        <span className="font-semibold">{t("onboardingPosters.titre", { n: liste.length })}</span>
        <select className={selectClass} value={f.hm} aria-label={t("onboardingPosters.filtres.hm")} onChange={(e) => setF({ ...f, hm: e.target.value })}>
          <option value="">{t("onboardingPosters.filtres.tousHm")}</option>
          {hms.map(([id, nom]) => (
            <option key={id} value={id}>
              {nom}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={f.cohorte}
          aria-label={t("onboardingPosters.filtres.cohorte")}
          onChange={(e) => setF({ ...f, cohorte: e.target.value })}
        >
          <option value="">{t("onboardingPosters.filtres.toutesCohortes")}</option>
          {cohortes.map((c) => (
            <option key={c} value={c}>
              {jour(c)}
            </option>
          ))}
        </select>
        <select className={selectClass} value={f.etape} aria-label={t("onboardingPosters.filtres.etape")} onChange={(e) => setF({ ...f, etape: e.target.value })}>
          <option value="">{t("onboardingPosters.filtres.toutesEtapes")}</option>
          {[...ETAPES_ONBOARDING, "fini" as const].map((e, i) => (
            <option key={e} value={e}>
              {t(`onboardingPosters.manque.${e}`, { n: i })}
            </option>
          ))}
        </select>
      </div>
      {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
      {lu.data && liste.length === 0 && <p className="text-sm text-muted-foreground">{t("onboardingPosters.vide")}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {liste.map((r) => (
          <CarteRecrue key={r.poster_id} r={r} />
        ))}
      </div>
    </section>
  );
}
