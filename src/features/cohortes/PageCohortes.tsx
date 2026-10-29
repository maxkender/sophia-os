import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Link2, Link2Off, Mail, Minus, X } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { drapeauPays } from "@/features/moteur/pays";
import { lireReglagesRelances } from "@/features/nudges/api";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import { arreterRecrue, lireCohortes, lireRecrues, relierContrat, type RecrueCohorte } from "./api";
import { AccueilAuto } from "@/features/accueil/AccueilAuto";
import { Arrets } from "./Arrets";
import { KillsAuto } from "./KillsAuto";
import {
  barre,
  caseEtape,
  cohorteParDefaut,
  cohortesParDefaut,
  entonnoir,
  estRouge,
  ETAPES_ENTONNOIR,
  ETAPES_PREPA,
  FILTRES_VIDES,
  filtrer,
  FOLLOWS_MIN,
  MORCEAUX_BARRE,
  phaseCohorte,
  pretLundiFige,
  quatreDernieres,
  samediRecrue,
  sansContrat,
  tableauHm,
  trierRecrues,
  type Case,
  type Detail,
  type Envoi,
  type FiltresCohorte,
  type MorceauBarre,
} from "./logique";

const CLE = ["cohortes"] as const;
const TH = "px-2 py-2 text-left text-xs font-medium text-muted-foreground";
const TD = "px-2 py-2 align-top text-sm";

function useDates() {
  const { i18n } = useTranslation();
  const langue = localeDate(i18n.resolvedLanguage ?? "fr");
  const jour = new Intl.DateTimeFormat(langue, { day: "numeric", month: "short", timeZone: "UTC" });
  const instant = new Intl.DateTimeFormat(langue, { day: "numeric", month: "short", timeZone: "Europe/Paris" });
  return {
    /** Un lundi (AAAA-MM-JJ). */
    jour: (d: string) => jour.format(new Date(`${d}T12:00:00Z`)),
    /** Un instant, jour à Paris. */
    le: (iso: string) => instant.format(new Date(iso)),
  };
}

// ---------------------------------------------------------------------------
// Une case : une seule information, icône + mot, jamais la couleur seule
// ---------------------------------------------------------------------------

function useTextes() {
  const { t } = useTranslation();
  const { le } = useDates();
  const canal = (x: string | null) => (x ? t(`nudges.canaux.${x}`, { defaultValue: x }) : null);
  const detail = (d: Detail, rouge: boolean) => {
    const encore = rouge ? "Rouge" : "";
    switch (d.cle) {
      case "connexion":
        return t(`cohortes.detail.connexion${encore}`);
      case "tiktok":
        return t(`cohortes.detail.tiktok${encore}`, { handle: d.handle ? `@${d.handle}` : "" });
      case "warmup":
        return d.start
          ? t("cohortes.detail.follows", { n: d.follows, min: FOLLOWS_MIN })
          : t("cohortes.detail.start", { n: d.follows, min: FOLLOWS_MIN });
      default:
        return t("cohortes.detail.mercredi");
    }
  };
  const envoi = (e: Envoi) =>
    e.type === "envoye"
      ? t("cohortes.envoi.envoye", { date: le(e.le), canal: canal(e.canal) })
      : e.type === "prevu"
        ? e.canal
          ? t("cohortes.envoi.prevuCanal", { canal: canal(e.canal) })
          : t("cohortes.envoi.prevu")
        : t("cohortes.envoi.bloque");
  /** La ligne rouge en une phrase : la relance, puis ce qui manque encore. */
  const pourquoi = (c: Extract<Case, { etat: "rouge" }>) => {
    const relance = !c.envoi
      ? t("cohortes.rouge.aucune")
      : c.envoi.type === "envoye"
        ? t("cohortes.rouge.envoyee", { date: le(c.envoi.le), canal: canal(c.envoi.canal) })
        : c.envoi.type === "prevu"
          ? t("cohortes.rouge.prevue")
          : t("cohortes.rouge.bloquee");
    return `${relance} · ${detail(c.detail, true)}`;
  };
  return { detail, envoi, pourquoi };
}

function CelluleEtape({ c }: { c: Case }) {
  const { t } = useTranslation();
  const { le } = useDates();
  const textes = useTextes();
  switch (c.etat) {
    case "fait":
      return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-success-foreground">
          <Check className="size-3.5 shrink-0" aria-hidden />
          {c.le ? le(c.le) : t("cohortes.case.fait")}
        </span>
      );
    case "rouge":
      return (
        <span className="inline-flex items-start gap-1 font-medium text-destructive" data-pourquoi>
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {textes.pourquoi(c)}
        </span>
      );
    case "encours":
      return (
        <span className="block space-y-0.5">
          <span className="block">{textes.detail(c.detail, false)}</span>
          {c.envoi && (
            <span
              className={cn(
                "flex items-center gap-1 text-xs",
                c.envoi.type === "bloque" ? "text-warning-foreground" : c.envoi.type === "prevu" ? "text-info-foreground" : "text-muted-foreground",
              )}
            >
              {c.envoi.type === "bloque" ? <Link2Off className="size-3 shrink-0" aria-hidden /> : <Mail className="size-3 shrink-0" aria-hidden />}
              {textes.envoi(c.envoi)}
            </span>
          )}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center text-muted-foreground" aria-label={t("cohortes.case.attente")}>
          —
        </span>
      );
  }
}

/** « Link » : coller le lien du contrat (même contrôle que la paie), sans quitter la page. */
function LierContrat({ r }: { r: RecrueCohorte }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const lier = useMutation({
    mutationFn: () => relierContrat(r.poster_id, url),
    onSuccess: () => {
      setOuvert(false);
      setUrl("");
      void qc.invalidateQueries({ queryKey: CLE });
    },
  });
  if (!ouvert) {
    return (
      <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setOuvert(true)}>
        <Link2 className="size-3" aria-hidden />
        {t("cohortes.lier")}
      </Button>
    );
  }
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      <Input
        className="h-7 w-56 text-xs"
        placeholder="https://www.upwork.com/nx/wm/workroom/…"
        aria-label={t("cohortes.lierAria", { nom: r.nom ?? "—" })}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <Button size="sm" className="h-7" disabled={!url.trim() || lier.isPending} onClick={() => lier.mutate()}>
        {t("cohortes.lierEnregistrer")}
      </Button>
      <Button size="sm" variant="ghost" className="h-7" onClick={() => setOuvert(false)}>
        {t("common.cancel")}
      </Button>
      {lier.error && <span className="w-full text-xs text-destructive">{(lier.error as Error).message}</span>}
    </span>
  );
}

function Recrue({ r, lectureSeule }: { r: RecrueCohorte; lectureSeule?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="flex items-center gap-1.5 font-medium">
        <span className="truncate">{r.nom ?? "—"}</span>
        {r.contrat_id ? (
          <Link2 className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("cohortes.contratRelie")} />
        ) : (
          <Link2Off className="size-3.5 shrink-0 text-warning-foreground" aria-label={t("cohortes.contratNonRelie")} />
        )}
        {!r.is_active && <Badge variant="secondary">{t("cohortes.arrete")}</Badge>}
      </p>
      <p className="text-xs text-muted-foreground">
        {[r.pays ? `${drapeauPays(r.pays)} ${r.pays}` : null, r.hm_prenom, r.handle ? `@${r.handle}` : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {!r.contrat_id && !lectureSeule && <LierContrat r={r} />}
    </div>
  );
}

function CellulePret({ r, maintenant }: { r: RecrueCohorte; maintenant: Date }) {
  const { t } = useTranslation();
  const pret = pretLundiFige(r, maintenant);
  if (pret === null) return <CelluleEtape c={{ etat: "apres" }} />;
  return pret ? (
    <span className="inline-flex items-center gap-1 text-success-foreground">
      <Check className="size-3.5" aria-hidden />
      {t("cohortes.pret")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <X className="size-3.5" aria-hidden />
      {t("cohortes.pasPret")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Le tableau des recrues (page Cohorts, et en lecture seule sur l'accueil HM)
// ---------------------------------------------------------------------------

export function TableauRecrues({
  recrues,
  lectureSeule,
  maintenant = new Date(),
}: {
  recrues: readonly RecrueCohorte[];
  lectureSeule?: boolean;
  maintenant?: Date;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const aujourdhui = aujourdhuiParis(maintenant);
  const finir = () => qc.invalidateQueries({ queryKey: CLE });
  const { role } = useAuth();
  // Système du 2 nov. : plus de « Reporter » ; « Arrêter » reste, pour l'admin seulement.
  const admin = role === "admin";
  const arreter = useMutation({ mutationFn: (id: string) => arreterRecrue(id), onSuccess: finir });
  const erreur = arreter.error as Error | null;
  const surArreter = (r: RecrueCohorte) => {
    if (window.confirm(t("cohortes.arreterConfirm", { nom: r.nom ?? "—" }))) arreter.mutate(r.poster_id);
  };

  const lignes = trierRecrues(recrues, aujourdhui);
  return (
    <div className="space-y-2">
      {erreur && <p className="text-sm text-destructive">{erreur.message}</p>}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[960px] border-collapse" data-testid="tableau-recrues">
          <thead className="bg-muted/40">
            <tr>
              <th className={TH}>{t("cohortes.col.recrue")}</th>
              <th className={TH}>{t("cohortes.col.acces")}</th>
              <th className={TH}>{t("cohortes.col.tiktok")}</th>
              <th className={TH}>{t("cohortes.col.warmup")}</th>
              <th className={TH}>{t("cohortes.col.pret")}</th>
              <th className={TH}>{t("cohortes.col.semaine1")}</th>
              <th className={TH}>{t("cohortes.col.samedi")}</th>
              {!lectureSeule && <th className={TH} />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {lignes.map((r) => {
              const rouge = estRouge(r);
              const samedi = samediRecrue(r, aujourdhui);
              const commence = aujourdhui >= r.cohorte_lundi;
              return (
                <tr key={r.poster_id} data-recrue={r.poster_id} data-rouge={rouge || undefined} className={cn(rouge && "bg-destructive/5")}>
                  <td className={TD}>
                    <Recrue r={r} lectureSeule={lectureSeule} />
                  </td>
                  {ETAPES_PREPA.map((e) => (
                    <td key={e} className={TD} data-case={e}>
                      <CelluleEtape c={caseEtape(r, e, aujourdhui)} />
                    </td>
                  ))}
                  <td className={TD} data-case="pret">
                    <CellulePret r={r} maintenant={maintenant} />
                  </td>
                  <td className={TD} data-case="semaine1">
                    {commence ? (
                      <>
                        <CelluleEtape c={caseEtape(r, "mercredi", aujourdhui)} />
                        <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                          {r.semaine1.map((c) => (
                            <li key={c.compte_id}>
                              {t("cohortes.postsCompte", {
                                compte: c.handle ? `@${c.handle}` : "—",
                                publies: c.publies,
                                prevus: c.prevus,
                              })}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <CelluleEtape c={{ etat: "apres" }} />
                    )}
                  </td>
                  <td className={TD}>
                    {samedi === "attente" ? (
                      <CelluleEtape c={{ etat: "apres" }} />
                    ) : (
                      <Badge variant={samedi === "kill" || samedi === "arrete" ? "error" : samedi === "a_decider" ? "warning" : "success"}>
                        {t(`cohortes.samedi.${samedi}`)}
                      </Badge>
                    )}
                  </td>
                  {!lectureSeule && (
                    <td className={cn(TD, "whitespace-nowrap text-right")}>
                      {rouge && r.is_active && admin && (
                        <Button size="sm" variant="destructive" disabled={arreter.isPending} onClick={() => surArreter(r)}>
                          {t("cohortes.arreter")}
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {lignes.length === 0 && (
              <tr>
                <td className={cn(TD, "text-muted-foreground")} colSpan={lectureSeule ? 7 : 8}>
                  {t("cohortes.aucune")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Le haut de page
// ---------------------------------------------------------------------------

const COULEUR_MORCEAU: Record<MorceauBarre, string> = {
  connexion: "bg-muted-foreground/40",
  tiktok: "bg-info/60",
  warmup: "bg-warning/70",
  prets: "bg-success/70",
  rouges: "bg-destructive/80",
};

/** « Where they are now » : chaque recrue une seule fois, à l'étape où elle bloque. Clic = filtre. */
function BarreOuIlsEnSont({
  recrues,
  actif,
  onChange,
}: {
  recrues: readonly RecrueCohorte[];
  actif: MorceauBarre | null;
  onChange: (m: MorceauBarre | null) => void;
}) {
  const { t } = useTranslation();
  const n = barre(recrues);
  const total = recrues.length || 1;
  return (
    <Card data-testid="barre-cohorte">
      <CardHeader>
        <CardTitle>{t("cohortes.barre.titre")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          {MORCEAUX_BARRE.map((m) => (
            <div key={m} className={COULEUR_MORCEAU[m]} style={{ width: `${(100 * n[m]) / total}%` }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("cohortes.barre.titre")}>
          {MORCEAUX_BARRE.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={actif === m}
              data-morceau={m}
              onClick={() => onChange(actif === m ? null : m)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                actif === m ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              <span aria-hidden className={cn("size-2.5 rounded-full", COULEUR_MORCEAU[m])} />
              {t(`cohortes.barre.${m}`, { n: n[m] })}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** L'entonnoir d'une cohorte passée : chaque colonne ne compte que ceux qui ont fait les étapes d'avant. */
function Entonnoir({ recrues, maintenant }: { recrues: readonly RecrueCohorte[]; maintenant: Date }) {
  const { t } = useTranslation();
  const n = entonnoir(recrues, aujourdhuiParis(maintenant), maintenant);
  return (
    <Card data-testid="entonnoir">
      <CardHeader>
        <CardTitle>{t("cohortes.entonnoir.titre")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("cohortes.entonnoir.aide")}</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <ol className="flex min-w-[640px] items-stretch gap-1">
          {ETAPES_ENTONNOIR.map((e, i) => (
            <li key={e} className="flex-1 rounded-md border bg-muted/30 px-2 py-1.5" data-entonnoir={e}>
              <p className="text-xs text-muted-foreground">{t(`cohortes.entonnoir.${e}`)}</p>
              <p className="text-lg font-semibold tabular-nums">{n[e]}</p>
              {i > 0 && n.offre > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">{Math.round((100 * n[e]) / n.offre)} %</p>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/** L'état des relances (réglage relances_auto), pour l'admin. */
function EtatRelances() {
  const { t } = useTranslation();
  const r = useQuery({ queryKey: ["reglages", "relances"], queryFn: lireReglagesRelances });
  if (!r.data) return null;
  return (
    <p className="text-sm" data-testid="etat-relances">
      {t("cohortes.relances", { mode: t(`nudges.mode.${r.data.mode}`) })}{" "}
      <Link to="/admin/auto/sent" className="text-primary underline-offset-2 hover:underline">
        {t("cohortes.relancesLien")}
      </Link>
    </p>
  );
}

// ---------------------------------------------------------------------------
// La page
// ---------------------------------------------------------------------------

/**
 * Cohorts (prompt 17, partie B ; plus lisible le 28 oct.). Une cohorte à la
 * fois, par défaut celle « getting ready ». En préparation : la barre « Where
 * they are now » ; passée : l'entonnoir séquentiel. Puis une ligne par recrue
 * (rouges d'abord), « Link » sur un contrat non relié, Postpone / Stop sur
 * une ligne rouge, et un petit tableau par HM.
 */
export function PageCohortes({ maintenant: fixe }: { maintenant?: Date } = {}) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const { jour } = useDates();
  const maintenant = React.useMemo(() => fixe ?? new Date(), [fixe]);
  const aujourdhui = aujourdhuiParis(maintenant);
  const cohortes = useQuery({ queryKey: [...CLE, "liste"], queryFn: lireCohortes });
  const lundis = React.useMemo(() => (cohortes.data ?? []).map((c) => c.lundi), [cohortes.data]);
  const [choix, setChoix] = React.useState<string | null>(null);
  const [anciennes, setAnciennes] = React.useState(false);
  const choisie = choix ?? cohorteParDefaut(lundis, aujourdhui);
  const [filtres, setFiltres] = React.useState<FiltresCohorte>(FILTRES_VIDES);

  const recrues = useQuery({
    queryKey: [...CLE, "recrues", choisie ? [choisie] : []],
    queryFn: () => lireRecrues(choisie ? [choisie] : []),
    enabled: Boolean(choisie),
  });
  const choisir = (l: string) => {
    setChoix(l);
    setFiltres(FILTRES_VIDES);
  };

  const visibles = anciennes ? cohortes.data ?? [] : (cohortes.data ?? []).slice(0, 6);
  const toutes = recrues.data ?? [];
  const lignes = filtrer(toutes, filtres);
  const nbSansContrat = toutes.filter((r) => r.is_active && sansContrat(r)).length;
  const hms = [...new Map(toutes.filter((r) => r.hm_id).map((r) => [r.hm_id!, r.hm_prenom ?? "—"])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const pays = [...new Set(toutes.map((r) => r.pays).filter((p): p is string => Boolean(p)))].sort();
  const libelle = (l: string) => {
    const p = phaseCohorte(l, aujourdhui);
    return p.prepa ? t("cohortes.prepa") : t("cohortes.semaine", { n: p.semaine });
  };
  const enPrepa = Boolean(choisie && choisie > aujourdhui);
  const filtre = filtres.morceau !== null || filtres.sansContrat || Boolean(filtres.hm) || Boolean(filtres.pays);

  return (
    <div className="space-y-6" data-testid="page-cohortes">
      <PageHeader title={t("cohortes.titre")} description={t("cohortes.description")} />

      {role === "admin" && <EtatRelances />}

      {/* Système du 2 nov., partie A : l'accueil automatique des nouveaux contrats. */}
      <AccueilAuto />

      {/* Partie B : les Kills automatiques (48 h sans réaction), annulables 12 h. */}
      <KillsAuto maintenant={maintenant} />

      {/* Partie C : les arrêts complets, action par action, et « À retirer de Slack ». */}
      <Arrets />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("cohortes.puces")}>
        {visibles.map((c) => {
          const actif = choisie === c.lundi;
          return (
            <button
              key={c.lundi}
              type="button"
              aria-pressed={actif}
              onClick={() => choisir(c.lundi)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                actif ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {t("cohortes.puce", { date: jour(c.lundi), n: c.recrues, phase: libelle(c.lundi) })}
              {c.rouges > 0 && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 font-medium">
                  <AlertTriangle className="size-3" aria-hidden />
                  {t("cohortes.rougesPuce", { n: c.rouges })}
                </span>
              )}
            </button>
          );
        })}
        {(cohortes.data?.length ?? 0) > 6 && (
          <Button size="sm" variant="ghost" onClick={() => setAnciennes((x) => !x)}>
            {anciennes ? t("cohortes.replier") : t("cohortes.anciennes", { n: (cohortes.data?.length ?? 0) - 6 })}
          </Button>
        )}
      </div>

      {cohortes.error && <p className="text-sm text-destructive">{(cohortes.error as Error).message}</p>}
      {recrues.error && <p className="text-sm text-destructive">{(recrues.error as Error).message}</p>}

      {choisie &&
        recrues.data &&
        (enPrepa ? (
          <BarreOuIlsEnSont recrues={toutes} actif={filtres.morceau} onChange={(m) => setFiltres({ ...filtres, morceau: m })} />
        ) : (
          <Entonnoir recrues={toutes} maintenant={maintenant} />
        ))}

      {nbSansContrat > 0 && (
        <button
          type="button"
          aria-pressed={filtres.sansContrat}
          data-testid="compteur-contrats"
          onClick={() => setFiltres({ ...filtres, sansContrat: !filtres.sansContrat })}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm",
            filtres.sansContrat ? "border-warning bg-warning/20" : "border-warning/50 bg-warning/10 hover:bg-warning/20",
          )}
        >
          <Link2Off className="size-4" aria-hidden />
          {t("cohortes.sansContrat", { count: nbSansContrat })}
        </button>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select
          aria-label={t("cohortes.filtres.hm")}
          className="h-8 rounded-md border bg-background px-2"
          value={filtres.hm}
          onChange={(e) => setFiltres({ ...filtres, hm: e.target.value })}
        >
          <option value="">{t("cohortes.filtres.toutesHm")}</option>
          {hms.map(([id, prenom]) => (
            <option key={id} value={id}>
              {prenom}
            </option>
          ))}
        </select>
        <select
          aria-label={t("cohortes.filtres.pays")}
          className="h-8 rounded-md border bg-background px-2"
          value={filtres.pays}
          onChange={(e) => setFiltres({ ...filtres, pays: e.target.value })}
        >
          <option value="">{t("cohortes.filtres.tousPays")}</option>
          {pays.map((p) => (
            <option key={p} value={p}>
              {drapeauPays(p)} {p}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground">{t("cohortes.nbLignes", { n: lignes.length })}</span>
        {filtre && (
          <Button size="sm" variant="ghost" onClick={() => setFiltres(FILTRES_VIDES)}>
            <Minus className="size-3" aria-hidden />
            {t("cohortes.filtres.effacer")}
          </Button>
        )}
      </div>

      <TableauRecrues recrues={lignes} maintenant={maintenant} />

      <TableauParHm maintenant={maintenant} />
    </div>
  );
}

/**
 * Le petit tableau par HM, sur les 4 dernières cohortes commencées (Cohorts,
 * puis Recruits au prompt 22, partie 4).
 */
export function TableauParHm({ maintenant: fixe }: { maintenant?: Date } = {}) {
  const { t } = useTranslation();
  const { jour } = useDates();
  const maintenant = React.useMemo(() => fixe ?? new Date(), [fixe]);
  const aujourdhui = aujourdhuiParis(maintenant);
  const cohortes = useQuery({ queryKey: [...CLE, "liste"], queryFn: lireCohortes });
  const dernieres = quatreDernieres((cohortes.data ?? []).map((c) => c.lundi), aujourdhui);
  const parHm = useQuery({
    queryKey: [...CLE, "recrues", dernieres],
    queryFn: () => lireRecrues(dernieres),
    enabled: dernieres.length > 0,
  });
  return (
    <Card data-testid="tableau-hm">
      <CardHeader>
        <CardTitle>{t("cohortes.parHm.titre")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("cohortes.parHm.aide", { cohortes: dernieres.map(jour).join(", ") || "—" })}
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {(cohortes.error || parHm.error) && (
          <p className="text-sm text-destructive">{((cohortes.error ?? parHm.error) as Error).message}</p>
        )}
        <table className="w-full min-w-[420px] border-collapse">
          <thead>
            <tr>
              <th className={TH}>{t("cohortes.parHm.hm")}</th>
              <th className={TH}>{t("cohortes.parHm.recrues")}</th>
              <th className={TH}>{t("cohortes.parHm.pretes")}</th>
              <th className={TH}>{t("cohortes.parHm.gardees")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tableauHm(parHm.data ?? [], aujourdhui, maintenant).map((l) => (
              <tr key={l.hm_id ?? "sans"}>
                <td className={TD}>{l.hm_prenom ?? t("cohortes.parHm.sansHm")}</td>
                <td className={cn(TD, "tabular-nums")}>{l.recrues}</td>
                <td className={cn(TD, "tabular-nums")}>{l.pretes === null ? "—" : `${l.pretes} %`}</td>
                <td className={cn(TD, "tabular-nums")}>{l.gardees === null ? "—" : `${l.gardees} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/**
 * L'accueil HM (prompt 17, partie B) : le même tableau, en lecture seule, sur
 * ses recrues de la cohorte en préparation et de celle en semaine 1. La base
 * ne rend à une HM que les siennes ; le Head of Ops choisit la HM (`hm`).
 */
export function MesRecrues({ hm }: { hm?: string }) {
  const { t } = useTranslation();
  const aujourdhui = aujourdhuiParis();
  const cohortes = useQuery({ queryKey: [...CLE, "liste"], queryFn: lireCohortes });
  const lundis = cohortesParDefaut((cohortes.data ?? []).map((c) => c.lundi), aujourdhui);
  const recrues = useQuery({
    queryKey: [...CLE, "recrues", [...lundis].sort()],
    queryFn: () => lireRecrues(lundis),
    enabled: lundis.length > 0,
  });
  const lignes = (recrues.data ?? []).filter((r) => !hm || r.hm_id === hm);
  return (
    <Card data-testid="mes-recrues">
      <CardHeader>
        <CardTitle>{t("cohortes.mesRecrues")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("cohortes.mesRecruesAide")}</p>
      </CardHeader>
      <CardContent>
        {(recrues.error || cohortes.error) && (
          <p className="text-sm text-destructive">{((recrues.error ?? cohortes.error) as Error).message}</p>
        )}
        <TableauRecrues recrues={lignes} lectureSeule />
      </CardContent>
    </Card>
  );
}
