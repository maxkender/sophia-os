import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Ban, Check, ExternalLink, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NettoyageEtapes } from "@/components/moteur/NettoyageEtapes";
import {
  lireReglages,
  listerSignalementsTexte,
  renettoyerPhotoSignalee,
  trancherSignalementTexte,
  type SignalementTexte,
} from "@/features/moteur/api";
import {
  appliquerEvenement,
  etapesInitiales,
  type EvenementEtape,
  type ProviderNettoyage,
} from "@/features/moteur/nettoyageEtapes";

/**
 * Photos que les posters ont signalées encore écrites (migration 0255). Chaque
 * signalement a déjà sorti la photo des pools et remplacé la slide ; l'admin
 * tranche ici. Un poster qui signale à tort une photo sans texte ne doit pas
 * appauvrir la bibliothèque pour de bon : « Pas de texte » la remet en
 * circulation.
 */
export function SignalementsTexteCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const liste = useQuery({
    queryKey: ["signalements-texte"],
    queryFn: listerSignalementsTexte,
  });
  const { data: reglages } = useQuery({
    queryKey: ["reglages"],
    queryFn: lireReglages,
    staleTime: 30_000,
  });
  const premier: ProviderNettoyage = reglages?.nettoyage.provider_principal ?? "fal";

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: ["signalements-texte"] });
    void queryClient.invalidateQueries({ queryKey: ["medias-biblio"] });
  };

  if (liste.isError) {
    return (
      <p className="text-sm text-destructive">
        {t("signalementsTexte.erreur")} — {(liste.error as Error).message}
      </p>
    );
  }
  const signalements = liste.data ?? [];
  if (signalements.length === 0) return null;

  return (
    <Card className="border-warning/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-warning" />
          {t("signalementsTexte.titre", { count: signalements.length })}
        </CardTitle>
        <CardDescription>{t("signalementsTexte.aide")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {signalements.map((s) => (
            <Signalement key={s.id} signalement={s} premier={premier} onChange={rafraichir} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Signalement({
  signalement,
  premier,
  onChange,
}: {
  signalement: SignalementTexte;
  premier: ProviderNettoyage;
  onChange: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [etapes, setEtapes] = React.useState<EvenementEtape[] | null>(null);

  const renettoyer = useMutation({
    mutationFn: () => {
      setEtapes(etapesInitiales(premier));
      return renettoyerPhotoSignalee(signalement.media_id, (ev) => {
        setEtapes((prev) => appliquerEvenement(prev ?? etapesInitiales(premier), ev, premier));
      });
    },
    onSuccess: (r) => {
      if (r.nettoyee) setEtapes(null);
      onChange();
    },
  });
  const trancher = useMutation({
    mutationFn: (remettre: boolean) => trancherSignalementTexte(signalement, remettre),
    onSuccess: onChange,
  });
  const occupe = renettoyer.isPending || trancher.isPending;

  return (
    <div className="space-y-1.5">
      {signalement.media?.url ? (
        <a href={signalement.media.url} target="_blank" rel="noreferrer" className="block">
          <img
            src={signalement.media.url}
            alt=""
            loading="lazy"
            className="aspect-[3/4] w-full rounded-md border-2 border-warning/60 object-cover"
          />
        </a>
      ) : null}
      <p className="text-[11px] leading-snug text-muted-foreground">
        {t("signalementsTexte.par", {
          poster: signalement.poster ?? t("signalementsTexte.posterInconnu"),
          date: new Date(signalement.created_at).toLocaleString(i18n.language),
        })}
        {" · "}
        {signalement.remplace_par
          ? t("signalementsTexte.remplacee", {
            count: 1 + signalement.slides_propagees,
            contenus: signalement.contenus_propages,
          })
          : t("signalementsTexte.nonRemplacee")}
      </p>

      {etapes && (renettoyer.isPending || renettoyer.isError || renettoyer.data?.nettoyee === false) ? (
        <NettoyageEtapes etapes={etapes} className="rounded border bg-muted/30 p-1.5" />
      ) : null}

      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 px-2 text-xs"
          disabled={occupe}
          onClick={() => renettoyer.mutate()}
          title={t("signalementsTexte.renettoyerAide")}
        >
          <Sparkles className="size-3" />
          {renettoyer.isPending ? t("bibliotheque.nettoyageEnCours") : t("signalementsTexte.renettoyer")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 px-2 text-xs"
          disabled={occupe}
          onClick={() => trancher.mutate(true)}
          title={t("signalementsTexte.remettreAide")}
        >
          <Check className="size-3" />
          {t("signalementsTexte.remettre")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 px-2 text-xs"
          disabled={occupe}
          onClick={() => trancher.mutate(false)}
          title={t("signalementsTexte.exclureAide")}
        >
          <Ban className="size-3" />
          {t("signalementsTexte.exclure")}
        </Button>
        {signalement.post_id && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
            <Link to={`/admin/posts/${signalement.post_id}`} title={t("signalementsTexte.voirPost")}>
              <ExternalLink className="size-3" />
            </Link>
          </Button>
        )}
      </div>

      {renettoyer.data && !renettoyer.data.nettoyee && (
        <p className="text-[11px] text-destructive">{t("bibliotheque.nettoyageEchec")}</p>
      )}
      {(renettoyer.isError || trancher.isError) && (
        <p className="text-[11px] text-destructive">
          {((renettoyer.error ?? trancher.error) as Error).message}
        </p>
      )}
    </div>
  );
}
