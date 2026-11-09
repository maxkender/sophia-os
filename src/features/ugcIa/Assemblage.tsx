import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Clapperboard, Download, Layers, Send, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { TitreCarte } from "@/features/bleo/ui";

import {
  CLE_ASSEMBLAGES,
  CLE_DEMOS,
  finaliserAssemblage,
  listerAssemblages,
  listerDemos,
  supprimerAssemblage,
  type AssemblageUgcIa,
  type GenerationUgcIa,
  type PersonaUgcIa,
} from "./api";
import { bandeauPng, POSITION_BANDEAU_DEFAUT } from "./bandeau";
import { messageErreur, videoDAssemblage, type VideoChoisie } from "./logique";
import { chargerImage, RENDU_HAUTEUR, RENDU_LARGEUR, rendreVideo, segmentReaction, segmentsDemo } from "./rendu";

/**
 * Assembler une vidéo complète : la réaction, puis la démo, muettes, avec le
 * bandeau style Snapchat posé par-dessus les deux, sur toute la durée.
 */
export function DialogueAssemblage({
  generation: g,
  nomPersona,
  ctaTexte,
  fermer,
}: {
  generation: GenerationUgcIa;
  nomPersona: string;
  ctaTexte: string | null;
  fermer: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const demos = useQuery({ queryKey: CLE_DEMOS, queryFn: listerDemos });
  const utilisables = (demos.data ?? []).filter((d) => d.montage_statut !== "en_cours");
  const [demoId, setDemoId] = React.useState("");
  const demo = utilisables.find((d) => d.id === demoId) ?? null;
  const [avecBandeau, setAvecBandeau] = React.useState(true);
  const [texte, setTexte] = React.useState(g.bandeau_texte ?? ctaTexte ?? "");
  const [position, setPosition] = React.useState(g.bandeau_position ?? POSITION_BANDEAU_DEFAUT);
  const [apercu, setApercu] = React.useState<string | null>(null);
  const [progres, setProgres] = React.useState<number | null>(null);

  // La première démo montée est choisie d'office.
  React.useEffect(() => {
    if (!demoId && utilisables.length > 0) setDemoId((utilisables.find((d) => d.video_url) ?? utilisables[0]).id);
  }, [demoId, utilisables]);

  // L'aperçu du bandeau est l'image même qui sera posée sur la vidéo.
  React.useEffect(() => {
    if (!avecBandeau || !texte.trim()) {
      setApercu(null);
      return;
    }
    let actif = true;
    bandeauPng(RENDU_LARGEUR, RENDU_HAUTEUR, texte, position)
      .then((png) => actif && setApercu(png))
      .catch(() => actif && setApercu(null));
    return () => {
      actif = false;
    };
  }, [avecBandeau, texte, position]);

  const erreurBandeau = avecBandeau && !texte.trim();
  const rendre = useMutation({
    mutationFn: async () => {
      if (!demo) throw new Error(t("ugcIa.assemblage.choisirDemo"));
      setProgres(0);
      const calque = avecBandeau ? await chargerImage(await bandeauPng(RENDU_LARGEUR, RENDU_HAUTEUR, texte, position)) : null;
      const rendu = await rendreVideo({ segments: [segmentReaction(g), ...segmentsDemo(demo)], calque, onProgres: setProgres });
      return finaliserAssemblage(g.id, demo.id, rendu, { actif: avecBandeau, texte, position });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: CLE_ASSEMBLAGES });
      fermer();
    },
    onSettled: () => setProgres(null),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !rendre.isPending && fermer()}>
      <DialogPopup className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Layers className="size-4" aria-hidden />
            {t("ugcIa.assemblage.titre", { nom: nomPersona })}
          </DialogTitle>
          <DialogDescription>{t("ugcIa.assemblage.aide")}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="pb-5">
          <div className="grid gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
            <div className="space-y-2">
              <p className="text-xs font-medium">{t("ugcIa.assemblage.reaction")}</p>
              <div className="relative mx-auto aspect-[9/16] w-full max-w-[15rem] overflow-hidden rounded-lg bg-black">
                <video src={g.video_brute_url ?? g.video_url ?? undefined} controls muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-contain" />
                {apercu && <img src={apercu} alt={t("ugcIa.montage.apercuBandeau")} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />}
              </div>
              {demo && (
                <>
                  <p className="text-xs font-medium">{t("ugcIa.assemblage.puisDemo")}</p>
                  <div className="relative mx-auto aspect-[9/16] w-full max-w-[15rem] overflow-hidden rounded-lg bg-black">
                    <video key={demo.id} src={demo.video_url ?? demo.brut_url} controls muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-contain" />
                    {apercu && <img src={apercu} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />}
                  </div>
                </>
              )}
            </div>

            <div className="min-w-0 space-y-5">
              <label className="block space-y-1 text-sm">
                <span className="block text-xs font-medium text-muted-foreground">{t("ugcIa.assemblage.demo")}</span>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={demoId}
                  onChange={(e) => setDemoId(e.target.value)}
                  aria-label={t("ugcIa.assemblage.demo")}
                >
                  {utilisables.length === 0 && <option value="">{t("ugcIa.assemblage.aucuneDemo")}</option>}
                  {utilisables.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nom}
                      {d.video_url ? ` · ${d.duree_s ?? "?"} s` : ` (${t("ugcIa.demos.pasMontee")})`}
                    </option>
                  ))}
                </select>
              </label>

              <section className="space-y-2" aria-label={t("ugcIa.montage.bandeau")}>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={avecBandeau} onChange={(e) => setAvecBandeau(e.target.checked)} />
                  {t("ugcIa.assemblage.bandeauSurTout")}
                </label>
                {avecBandeau && (
                  <>
                    <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={2} aria-label={t("ugcIa.montage.texteBandeau")} />
                    <label className="block space-y-1 text-xs">
                      <span className="flex justify-between text-muted-foreground">
                        <span>{t("ugcIa.montage.hauteur")}</span>
                        <span>
                          {t("ugcIa.montage.haut")} ↔ {t("ugcIa.montage.bas")}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={5}
                        max={95}
                        step={1}
                        value={position}
                        onChange={(e) => setPosition(Number(e.target.value))}
                        className="w-full accent-primary"
                        aria-label={t("ugcIa.montage.hauteur")}
                      />
                    </label>
                    {erreurBandeau && <p className="text-xs text-destructive">{t("ugcIa.montage.bandeauVide")}</p>}
                  </>
                )}
              </section>

              <p className="text-xs text-muted-foreground">{t("ugcIa.assemblage.muet")}</p>
              {progres != null && (
                <div className="space-y-1">
                  <Progress value={Math.round(progres * 100)} />
                  <p className="text-xs text-muted-foreground">{t("ugcIa.rendu.enCours")}</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button loading={rendre.isPending} disabled={!demo || erreurBandeau} onClick={() => rendre.mutate()}>
                  <Clapperboard aria-hidden />
                  {t("ugcIa.assemblage.rendre")}
                </Button>
                <span className="text-xs text-muted-foreground">{t("ugcIa.rendu.aide")}</span>
              </div>
              {rendre.error && (
                <p role="alert" className="text-sm text-destructive">
                  {messageErreur(rendre.error)}
                </p>
              )}
            </div>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

/** Les vidéos complètes (réaction + démo) : à télécharger ou à envoyer en post à un compte UGCV. */
export function CarteAssemblages({ personas, envoyer }: { personas: PersonaUgcIa[]; envoyer: (video: VideoChoisie) => void }) {
  const { t } = useTranslation();
  const assemblages = useQuery({
    queryKey: CLE_ASSEMBLAGES,
    queryFn: listerAssemblages,
    refetchInterval: (q) => ((q.state.data ?? []).some((a) => a.statut === "en_cours") ? 5000 : false),
  });
  const nomPersona = new Map(personas.map((p) => [p.id, p.nom]));
  const liste = assemblages.data ?? [];
  if (assemblages.data && liste.length === 0) return null;
  return (
    <Card data-testid="assemblages">
      <CardHeader>
        <TitreCarte icone={Layers}>{t("ugcIa.assemblage.liste", { count: liste.length })}</TitreCarte>
      </CardHeader>
      <CardContent className="space-y-2">
        {assemblages.error && <p className="text-sm text-destructive">{messageErreur(assemblages.error)}</p>}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {liste.map((a) => (
            <LigneAssemblage
              key={a.id}
              assemblage={a}
              nom={`${(a.persona_id && nomPersona.get(a.persona_id)) || "?"} + ${a.demo_nom ?? t("ugcIa.assemblage.demoSupprimee")}`}
              envoyer={envoyer}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function LigneAssemblage({ assemblage: a, nom, envoyer }: { assemblage: AssemblageUgcIa; nom: string; envoyer: (video: VideoChoisie) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const supprimer = useMutation({ mutationFn: () => supprimerAssemblage(a.id), onSuccess: () => qc.invalidateQueries({ queryKey: CLE_ASSEMBLAGES }) });
  const video = videoDAssemblage(a, nom);
  return (
    <li className="space-y-1.5 rounded-lg border p-2 text-xs" data-testid={`assemblage-${a.id}`}>
      <p className="truncate font-medium" title={nom}>
        {nom}
      </p>
      {a.video_url ? (
        <video src={a.video_url} controls muted playsInline preload="metadata" className="aspect-[9/16] w-full rounded-md bg-black object-contain" />
      ) : (
        <div className="flex aspect-[9/16] w-full items-center justify-center rounded-md bg-muted px-2 text-center text-muted-foreground">
          {a.statut === "echec" ? t("ugcIa.assemblage.echec", { erreur: a.erreur ?? "?" }) : t("ugcIa.assemblage.enCours")}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant={a.statut === "prete" ? "success" : a.statut === "echec" ? "error" : "warning"}>{t(`ugcIa.statut.${a.statut}`)}</Badge>
        {a.duree_s != null && <span className="text-muted-foreground">{Math.round(a.duree_s)} s</span>}
        {a.bandeau_actif && <span className="text-muted-foreground">· {t("ugcIa.posts.ctaIncruste")}</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {video && (
          <Button size="xs" onClick={() => envoyer(video)}>
            <Send aria-hidden />
            {t("ugcIa.assemblage.envoyer")}
          </Button>
        )}
        {a.video_url && (
          <Button variant="outline" size="xs" render={<a href={a.video_url} download />} aria-label={t("ugcIa.telecharger")}>
            <Download aria-hidden />
          </Button>
        )}
        <Button
          variant="ghost"
          size="xs"
          loading={supprimer.isPending}
          aria-label={t("ugcIa.assemblage.supprimer")}
          onClick={() => window.confirm(t("ugcIa.assemblage.confirmerSuppression")) && supprimer.mutate()}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      {supprimer.error && <p className="text-destructive">{messageErreur(supprimer.error)}</p>}
    </li>
  );
}
