import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { Bot, Check, ExternalLink, Flag, SkipForward, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  enregistrerAvisRelecture,
  listerAvisRelecture,
  listerPosters,
  listerReviewsContestees,
  relectureDuRetour,
  supprimerAvisRelecture,
  trancherContestation,
  type Review,
  type VerdictContestation,
} from "@/features/moteur/api";
import { cleDefaut, type AvisRelecture } from "@/features/reviews/bancRelecture";
import { libelleDefaut, repartirDefauts, type DefautRelecture } from "@/features/reviews/relectureAgent";
import { TikTokEmbed } from "@/features/reviews/TikTokEmbed";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

type Filtre = "a_verifier" | "traites" | "tous";
const FILTRES: Filtre[] = ["a_verifier", "traites", "tous"];

/**
 * Retours contestés (0340) : un créateur a dit « ce retour me semble faux ».
 * L'admin regarde son post à côté de l'original, juge les points de l'agent
 * (ils comptent dans le banc d'essai), tranche et peut lui répondre ; le
 * créateur voit la décision dans « Mes retours ». Les plus anciens à vérifier
 * d'abord.
 */
export function AdminRetoursContestesPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const filtre = FILTRES.find((f) => f === params.get("f")) ?? "a_verifier";

  const retours = useQuery({ queryKey: ["reviews-contestees"], queryFn: listerReviewsContestees });
  const posters = useQuery({ queryKey: ["posters"], queryFn: listerPosters });
  const nomDe = React.useMemo(() => {
    const noms = new Map(
      (posters.data ?? []).map((p) => [p.id, [p.prenom, p.nom].filter(Boolean).join(" ") || p.email]),
    );
    return (id: string) => noms.get(id) ?? "—";
  }, [posters.data]);

  const tous = React.useMemo(() => retours.data ?? [], [retours.data]);
  const aVerifier = React.useMemo(
    () =>
      tous
        .filter((r) => !r.contestation_verdict)
        .sort((a, b) => (a.contestee_at ?? "").localeCompare(b.contestee_at ?? "")),
    [tous],
  );
  const traites = React.useMemo(() => tous.filter((r) => r.contestation_verdict), [tous]);
  const fondees = traites.filter((r) => r.contestation_verdict === "fondee").length;
  const liste = filtre === "a_verifier" ? aVerifier : filtre === "traites" ? traites : [...aVerifier, ...traites];
  const courant = liste.find((r) => r.id === params.get("r")) ?? liste[0] ?? null;

  const aller = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  // Après une décision : le plus ancien encore à vérifier (autre que celui-ci).
  const suivant = (apres: string | null) => aVerifier.find((r) => r.id !== apres) ?? null;

  const date = (iso: string | null) =>
    iso
      ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(localeDate(i18n.language), {
          day: "numeric",
          month: "long",
        })
      : "—";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Flag className="size-5" />
              {t("contestes.titre")}
            </CardTitle>
            <CardDescription>{t("contestes.sousTitre")}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {FILTRES.map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filtre === f ? "secondary" : "ghost"}
                aria-pressed={filtre === f}
                onClick={() => aller({ f, r: null })}
              >
                {t(`contestes.${f === "a_verifier" ? "aVerifier" : f}`)}
                <span className="text-muted-foreground tabular-nums">
                  {f === "a_verifier" ? aVerifier.length : f === "traites" ? traites.length : tous.length}
                </span>
              </Button>
            ))}
            {traites.length > 0 && (
              <span className="ml-auto text-muted-foreground text-xs">
                {t("contestes.fondees")} : {fondees} / {traites.length}
              </span>
            )}
          </div>
        </CardHeader>
      </Card>

      {retours.isPending && <p className="text-muted-foreground text-sm">{t("common.loading")}</p>}
      {retours.isError && <p className="text-destructive text-sm">{(retours.error as Error).message}</p>}
      {retours.isSuccess && tous.length === 0 && <EmptyState title={t("contestes.vide")} />}
      {retours.isSuccess && tous.length > 0 && liste.length === 0 && <EmptyState title={t("contestes.videFiltre")} />}

      {courant && (
        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav aria-label={t("contestes.liste")} className="space-y-1.5">
            {liste.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => aller({ r: r.id })}
                aria-current={r.id === courant.id ? "true" : undefined}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                  r.id === courant.id && "border-primary bg-muted/60",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{nomDe(r.poster_id)}</span>
                  <PastilleVerdict verdict={r.contestation_verdict} />
                </span>
                <span className="block truncate text-muted-foreground text-xs">
                  {[r.compte_label, t("contestes.contesteLe", { date: date(r.contestee_at) })]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            ))}
          </nav>

          <Detail
            key={courant.id}
            retour={courant}
            nom={nomDe(courant.poster_id)}
            date={date}
            suivant={suivant(courant.id)}
            onAller={(id) => aller({ r: id })}
          />
        </div>
      )}
    </div>
  );
}

function PastilleVerdict({ verdict }: { verdict: VerdictContestation | null }) {
  if (!verdict) return <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />;
  return verdict === "fondee" ? (
    <Flag className="size-3.5 shrink-0 text-destructive" aria-hidden />
  ) : (
    <Check className="size-3.5 shrink-0 text-success" aria-hidden />
  );
}

function Detail({
  retour,
  nom,
  date,
  suivant,
  onAller,
}: {
  retour: Review;
  nom: string;
  date: (iso: string | null) => string;
  suivant: Review | null;
  onAller: (id: string) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [reponse, setReponse] = React.useState(retour.contestation_reponse ?? "");
  const [rouvert, setRouvert] = React.useState(false);

  const relecture = useQuery({
    queryKey: ["relecture-du-retour", retour.id],
    queryFn: () => relectureDuRetour(retour.id),
    enabled: retour.origine === "agent",
  });
  const relectureId = relecture.data?.id ?? null;
  const cleAvis = ["relecture-avis", relectureId ? [relectureId] : []] as const;
  const avis = useQuery({
    queryKey: cleAvis,
    queryFn: () => listerAvisRelecture([relectureId!]),
    enabled: Boolean(relectureId),
  });
  const rafraichirAvis = () => void queryClient.invalidateQueries({ queryKey: ["relecture-avis"] });
  const enregistrer = useMutation({ mutationFn: enregistrerAvisRelecture, onSuccess: rafraichirAvis });
  const supprimer = useMutation({ mutationFn: (a: AvisRelecture) => supprimerAvisRelecture(a.id), onSuccess: rafraichirAvis });

  const trancher = useMutation({
    mutationFn: (verdict: VerdictContestation) => trancherContestation(retour.id, verdict, reponse),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reviews-contestees"] });
      void queryClient.invalidateQueries({ queryKey: ["contestations-a-verifier"] });
      setRouvert(false);
      if (!retour.contestation_verdict && suivant) onAller(suivant.id);
    },
  });

  // Les points du message envoyé : les premiers relevés de l'agent.
  const points = relecture.data ? repartirDefauts(relecture.data.defauts).review : [];
  const juger = (d: DefautRelecture, verdict: "juste" | "faux") => {
    if (!relectureId) return;
    const actuel = (avis.data ?? []).find((a) => a.cle === cleDefaut(d));
    if (actuel?.verdict === verdict) {
      supprimer.mutate(actuel);
      return;
    }
    enregistrer.mutate({
      relecture_id: relectureId,
      cle: cleDefaut(d),
      code: d.code,
      verdict,
      detail: libelleDefaut(d),
      commentaire: verdict === "faux" ? (retour.contestation ?? null) : null,
    });
  };

  const decide = Boolean(retour.contestation_verdict) && !rouvert;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{nom}</span>
        {retour.compte_label && <span className="text-muted-foreground">{retour.compte_label}</span>}
        <Badge variant={retour.origine === "agent" ? "info" : "outline"}>
          {retour.origine === "agent" ? t("contestes.agent") : t("contestes.admin")}
        </Badge>
        <span className="text-muted-foreground">
          {[
            retour.date_publication ? t("contestes.postDu", { date: date(retour.date_publication) }) : null,
            t("contestes.contesteLe", { date: date(retour.contestee_at) }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>

      <blockquote className="rounded-xl border-warning/40 border-l-4 bg-warning/5 p-3 text-sm">
        <p className="mb-1 font-medium text-muted-foreground text-xs">{t("contestes.motCreateur")}</p>
        <p className="whitespace-pre-wrap">{retour.contestation || t("contestes.sansMot")}</p>
      </blockquote>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,325px)_minmax(0,325px)_minmax(0,1fr)]">
        <TikTokEmbed
          url={retour.source_url}
          titre={t("contestes.original")}
          videLabel={t("fileReviews.sansOriginal")}
          chargementLabel={t("fileReviews.apercuChargement")}
        />
        <TikTokEmbed
          url={retour.publie_url}
          titre={t("contestes.poste")}
          videLabel={t("fileReviews.sansLien")}
          chargementLabel={t("fileReviews.apercuChargement")}
        />

        <div className="space-y-4 lg:col-span-2 xl:col-span-1">
          <section className="space-y-2 rounded-xl border p-4">
            <p className="font-medium text-muted-foreground text-xs">{t("contestes.message")}</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{retour.body}</p>
            {retour.videos.length > 0 && (
              <p className="text-muted-foreground text-xs">
                {t("contestes.videos", { titres: retour.videos.map((v) => v.titre || v.url).join(", ") })}
              </p>
            )}
          </section>

          {retour.origine === "agent" && (
            <section className="space-y-2 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                  <Bot className="size-3.5" />
                  {t("contestes.pointsAgent")}
                </p>
                {relecture.data && (
                  <Link
                    to={`/admin/banc-relecture?jour=${relecture.data.jour}&r=${relecture.data.id}`}
                    className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                  >
                    {t("contestes.ouvrirBanc")}
                    <ExternalLink className="size-3" />
                  </Link>
                )}
              </div>
              {points.length > 0 && <p className="text-muted-foreground text-xs">{t("contestes.pointsAide")}</p>}
              <ul className="space-y-2">
                {points.map((d) => {
                  const a = (avis.data ?? []).find((x) => x.cle === cleDefaut(d)) ?? null;
                  const occupe = enregistrer.isPending || supprimer.isPending;
                  return (
                    <li key={cleDefaut(d)} className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-sm">{libelleDefaut(d)}</p>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={a?.verdict === "juste" ? "default" : "outline"}
                          aria-pressed={a?.verdict === "juste"}
                          aria-label={t("contestes.juste")}
                          title={t("contestes.juste")}
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
                          aria-label={t("contestes.faux")}
                          title={t("contestes.faux")}
                          disabled={occupe}
                          onClick={() => juger(d, "faux")}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {(enregistrer.error ?? supprimer.error) && (
                <p className="text-destructive text-sm">{((enregistrer.error ?? supprimer.error) as Error).message}</p>
              )}
            </section>
          )}

          <section className="space-y-3 rounded-xl border p-4">
            <p className="font-medium text-muted-foreground text-xs">{t("contestes.verdict")}</p>
            {decide ? (
              <div className="space-y-2">
                <p className="flex items-center gap-2 font-medium text-sm">
                  <PastilleVerdict verdict={retour.contestation_verdict} />
                  {t("contestes.decide", {
                    verdict:
                      retour.contestation_verdict === "fondee"
                        ? t("contestes.verdictFondee")
                        : t("contestes.verdictNonFondee"),
                    date: date(retour.contestation_traitee_at),
                  })}
                </p>
                {retour.contestation_reponse && (
                  <p className="whitespace-pre-wrap text-muted-foreground text-sm">{retour.contestation_reponse}</p>
                )}
                <Button size="sm" variant="ghost" onClick={() => setRouvert(true)}>
                  {t("contestes.changer")}
                </Button>
              </div>
            ) : (
              <>
                <label className="block space-y-1.5 text-sm">
                  <span>{t("contestes.reponse")}</span>
                  <Textarea
                    value={reponse}
                    rows={3}
                    maxLength={2000}
                    placeholder={t("contestes.reponsePlaceholder")}
                    onChange={(e) => setReponse(e.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    loading={trancher.isPending && trancher.variables === "fondee"}
                    disabled={trancher.isPending}
                    onClick={() => trancher.mutate("fondee")}
                  >
                    <Flag className="size-4" />
                    {t("contestes.fondee")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={trancher.isPending && trancher.variables === "non_fondee"}
                    disabled={trancher.isPending}
                    onClick={() => trancher.mutate("non_fondee")}
                  >
                    <Check className="size-4" />
                    {t("contestes.nonFondee")}
                  </Button>
                </div>
                {trancher.error && <p className="text-destructive text-sm">{(trancher.error as Error).message}</p>}
              </>
            )}
            {retour.contestation_verdict && suivant && (
              <Button size="sm" variant="ghost" onClick={() => onAller(suivant.id)}>
                <SkipForward className="size-4" />
                {t("contestes.suivant")}
              </Button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
