import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Bot, Check, ChevronLeft, ChevronRight, Film, ListChecks, Plus, SkipForward, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  enregistrerAvisRelecture,
  listerAvisRelecture,
  listerJoursRelecture,
  listerRelecturesBanc,
  listerReviewRemarques,
  supprimerAvisRelecture,
  type RelectureBanc,
} from "@/features/moteur/api";
import {
  CLE_AUCUN,
  CODES_RATE,
  cleDefaut,
  estJuge,
  estJugeable,
  grouperAvis,
  nouvelleCleRate,
  pointsAJuger,
  pourcentage,
  statsBanc,
  type AvisRelecture,
  type StatsBanc,
  type VerdictAvis,
} from "@/features/reviews/bancRelecture";
import {
  libelleDefaut,
  MAX_POINTS_REVIEW,
  relectureFinie,
  videosDuBrouillon,
  type DefautRelecture,
} from "@/features/reviews/relectureAgent";
import { TikTokEmbed } from "@/features/reviews/TikTokEmbed";
import { cn } from "@/lib/utils";

type Filtre = "tous" | "avecMessage" | "sansMessage" | "horsBanc";
const FILTRES: Filtre[] = ["tous", "avecMessage", "sansMessage", "horsBanc"];

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function horsBanc(r: RelectureBanc): boolean {
  return r.statut === "ignore" || r.statut === "echec";
}

function garde(r: RelectureBanc, filtre: Filtre): boolean {
  if (filtre === "avecMessage") return Boolean(r.brouillon);
  if (filtre === "sansMessage") return estJugeable(r) && !r.brouillon;
  if (filtre === "horsBanc") return horsBanc(r);
  return true;
}

/**
 * Banc d'essai de l'agent de relecture : ses résultats sur un lot de vrais
 * posts, que rien n'envoie aux créateurs. L'admin juge chaque point (✓ / ✗),
 * signale ce que l'agent a raté, et lit le message exact qui partirait.
 */
export function AdminBancRelecturePage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [filtre, setFiltre] = React.useState<Filtre>("tous");

  const jours = useQuery({ queryKey: ["relecture-jours"], queryFn: listerJoursRelecture });
  const jour = params.get("jour") || jours.data?.[0] || null;

  const relectures = useQuery({
    queryKey: ["banc-relectures", jour],
    queryFn: () => listerRelecturesBanc(jour!),
    enabled: Boolean(jour),
    // Un lot qui tourne encore se remplit tout seul.
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => !relectureFinie(r)) ? 15_000 : false),
  });
  const toutes = React.useMemo(() => relectures.data ?? [], [relectures.data]);
  const ids = React.useMemo(() => toutes.map((r) => r.id), [toutes]);
  const cleAvis = React.useMemo(() => ["relecture-avis", ids] as const, [ids]);
  const avis = useQuery({
    queryKey: cleAvis,
    queryFn: () => listerAvisRelecture(ids),
    enabled: ids.length > 0,
  });
  const types = useQuery({ queryKey: ["review-remarques"], queryFn: listerReviewRemarques });

  const avisParRelecture = React.useMemo(() => grouperAvis(avis.data ?? []), [avis.data]);
  const stats = React.useMemo(() => statsBanc(toutes, avisParRelecture), [toutes, avisParRelecture]);
  const numero = React.useMemo(() => new Map(toutes.map((r, i) => [r.id, i + 1])), [toutes]);
  const liste = React.useMemo(() => toutes.filter((r) => garde(r, filtre)), [toutes, filtre]);

  const courantId = params.get("r");
  const index = Math.max(
    0,
    liste.findIndex((r) => r.id === courantId),
  );
  const courant = liste[index] ?? null;

  const aller = React.useCallback(
    (id: string) => {
      const next = new URLSearchParams(params);
      if (jour) next.set("jour", jour);
      next.set("r", id);
      setParams(next, { replace: true });
    },
    [params, jour, setParams],
  );

  const prochainAJuger = React.useMemo(() => {
    if (!courant) return null;
    const ordre = [...liste.slice(index + 1), ...liste.slice(0, index)];
    return ordre.find((r) => estJugeable(r) && !estJuge(r, avisParRelecture[r.id] ?? [])) ?? null;
  }, [liste, index, courant, avisParRelecture]);

  // ← / → pour passer d'un post à l'autre, hors des champs de saisie.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName))) return;
      if (e.key === "ArrowRight" && liste[index + 1]) aller(liste[index + 1].id);
      if (e.key === "ArrowLeft" && index > 0) aller(liste[index - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [liste, index, aller]);

  const majAvis = (fn: (prev: AvisRelecture[]) => AvisRelecture[]) =>
    queryClient.setQueryData<AvisRelecture[]>(cleAvis, (prev) => fn(prev ?? []));

  const enregistrer = useMutation({
    mutationFn: enregistrerAvisRelecture,
    onSuccess: (a) =>
      majAvis((prev) => [...prev.filter((x) => !(x.relecture_id === a.relecture_id && x.cle === a.cle)), a]),
  });
  const supprimer = useMutation({
    mutationFn: async (a: AvisRelecture) => {
      await supprimerAvisRelecture(a.id);
      return a;
    },
    onSuccess: (a) => majAvis((prev) => prev.filter((x) => x.id !== a.id)),
  });

  const labelJour = (j: string) =>
    new Date(`${j}T12:00:00`).toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long" });
  const libelleCode = (code: string) => t(`banc.codes.${code}`, { defaultValue: code });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="size-5" />
              {t("banc.titre")}
            </CardTitle>
            <CardDescription>{t("banc.sousTitre")}</CardDescription>
          </div>
          {(jours.data ?? []).length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("banc.jour")}</span>
              <select
                className={selectClass}
                value={jour ?? ""}
                onChange={(e) => setParams({ jour: e.target.value }, { replace: true })}
              >
                {(jours.data ?? []).map((j) => (
                  <option key={j} value={j}>
                    {labelJour(j)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </CardHeader>
      </Card>

      {(jours.isPending || relectures.isPending) && jour !== null && (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      )}
      {(jours.isError || relectures.isError) && (
        <p className="text-sm text-destructive">
          {((jours.error ?? relectures.error) as Error | null)?.message}
        </p>
      )}
      {!jours.isPending && !jour && <EmptyState title={t("banc.aucunJour")} />}

      {toutes.length > 0 && (
        <>
          <Statistiques stats={stats} libelleCode={libelleCode} />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border p-0.5">
                {FILTRES.map((f) => (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant={filtre === f ? "secondary" : "ghost"}
                    aria-pressed={filtre === f}
                    onClick={() => setFiltre(f)}
                  >
                    {t(`banc.filtres.${f}`)} · {toutes.filter((r) => garde(r, f)).length}
                  </Button>
                ))}
              </div>
              <Legende />
            </div>
            <nav className="flex flex-wrap gap-1" aria-label={t("banc.posts")}>
              {liste.map((r) => (
                <PastillePost
                  key={r.id}
                  relecture={r}
                  numero={numero.get(r.id) ?? 0}
                  juge={estJuge(r, avisParRelecture[r.id] ?? [])}
                  actif={r.id === courant?.id}
                  onClick={() => aller(r.id)}
                />
              ))}
            </nav>
          </div>

          {!courant ? (
            <EmptyState title={t("banc.filtreVide")} />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">
                    {t("banc.position", { n: numero.get(courant.id), total: toutes.length })}
                  </span>
                  <span className="text-muted-foreground">
                    {courant.handle_tiktok ? `@${courant.handle_tiktok.replace(/^@/, "")}` : courant.persona_nom}
                    {courant.langue ? ` · ${courant.langue.toUpperCase()}` : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => aller(liste[index - 1].id)}
                  >
                    <ChevronLeft className="size-4" />
                    {t("banc.precedent")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!liste[index + 1]}
                    onClick={() => aller(liste[index + 1].id)}
                  >
                    {t("banc.suivant")}
                    <ChevronRight className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    disabled={!prochainAJuger}
                    onClick={() => prochainAJuger && aller(prochainAJuger.id)}
                  >
                    <SkipForward className="size-4" />
                    {prochainAJuger ? t("banc.prochainAJuger") : t("banc.toutJuge")}
                  </Button>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,325px)_minmax(0,325px)_minmax(0,1fr)]">
                <TikTokEmbed
                  key={`o-${courant.id}`}
                  url={courant.source_url}
                  titre={t("banc.original")}
                  videLabel={t("fileReviews.sansOriginal")}
                  chargementLabel={t("fileReviews.apercuChargement")}
                />
                <TikTokEmbed
                  key={`p-${courant.id}`}
                  url={courant.publie_url}
                  titre={t("banc.poste")}
                  videLabel={t("fileReviews.sansLien")}
                  chargementLabel={t("fileReviews.apercuChargement")}
                />
                <div className="lg:col-span-2 xl:col-span-1">
                  <PanneauJugement
                    key={courant.id}
                    relecture={courant}
                    avis={avisParRelecture[courant.id] ?? []}
                    videos={videosDuBrouillon(courant.remarques, types.data ?? [])}
                    libelleCode={libelleCode}
                    occupe={enregistrer.isPending || supprimer.isPending}
                    erreur={
                      ((enregistrer.error ?? supprimer.error) as Error | null)?.message ??
                      ((avis.error as Error | null)?.message || null)
                    }
                    onEnregistrer={(a) => enregistrer.mutate(a)}
                    onSupprimer={(a) => supprimer.mutate(a)}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Statistiques({ stats, libelleCode }: { stats: StatsBanc; libelleCode: (code: string) => string }) {
  const { t } = useTranslation();
  const points = stats.justes + stats.faux;
  const pct = pourcentage(stats.justes, points);
  return (
    <Card>
      <div className="space-y-4 p-4">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Chiffre label={t("banc.stats.juges")} valeur={`${stats.juges} / ${stats.jugeables}`} />
          <Chiffre label={t("banc.stats.proposes")} valeur={`${stats.proposees} / ${stats.jugeables}`} />
          <Chiffre
            label={t("banc.stats.justes")}
            valeur={points > 0 ? `${stats.justes} / ${points} · ${pct} %` : "—"}
          />
          <Chiffre label={t("banc.stats.rates")} valeur={String(stats.rates)} />
        </dl>
        {stats.parRegle.length > 0 && (
          <table className="w-full max-w-xl text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 font-medium">{t("banc.stats.regle")}</th>
                <th className="py-1 text-right font-medium">{t("banc.stats.colJuste")}</th>
                <th className="py-1 text-right font-medium">{t("banc.stats.colFaux")}</th>
                <th className="py-1 text-right font-medium">{t("banc.stats.colRate")}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {stats.parRegle.map(({ code, compte }) => (
                <tr key={code} className="border-t">
                  <td className="py-1">{libelleCode(code)}</td>
                  <td className="py-1 text-right">{compte.juste || "·"}</td>
                  <td className="py-1 text-right">{compte.faux || "·"}</td>
                  <td className="py-1 text-right">{compte.rate || "·"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs text-muted-foreground">
          {[
            stats.aucunConfirme > 0 ? t("banc.stats.aucunConfirme", { count: stats.aucunConfirme }) : null,
            stats.horsBanc > 0 ? t("banc.stats.horsBanc", { count: stats.horsBanc }) : null,
            stats.enCours > 0 ? t("banc.stats.enCours", { count: stats.enCours }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </Card>
  );
}

function Chiffre({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{valeur}</dd>
    </div>
  );
}

function Legende() {
  const { t } = useTranslation();
  const item = (cls: string, label: string) => (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block size-3 rounded-sm border", cls)} />
      {label}
    </span>
  );
  return (
    <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {item("border-success/50 bg-success/20", t("banc.legende.juge"))}
      {item("border-primary/50 bg-primary/10", t("banc.legende.message"))}
      {item("bg-background", t("banc.legende.aJuger"))}
      {item("border-dashed bg-muted", t("banc.legende.horsBanc"))}
    </p>
  );
}

function PastillePost({
  relecture,
  numero,
  juge,
  actif,
  onClick,
}: {
  relecture: RelectureBanc;
  numero: number;
  juge: boolean;
  actif: boolean;
  onClick: () => void;
}) {
  const style = juge
    ? "border-success/50 bg-success/20"
    : !relectureFinie(relecture) || horsBanc(relecture)
      ? "border-dashed bg-muted text-muted-foreground"
      : relecture.brouillon
        ? "border-primary/50 bg-primary/10"
        : "bg-background";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={actif ? "true" : undefined}
      className={cn(
        "flex size-8 items-center justify-center rounded-md border text-xs tabular-nums transition-colors hover:bg-accent",
        style,
        actif && "ring-2 ring-primary ring-offset-1",
      )}
    >
      {numero}
    </button>
  );
}

type NouvelAvis = Parameters<typeof enregistrerAvisRelecture>[0];

function PanneauJugement({
  relecture,
  avis,
  videos,
  libelleCode,
  occupe,
  erreur,
  onEnregistrer,
  onSupprimer,
}: {
  relecture: RelectureBanc;
  avis: AvisRelecture[];
  videos: { url: string; titre: string }[];
  libelleCode: (code: string) => string;
  occupe: boolean;
  erreur: string | null;
  onEnregistrer: (a: NouvelAvis) => void;
  onSupprimer: (a: AvisRelecture) => void;
}) {
  const { t } = useTranslation();

  if (!relectureFinie(relecture)) {
    return <Encart>{t("banc.enCours")}</Encart>;
  }
  if (horsBanc(relecture)) {
    return (
      <Encart>
        {t(relecture.statut === "ignore" ? "banc.ignore" : "banc.echec", { raison: relecture.erreur ?? "—" })}
      </Encart>
    );
  }

  const points = pointsAJuger(relecture);
  const notes = relecture.defauts.filter((d) => d.niveau === "info");
  const rates = avis.filter((a) => a.verdict === "rate");
  const aucun = avis.find((a) => a.cle === CLE_AUCUN) ?? null;

  const juger = (d: DefautRelecture, verdict: Exclude<VerdictAvis, "rate">) => {
    const cle = cleDefaut(d);
    const actuel = avis.find((a) => a.cle === cle);
    if (actuel?.verdict === verdict) {
      onSupprimer(actuel);
      return;
    }
    onEnregistrer({
      relecture_id: relecture.id,
      cle,
      code: d.code,
      verdict,
      detail: libelleDefaut(d),
      commentaire: verdict === "faux" ? actuel?.commentaire : null,
    });
  };

  const ajouterRate = (code: string, commentaire: string) => {
    onEnregistrer({ relecture_id: relecture.id, cle: nouvelleCleRate(), code, verdict: "rate", commentaire });
    // L'agent a laissé passer quelque chose : « rien à signaler » ne tient plus.
    if (aucun) onSupprimer(aucun);
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl border p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Bot className="size-3.5" />
          {t("banc.points")}
        </p>
        {points.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">{t("banc.rienReleve")}</p>
            {rates.length === 0 && (
              <Button
                size="sm"
                variant={aucun ? "default" : "outline"}
                aria-pressed={Boolean(aucun)}
                disabled={occupe}
                onClick={() =>
                  aucun
                    ? onSupprimer(aucun)
                    : onEnregistrer({ relecture_id: relecture.id, cle: CLE_AUCUN, code: "aucun", verdict: "juste" })
                }
              >
                <Check className="size-4" />
                {t("banc.rienASignaler")}
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {points.map((d, i) => {
              const a = avis.find((x) => x.cle === cleDefaut(d)) ?? null;
              return (
                <li key={cleDefaut(d)} className="space-y-1.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm">{libelleDefaut(d)}</p>
                      <Badge variant={i < MAX_POINTS_REVIEW ? "info" : "outline"}>
                        {i < MAX_POINTS_REVIEW ? t("banc.dansMessage") : t("banc.plusTard")}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={a?.verdict === "juste" ? "default" : "outline"}
                        aria-pressed={a?.verdict === "juste"}
                        aria-label={t("banc.juste")}
                        title={t("banc.juste")}
                        disabled={occupe}
                        onClick={() => juger(d, "juste")}
                        className={cn(a?.verdict === "juste" && "border-success bg-success hover:bg-success/90")}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant={a?.verdict === "faux" ? "destructive" : "outline"}
                        aria-pressed={a?.verdict === "faux"}
                        aria-label={t("banc.faux")}
                        title={t("banc.faux")}
                        disabled={occupe}
                        onClick={() => juger(d, "faux")}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>
                  {a?.verdict === "faux" && (
                    <Input
                      key={`${a.id}-${a.commentaire ?? ""}`}
                      defaultValue={a.commentaire ?? ""}
                      placeholder={t("banc.pourquoiFaux")}
                      onBlur={(e) => {
                        const texte = e.target.value.trim();
                        if (texte !== (a.commentaire ?? "")) {
                          onEnregistrer({ ...a, commentaire: texte });
                        }
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {notes.length > 0 && (
          <div className="space-y-1 pt-1">
            <p className="text-xs text-muted-foreground">{t("banc.notes")}</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
              {notes.map((d) => (
                <li key={cleDefaut(d)}>{libelleDefaut(d)}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <Rates
        rates={rates}
        occupe={occupe}
        libelleCode={libelleCode}
        onAjouter={ajouterRate}
        onSupprimer={onSupprimer}
      />

      {erreur && <p className="text-sm text-destructive">{erreur}</p>}

      <MessageExact texte={relecture.brouillon} videos={videos} />
    </div>
  );
}

function Rates({
  rates,
  occupe,
  libelleCode,
  onAjouter,
  onSupprimer,
}: {
  rates: AvisRelecture[];
  occupe: boolean;
  libelleCode: (code: string) => string;
  onAjouter: (code: string, commentaire: string) => void;
  onSupprimer: (a: AvisRelecture) => void;
}) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = React.useState(false);
  const [code, setCode] = React.useState<string>(CODES_RATE[0]);
  const [texte, setTexte] = React.useState("");

  return (
    <section className="space-y-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t("banc.rates")}</p>
        {!ouvert && (
          <Button size="sm" variant="outline" onClick={() => setOuvert(true)}>
            <Plus className="size-4" />
            {t("banc.rate")}
          </Button>
        )}
      </div>
      {rates.length === 0 && !ouvert && <p className="text-xs text-muted-foreground">{t("banc.rateAide")}</p>}
      {rates.length > 0 && (
        <ul className="space-y-1.5">
          {rates.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 text-sm">
              <span>
                <span className="font-medium">{libelleCode(a.code)}</span>
                {a.commentaire ? ` : ${a.commentaire}` : ""}
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={t("common.delete")}
                disabled={occupe}
                onClick={() => onSupprimer(a)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {ouvert && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!texte.trim()) return;
            onAjouter(code, texte.trim());
            setTexte("");
            setOuvert(false);
          }}
        >
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("banc.rateRegle")}</span>
            <select className={selectClass} value={code} onChange={(e) => setCode(e.target.value)}>
              {CODES_RATE.map((c) => (
                <option key={c} value={c}>
                  {libelleCode(c)}
                </option>
              ))}
            </select>
          </label>
          <Textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder={t("banc.ratePlaceholder")}
            aria-label={t("banc.rateTexte")}
            rows={2}
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={occupe || !texte.trim()}>
              {t("banc.ajouter")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOuvert(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Le message tel que le créateur le recevrait : texte de l'agent et vidéos tuto jointes. */
function MessageExact({ texte, videos }: { texte: string | null; videos: { url: string; titre: string }[] }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2 rounded-xl border p-4">
      <p className="text-xs font-medium text-muted-foreground">{t("banc.message")}</p>
      {texte ? (
        <>
          <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm leading-relaxed">{texte}</p>
          {videos.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {videos.map((v) => (
                <li key={v.url}>
                  <a href={v.url} target="_blank" rel="noreferrer">
                    <Badge variant="secondary" className="gap-1">
                      <Film className="size-3" />
                      {t("banc.messageVideo", { titre: v.titre || t("fileReviews.videoSansTitre") })}
                    </Badge>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{t("banc.messageAide")}</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("banc.pasDeMessage")}</p>
      )}
    </section>
  );
}

function Encart({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border p-4 text-sm text-muted-foreground">{children}</p>;
}
