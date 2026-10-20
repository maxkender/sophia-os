import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, ExternalLink, Lock, LockOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  activerRegionCommentMaster,
  type CandidatCommentMaster,
  choisirCommentMaster,
  type ConfigCommentMasters,
  lireConfigCommentMasters,
  lireDernierRecalibrage,
  lireStatsCommentMasters,
  listerCandidatsCommentMasters,
  majCanalSlack,
  majSeuilPays,
  majVerrouPays,
  type MandatCommentMaster,
  type PaysCommentMaster,
  type RegionCommentMaster,
  type StatsCommentMasters,
  verifierCanalSlack,
  type VerdictCanalSlack,
} from "@/features/commentMasters/api";
import {
  AGE_ABANDON_MIN,
  bonus,
  CADENCE_RELEVE_MIN,
  canalVerifie,
  CIBLE_DECLENCHEMENT,
  coutEstime,
  decalerMois,
  erreurSlack,
  etatRegion,
  faitsDeRegion,
  fautInviterBot,
  LIENS_PAR_LOT,
  moisParis,
  PART_SEUIL_ABANDON,
  regionsTriees,
  seuilValide,
  SEUIL_PLANCHER,
  tauxDeclenchement,
} from "@/features/commentMasters/logique";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { drapeauPays, nomPaysIso } from "@/features/moteur/pays";
import { cn } from "@/lib/utils";

const CLE = ["comment-masters"] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function useFormatDate() {
  const { i18n } = useTranslation();
  return React.useCallback(
    (iso: string | null | undefined, avecHeure = false) => {
      if (!iso) return "";
      return new Intl.DateTimeFormat(i18n.language, {
        timeZone: "Europe/Paris",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...(avecHeure ? { hour: "2-digit", minute: "2-digit" } : {}),
      }).format(new Date(iso));
    },
    [i18n.language],
  );
}

function usd(n: number): string {
  return `${n.toFixed(2)} $`;
}

/** Le message d'une erreur Slack (ou d'activation), traduit. */
function TexteErreurSlack({ code, depuis }: { code: string | null | undefined; depuis?: string | null }) {
  const { t } = useTranslation();
  const formater = useFormatDate();
  const erreur = erreurSlack(code);
  if (!erreur) return null;
  const message = t(`commentMasters.erreurs.${erreur.cle}`, { droit: erreur.droit ?? "", code: code ?? "" });
  return (
    <p role="alert" className="text-xs text-destructive">
      {depuis ? t("commentMasters.erreurDepuis", { message, date: formater(depuis, true) }) : message}
    </p>
  );
}

/**
 * Admin → Comment masters (TICKET 002, migration 0321) : une ligne par région
 * (une langue, un comment master, un canal Slack), ses pays avec leur seuil et
 * leur cadenas, les commentaires faits dans le mois par personne (bonus), et
 * le coût des relevés de la semaine. Tout se règle ici, sans redéploiement :
 * la fonction relit la configuration à chaque passage.
 */
export function AdminCommentMastersPage() {
  const { t, i18n } = useTranslation();
  const [mois, setMois] = React.useState(() => moisParis());

  const config = useQuery({ queryKey: [...CLE, "config"], queryFn: lireConfigCommentMasters });
  const candidats = useQuery({ queryKey: [...CLE, "candidats"], queryFn: listerCandidatsCommentMasters });
  const stats = useQuery({ queryKey: [...CLE, "stats", mois], queryFn: () => lireStatsCommentMasters(mois) });
  const recalibrage = useQuery({ queryKey: [...CLE, "recalibrage"], queryFn: lireDernierRecalibrage });

  const erreur = config.error ?? candidats.error ?? stats.error;
  const libelleMois = new Intl.DateTimeFormat(i18n.language, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${mois}T00:00:00Z`));

  return (
    <div className="space-y-6" data-testid="page-comment-masters">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">{t("commentMasters.titre")}</h2>
        <p className="text-xs text-muted-foreground">{t("commentMasters.description")}</p>
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          <li>
            {t("commentMasters.regleReleves", {
              cadence: CADENCE_RELEVE_MIN / 60,
              abandon: AGE_ABANDON_MIN / 60,
              part: Math.round(PART_SEUIL_ABANDON * 100),
              lot: LIENS_PAR_LOT,
            })}
          </li>
          <li>{t("commentMasters.regleRecalibrage", { cible: Math.round(1 / CIBLE_DECLENCHEMENT) })}</li>
          <li>{t("commentMasters.regleSeuil", { plancher: SEUIL_PLANCHER.toLocaleString() })}</li>
          <li>{t("commentMasters.regleBonus")}</li>
        </ul>
      </div>

      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(erreur)}
        </p>
      )}

      <Tuiles config={config.data} stats={stats.data} libelleMois={libelleMois} />
      <LigneRecalibrage dernier={recalibrage.data ?? null} />

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("commentMasters.moisPrecedent")}
          onClick={() => setMois((m) => decalerMois(m, -1))}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-36 text-center text-sm font-medium capitalize">{libelleMois}</span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("commentMasters.moisSuivant")}
          disabled={mois >= moisParis()}
          onClick={() => setMois((m) => decalerMois(m, 1))}
        >
          <ChevronRight />
        </Button>
      </div>

      {!config.data && !erreur && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {config.data &&
        regionsTriees(config.data.regions, nomLangue).map((r) => (
          <CarteRegion
            key={r.langue}
            region={r}
            pays={config.data.pays.filter((p) => p.langue === r.langue)}
            mandats={config.data.mandats.filter((m) => m.langue === r.langue)}
            candidats={(candidats.data ?? []).filter((c) => c.langue === r.langue)}
            stats={stats.data}
            libelleMois={libelleMois}
          />
        ))}
    </div>
  );
}

function Tuile({ titre, valeur, detail }: { titre: string; valeur: string; detail: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">{titre}</p>
        <p className="text-xl font-semibold tabular-nums">{valeur}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function Tuiles({
  config,
  stats,
  libelleMois,
}: {
  config: ConfigCommentMasters | undefined;
  stats: StatsCommentMasters | undefined;
  libelleMois: string;
}) {
  const { t } = useTranslation();
  const releves = stats?.releves_7j.releves ?? 0;
  const commentaires = stats?.commentaires_7j ?? 0;
  const actives = config?.regions.filter((r) => r.actif).length ?? 0;
  const faits = (stats?.regions ?? []).reduce((n, r) => n + r.faits, 0);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="tuiles-comment-masters">
      <Tuile
        titre={t("commentMasters.tuiles.releves")}
        valeur={releves.toLocaleString()}
        detail={t("commentMasters.tuiles.relevesDetail", {
          lots: stats?.releves_7j.lots ?? 0,
          echecs: stats?.releves_7j.echecs ?? 0,
        })}
      />
      <Tuile
        titre={t("commentMasters.tuiles.cout")}
        valeur={usd(coutEstime(releves, commentaires))}
        detail={t("commentMasters.tuiles.coutDetail", { commentaires })}
      />
      <Tuile
        titre={t("commentMasters.tuiles.regions")}
        valeur={`${actives} / ${config?.regions.length ?? 0}`}
        detail={t("commentMasters.tuiles.regionsDetail")}
      />
      <Tuile
        titre={t("commentMasters.tuiles.faits")}
        valeur={String(faits)}
        detail={t("commentMasters.tuiles.faitsDetail", { mois: libelleMois })}
      />
    </div>
  );
}

function LigneRecalibrage({ dernier }: { dernier: Awaited<ReturnType<typeof lireDernierRecalibrage>> }) {
  const { t } = useTranslation();
  const formater = useFormatDate();
  if (!dernier) return <p className="text-xs text-muted-foreground">{t("commentMasters.aucunRecalibrage")}</p>;
  return (
    <div className="text-xs text-muted-foreground">
      <p>
        {t("commentMasters.dernierRecalibrage", {
          date: formater(dernier.at),
          n: dernier.changements.length,
          ignores: dernier.echantillon_insuffisant,
        })}
      </p>
      {dernier.changements.length > 0 && (
        <p>
          {dernier.changements
            .map((c) => `${drapeauPays(c.pays)} ${c.pays} ${c.ancien.toLocaleString()} → ${c.nouveau.toLocaleString()}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

function CarteRegion({
  region,
  pays,
  mandats,
  candidats,
  stats,
  libelleMois,
}: {
  region: RegionCommentMaster;
  pays: PaysCommentMaster[];
  mandats: MandatCommentMaster[];
  candidats: CandidatCommentMaster[];
  stats: StatsCommentMasters | undefined;
  libelleMois: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { etat, manques } = etatRegion(region);
  const [verdict, setVerdict] = React.useState<VerdictCanalSlack | null>(null);
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: CLE });

  const basculer = useMutation({
    mutationFn: (actif: boolean) => activerRegionCommentMaster(region.langue, actif),
    onSuccess: (r) => setVerdict(r.ok ? null : r),
    onSettled: rafraichir,
  });

  const variante = etat === "active" ? "success" : etat === "prete" ? "info" : "outline";
  const statsRegion = stats?.regions.find((s) => s.langue === region.langue);

  return (
    <Card data-testid={`region-${region.langue}`}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <span>{drapeauLangue(region.langue)}</span>
              <span>{nomLangue(region.langue)}</span>
              <span className="text-xs font-normal text-muted-foreground">{region.langue}</span>
              <Badge variant={variante}>{t(`commentMasters.etat.${etat}`)}</Badge>
            </CardTitle>
            {manques.length > 0 && (
              <CardDescription>
                {t("commentMasters.manque", {
                  liste: manques.map((m) => t(`commentMasters.manques.${m}`)).join(", "),
                })}
              </CardDescription>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span>{t("commentMasters.interrupteur")}</span>
            <Switch
              checked={region.actif}
              disabled={basculer.isPending || (!region.actif && manques.includes("comment_master"))}
              onCheckedChange={(v) => basculer.mutate(v === true)}
              aria-label={t("commentMasters.interrupteurAria", { langue: nomLangue(region.langue) })}
            />
          </label>
        </div>
        {basculer.isError && <p className="text-xs text-destructive">{messageErreur(basculer.error)}</p>}
        {verdict && !verdict.ok && <TexteErreurSlack code={verdict.code} />}
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <BlocCommentMaster region={region} mandats={mandats} candidats={candidats} />
          <BlocCanal region={region} />
          <div className="space-y-1">
            <p className="text-xs font-medium">{t("commentMasters.fenetre")}</p>
            <p className="text-sm">{t("commentMasters.fenetreValeur", { h: region.fenetre_heures })}</p>
          </div>
        </div>
        <div className="space-y-5">
          <BlocPays region={region} pays={pays} stats={stats} />
          <BlocMois
            langue={region.langue}
            stats={stats}
            envoyes={statsRegion?.envoyes ?? 0}
            faits={statsRegion?.faits ?? 0}
            libelleMois={libelleMois}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function BlocCommentMaster({
  region,
  mandats,
  candidats,
}: {
  region: RegionCommentMaster;
  mandats: MandatCommentMaster[];
  candidats: CandidatCommentMaster[];
}) {
  const { t } = useTranslation();
  const formater = useFormatDate();
  const queryClient = useQueryClient();
  const choisir = useMutation({
    mutationFn: (profileId: string | null) => choisirCommentMaster(region.langue, profileId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });

  const nom = (c: CandidatCommentMaster) => [c.prenom, c.nom].filter(Boolean).join(" ") || c.profile_id;
  const actuel = candidats.find((c) => c.profile_id === region.comment_master_id);
  const enCours = mandats.find((m) => !m.fin);
  const passes = mandats.filter((m) => m.fin);

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" htmlFor={`cm-${region.langue}`}>
        {t("commentMasters.commentMaster")}
      </label>
      <select
        id={`cm-${region.langue}`}
        className={selectClass}
        value={region.comment_master_id ?? ""}
        disabled={choisir.isPending}
        onChange={(e) => {
          const valeur = e.target.value || null;
          if (region.actif && !valeur && !window.confirm(t("commentMasters.confirmerRetrait"))) return;
          choisir.mutate(valeur);
        }}
      >
        <option value="">{t("commentMasters.aucun")}</option>
        {region.comment_master_id && !actuel && (
          <option value={region.comment_master_id}>
            {region.comment_master ?? region.comment_master_id} {t("commentMasters.plusActif")}
          </option>
        )}
        {candidats.map((c) => (
          <option key={c.profile_id} value={c.profile_id}>
            {nom(c)}
          </option>
        ))}
      </select>
      {candidats.length === 0 && <p className="text-xs text-muted-foreground">{t("commentMasters.aucunCandidat")}</p>}
      {choisir.isError && <p className="text-xs text-destructive">{messageErreur(choisir.error)}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {enCours && <span>{t("commentMasters.depuis", { date: formater(enCours.debut) })}</span>}
        {actuel && (
          <Link to={`/admin/createurs/${actuel.compte_id}`} className="inline-flex items-center gap-1 underline">
            {t("commentMasters.voirFiche")}
            <ExternalLink className="size-3" />
          </Link>
        )}
      </div>
      {passes.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">{t("commentMasters.historique", { n: passes.length })}</summary>
          <ul className="mt-1 space-y-0.5 pl-4">
            {passes.map((m) => (
              <li key={m.id}>
                {t("commentMasters.mandat", { nom: m.nom, debut: formater(m.debut), fin: formater(m.fin) })}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function BlocCanal({ region }: { region: RegionCommentMaster }) {
  const { t } = useTranslation();
  const formater = useFormatDate();
  const queryClient = useQueryClient();
  const [brouillon, setBrouillon] = React.useState<string | null>(null);
  const [verdict, setVerdict] = React.useState<VerdictCanalSlack | null>(null);
  const valeur = brouillon ?? region.slack_channel_id ?? "";
  const modifie = brouillon !== null && brouillon.trim() !== (region.slack_channel_id ?? "");

  const verifier = useMutation({
    mutationFn: () => verifierCanalSlack(region.langue),
    onSuccess: setVerdict,
    onSettled: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });
  const enregistrer = useMutation({
    mutationFn: () => majCanalSlack(region.langue, valeur),
    onSuccess: () => {
      setBrouillon(null);
      // Un canal enregistré est vérifié tout de suite : l'erreur s'affiche ici.
      if (valeur.trim()) verifier.mutate();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });

  const verifie = canalVerifie(region);
  const code = verdict && !verdict.ok ? verdict.code : region.slack_erreur;
  const bot = verdict?.bot ?? null;

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" htmlFor={`canal-${region.langue}`}>
        {t("commentMasters.canal")}
      </label>
      <div className="flex gap-2">
        <Input
          id={`canal-${region.langue}`}
          value={valeur}
          placeholder="C0…"
          onChange={(e) => setBrouillon(e.target.value)}
          className="font-mono"
        />
        <Button variant="outline" disabled={!modifie || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
          {t("common.save")}
        </Button>
        <Button
          variant="outline"
          disabled={!region.slack_channel_id || modifie || verifier.isPending}
          onClick={() => verifier.mutate()}
        >
          {verifier.isPending ? t("commentMasters.verification") : t("commentMasters.verifier")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("commentMasters.canalAide", { langue: region.langue })}</p>
      {verifie && !code && (
        <p className="text-xs text-success">
          {t("commentMasters.verifie", {
            nom: region.slack_canal_nom ?? region.slack_channel_id,
            date: formater(region.slack_verifie_at, true),
          })}
        </p>
      )}
      {region.slack_channel_id && !verifie && !code && (
        <p className="text-xs text-muted-foreground">{t("commentMasters.nonVerifie")}</p>
      )}
      <TexteErreurSlack code={code} depuis={verdict ? null : region.slack_erreur_at} />
      {fautInviterBot(code) && (
        <p className="text-xs text-muted-foreground">
          {bot ? t("commentMasters.inviter", { bot }) : t("commentMasters.inviterSansNom")}
        </p>
      )}
      {(enregistrer.isError || verifier.isError) && (
        <p className="text-xs text-destructive">{messageErreur(enregistrer.error ?? verifier.error)}</p>
      )}
    </div>
  );
}

function BlocPays({
  region,
  pays,
  stats,
}: {
  region: RegionCommentMaster;
  pays: PaysCommentMaster[];
  stats: StatsCommentMasters | undefined;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{t("commentMasters.pays.titre", { h: region.fenetre_heures })}</p>
      <p className="text-xs text-muted-foreground">{t("commentMasters.pays.aide")}</p>
      <ul className="divide-y rounded-md border">
        {pays.map((p) => (
          <LignePays
            key={p.pays}
            pays={p}
            mesure={stats?.pays_7j.find((s) => s.langue === p.langue && s.pays === p.pays)}
          />
        ))}
      </ul>
    </div>
  );
}

function LignePays({
  pays,
  mesure,
}: {
  pays: PaysCommentMaster;
  mesure: StatsCommentMasters["pays_7j"][number] | undefined;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [brouillon, setBrouillon] = React.useState<string | null>(null);
  const [invalide, setInvalide] = React.useState(false);
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: CLE });

  const seuil = useMutation({
    mutationFn: (valeur: number) => majSeuilPays(pays.langue, pays.pays, valeur),
    onSuccess: () => setBrouillon(null),
    onSettled: rafraichir,
  });
  const verrou = useMutation({
    mutationFn: () => majVerrouPays(pays.langue, pays.pays, !pays.verrou),
    onSettled: rafraichir,
  });

  const valider = () => {
    if (brouillon === null) return;
    const valeur = Number(brouillon.replace(/[\s\u202f.,]/g, ""));
    if (!seuilValide(valeur)) {
      setInvalide(true);
      return;
    }
    setInvalide(false);
    if (valeur === pays.seuil_vues) setBrouillon(null);
    else seuil.mutate(valeur);
  };

  const taux = mesure ? tauxDeclenchement(mesure.declenches, mesure.conclus) : null;

  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2" data-testid={`pays-${pays.langue}-${pays.pays}`}>
      <span className="w-40 truncate text-sm">
        {drapeauPays(pays.pays)} {nomPaysIso(pays.pays)}
        <span className="ml-1 text-xs text-muted-foreground">{pays.pays}</span>
      </span>
      <Input
        type="text"
        inputMode="numeric"
        aria-label={t("commentMasters.pays.seuilAria", { pays: pays.pays })}
        aria-invalid={invalide || undefined}
        className="w-28 tabular-nums"
        value={brouillon ?? String(pays.seuil_vues)}
        disabled={seuil.isPending}
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={valider}
        onKeyDown={(e) => {
          if (e.key === "Enter") valider();
          if (e.key === "Escape") {
            setBrouillon(null);
            setInvalide(false);
          }
        }}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={verrou.isPending}
        onClick={() => verrou.mutate()}
        aria-pressed={pays.verrou}
        aria-label={pays.verrou ? t("commentMasters.pays.deverrouiller") : t("commentMasters.pays.verrouiller")}
        title={pays.verrou ? t("commentMasters.pays.verrouFerme") : t("commentMasters.pays.verrouOuvert")}
      >
        {pays.verrou ? <Lock /> : <LockOpen className="text-muted-foreground" />}
      </Button>
      <Badge variant={pays.seuil_source === "provisoire" ? "warning" : "outline"}>
        {t(`commentMasters.pays.source.${pays.seuil_source}`)}
      </Badge>
      <span className={cn("ml-auto text-xs text-muted-foreground tabular-nums")}>
        {mesure && mesure.conclus > 0
          ? t("commentMasters.pays.taux", {
              declenches: mesure.declenches,
              conclus: mesure.conclus,
              taux: `${Math.round((taux ?? 0) * 1000) / 10} %`,
            })
          : t("commentMasters.pays.tauxVide")}
      </span>
      {invalide && (
        <p className="w-full text-xs text-destructive">
          {t("commentMasters.pays.invalide", { plancher: SEUIL_PLANCHER.toLocaleString() })}
        </p>
      )}
      {(seuil.isError || verrou.isError) && (
        <p className="w-full text-xs text-destructive">{messageErreur(seuil.error ?? verrou.error)}</p>
      )}
    </li>
  );
}

function BlocMois({
  langue,
  stats,
  envoyes,
  faits,
  libelleMois,
}: {
  langue: string;
  stats: StatsCommentMasters | undefined;
  envoyes: number;
  faits: number;
  libelleMois: string;
}) {
  const { t } = useTranslation();
  const personnes = faitsDeRegion(stats, langue);
  return (
    <div className="space-y-1.5" data-testid={`mois-${langue}`}>
      <p className="text-xs font-medium capitalize">{libelleMois}</p>
      <p className="text-sm">{t("commentMasters.moisResume", { envoyes, faits })}</p>
      {personnes.length > 0 && (
        <ul className="space-y-0.5 text-sm">
          {personnes.map((p) => {
            const b = bonus(p.faits);
            return (
              <li key={`${p.profile_id ?? "?"}-${p.nom}`} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{p.nom || t("commentMasters.sansCommentMaster")}</span>
                <span>{t("commentMasters.commentaires", { count: p.faits })}</span>
                <span className="text-muted-foreground">
                  {t("commentMasters.bonus", { dollars: b.dollars, reste: b.resteAvantProchain })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
