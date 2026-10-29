import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Link2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { duree } from "@/features/pipeline/logique";
import { lienConnexionUpwork } from "@/features/upwork/api";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import { lireAujourdhui, lireSante, lireSemaine, type EtatTacheAuto } from "./api";
import { joursSemaine, type EtatJour } from "./logique";

function useDates() {
  const { t, i18n } = useTranslation();
  const langue = localeDate(i18n.resolvedLanguage ?? "fr");
  const heure = new Intl.DateTimeFormat(langue, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const jour = new Intl.DateTimeFormat(langue, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return {
    le: (iso: string | null) => (iso ? heure.format(new Date(iso)) : "—"),
    jour: (d: string) => jour.format(new Date(`${d}T12:00:00Z`)),
    dans: (iso: string, maintenant = Date.now()) => {
      const x = duree(Date.parse(iso) - maintenant);
      return t(`pipeline.duree.${x.unite}`, { n: x.n });
    },
  };
}

// ---------------------------------------------------------------------------
// Health (dans la carte « Health » de 0421)
// ---------------------------------------------------------------------------

function LigneTache({ x }: { x: EtatTacheAuto }) {
  const { t } = useTranslation();
  const { le } = useDates();
  const rouge = x.en_retard || x.en_erreur === true;
  const resultat = !x.existe
    ? t("auto.sante.introuvable")
    : !x.actif
      ? t("auto.sante.coupe")
      : x.en_erreur
        ? t("auto.sante.erreur", { message: x.message ?? "" })
        : !x.dernier_at
          ? t("auto.sante.jamais")
          : x.en_retard
            ? t("auto.sante.retard")
            : t("auto.sante.ok");
  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1", rouge && "font-medium text-destructive")} data-tache={x.tache} data-rouge={rouge || undefined}>
      {rouge ? <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> : <CheckCircle2 className="size-3.5 shrink-0 text-success-foreground" aria-hidden />}
      <span className="min-w-40">{t(`auto.sante.taches.${x.tache}`)}</span>
      <span className={cn("tabular-nums", !rouge && "text-muted-foreground")}>{le(x.dernier_at)}</span>
      <span>{resultat}</span>
    </li>
  );
}

/**
 * Prompt 22, partie 3 : la connexion Upwork (état, expiration du jeton,
 * dernière erreur, Reconnecter ; alerte si le jeton expire dans moins de 6 h
 * et que le renouvellement a échoué) et le dernier passage de chaque tâche
 * automatique (en rouge : en retard ou en erreur).
 */
export function SanteAuto() {
  const { t } = useTranslation();
  const { le } = useDates();
  const admin = useAuth().role === "admin";
  const lu = useQuery({ queryKey: ["auto", "sante"], queryFn: lireSante, refetchInterval: 5 * 60_000 });
  const reconnecter = useMutation({ mutationFn: lienConnexionUpwork, onSuccess: (url) => window.location.assign(url) });
  const u = lu.data?.upwork ?? null;
  const statut = u?.statut ?? "deconnecte";
  return (
    <div className="space-y-3 border-t pt-3" data-testid="sante-auto">
      {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
      {u?.alerte && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 font-medium text-destructive" data-testid="alerte-jeton">
          {t("auto.sante.alerteJeton", { quand: le(u.access_expire_at) })}
        </p>
      )}
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {t("auto.sante.upwork")}
          <Badge variant={statut === "connecte" ? "success" : statut === "erreur" ? "error" : "secondary"}>{t(`upwork.statuts.${statut}`)}</Badge>
        </p>
        {lu.data && (
          <p className={cn("text-muted-foreground", u?.expire_bientot && "text-warning-foreground")}>
            {t("auto.sante.expire", { quand: le(u?.access_expire_at ?? null) })}
            {u?.renouvellement_at &&
              ` · ${t(u.renouvellement_erreur ? "auto.sante.renouvellementRate" : "auto.sante.renouvellementOk", { quand: le(u.renouvellement_at) })}`}
          </p>
        )}
        {(u?.derniere_erreur || u?.renouvellement_erreur) && (
          <p className="break-words text-destructive">{t("auto.sante.derniereErreur", { erreur: u.derniere_erreur ?? u.renouvellement_erreur })}</p>
        )}
        {admin && (
          <Button size="sm" variant={u?.alerte || statut !== "connecte" ? "default" : "outline"} disabled={reconnecter.isPending} onClick={() => reconnecter.mutate()}>
            <Link2 className="size-4" />
            {t("upwork.reconnecter")}
          </Button>
        )}
        {reconnecter.error && <p className="text-destructive">{(reconnecter.error as Error).message}</p>}
      </div>
      <div className="space-y-1">
        <p className="font-medium">{t("auto.sante.titreTaches")}</p>
        <ul className="divide-y text-sm" data-testid="taches-auto">
          {(lu.data?.taches ?? []).map((x) => (
            <LigneTache key={x.tache} x={x} />
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

function Compteur({ n, libelle, vers, alerte }: { n: number; libelle: string; vers: string; alerte?: boolean }) {
  return (
    <Link
      to={vers}
      className={cn(
        "flex min-w-36 flex-1 flex-col rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50",
        alerte && n > 0 && "border-warning/60 bg-warning/10",
      )}
      data-compteur={vers}
    >
      <span className="text-xl font-semibold tabular-nums">{n}</span>
      <span className="text-xs text-muted-foreground">{libelle}</span>
    </Link>
  );
}

/**
 * Prompt 22, partie 3 : « Today », des compteurs cliquables. Un clic mène à
 * la bonne page, déjà filtrée (Logs pour les messages partis, Needs you pour
 * ce qui est à lire, Recruits pour les Kills, les contrats et les arrêts).
 */
export function CarteAujourdhui() {
  const { t } = useTranslation();
  const { dans } = useDates();
  const lu = useQuery({ queryKey: ["auto", "aujourdhui"], queryFn: lireAujourdhui, refetchInterval: 60_000 });
  const d = lu.data;
  const messages = Object.entries(d?.messages ?? {}).sort((a, b) => b[1] - a[1]);
  const total = messages.reduce((s, [, n]) => s + n, 0);
  const jour = d?.jour ?? "";
  const journal = (action?: string) =>
    `/admin/auto/logs?source=message&du=${jour}&au=${jour}${action ? `&action=${encodeURIComponent(action)}` : ""}`;
  return (
    <Card data-testid="carte-aujourdhui">
      <CardHeader>
        <CardTitle className="text-base">{t("auto.today.titre")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
        {d && (
          <>
            <div className="space-y-1">
              <Link to={journal()} className="font-medium hover:underline" data-testid="messages-jour">
                {t("auto.today.messages", { n: total })}
              </Link>
              <div className="flex flex-wrap gap-1.5">
                {messages.map(([type, n]) => (
                  <Link key={type} to={journal(type)} data-message-type={type}>
                    <Badge variant="secondary">
                      {t(`auto.today.types.${type}`, { defaultValue: type })} : {n}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Compteur n={d.kills.length} libelle={t("auto.today.kills")} vers="/admin/auto/recruits?risque=1" alerte />
              <Compteur n={d.a_lire} libelle={t("auto.today.aLire")} vers="/admin/auto/needs-you?type=message_a_lire,reponse_peu_sure" alerte />
              <Compteur n={d.questions_paie} libelle={t("auto.today.questionsPaie")} vers="/admin/auto/needs-you?type=question_paie" alerte />
              <Compteur n={d.contrats_a_relier} libelle={t("auto.today.contrats")} vers="/admin/auto/recruits#contrats" alerte />
              <Compteur n={d.arrets_a_la_main} libelle={t("auto.today.arrets")} vers="/admin/auto/recruits#arrets" alerte />
              <Compteur n={d.paie_a_verifier} libelle={t("auto.today.paie")} vers="/admin/auto/payroll" alerte />
            </div>
            {d.kills.length > 0 && (
              <ul className="space-y-0.5" data-testid="kills-en-cours">
                {d.kills.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-2">
                    <Clock className="size-3.5 text-destructive" aria-hidden />
                    <span className="font-medium">{k.nom ?? "—"}</span>
                    <span className="text-muted-foreground">{t(`auto.today.etapes.${k.etape}`, { defaultValue: k.etape })}</span>
                    {k.prevu_at && <span className="text-destructive">{t("auto.today.killDans", { d: dans(k.prevu_at) })}</span>}
                    {k.statut === "simule" && <Badge variant="info">{t("interrupteurs.modes.test")}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// This week
// ---------------------------------------------------------------------------

const VARIANTE_JOUR: Record<EtatJour, "secondary" | "success" | "warning"> = { a_venir: "secondary", fait: "success", a_finir: "warning" };

/** Prompt 22, partie 3 : la semaine en une ligne, ce qui est fait et ce qui reste. */
export function CarteSemaine() {
  const { t } = useTranslation();
  const { jour } = useDates();
  const lu = useQuery({ queryKey: ["auto", "semaine"], queryFn: lireSemaine, refetchInterval: 5 * 60_000 });
  const s = lu.data;
  const jours = s ? joursSemaine(s) : [];
  return (
    <Card data-testid="carte-semaine">
      <CardHeader>
        <CardTitle className="text-base">{t("auto.semaine.titre")}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
        <ol className="grid gap-2 sm:grid-cols-4">
          {jours.map((j) => (
            <li key={j.jour} className="space-y-1 rounded-lg border p-2" data-jour={j.jour} data-etat={j.etat}>
              <p className="flex flex-wrap items-center justify-between gap-1 font-medium">
                <span>{jour(j.date)}</span>
                <Badge variant={VARIANTE_JOUR[j.etat]}>{t(`auto.semaine.etats.${j.etat}`)}</Badge>
              </p>
              <p className="text-muted-foreground">{t(`auto.semaine.${j.jour}.quoi`)}</p>
              {j.etat !== "a_venir" && s && (
                <p className={cn(j.etat === "a_finir" && "text-warning-foreground")}>
                  {t(`auto.semaine.${j.jour}.bilan`, {
                    fait: j.fait,
                    total: j.total,
                    reste: Math.max(0, j.total - j.fait),
                    lundi: s.lundi_messages,
                    soir: s.lundi_soir,
                  })}
                </p>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
