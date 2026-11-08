import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Clapperboard, Timer, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { annulerMontageUgcIa, CLE_SOURCES_UGC_IA, monterGenerationUgcIa, type GenerationUgcIa } from "./api";
import { bandeauPng, POSITION_BANDEAU_DEFAUT, tailleSelonResolution } from "./bandeau";
import { arrondiDixieme, erreurPassage, estMontee, lireSecondes, messageErreur, PASSAGE_MAX_S } from "./logique";

/**
 * Monter une vidéo générée : la recadrer dans le temps et poser un bandeau
 * style Snapchat (texte du CTA par défaut), avec l'aperçu exact sur la vidéo
 * d'origine. Enregistrer remplace la vidéo enregistrée ; l'original reste
 * gardé, on peut remonter autrement ou y revenir.
 */
export function DialogueMontage({
  generation: g,
  nomPersona,
  ctaTexte,
  ouvert,
  fermer,
}: {
  generation: GenerationUgcIa;
  nomPersona: string;
  ctaTexte: string | null;
  ouvert: boolean;
  fermer: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lecteur = React.useRef<HTMLVideoElement>(null);
  const [temps, setTemps] = React.useState(0);
  const [taille, setTaille] = React.useState(() => tailleSelonResolution(g.resolution));
  const [debut, setDebut] = React.useState(g.montage_debut_s != null ? String(g.montage_debut_s) : "");
  const [fin, setFin] = React.useState(g.montage_fin_s != null ? String(g.montage_fin_s) : "");
  const [avecBandeau, setAvecBandeau] = React.useState(g.bandeau_actif || !estMontee(g));
  const [texte, setTexte] = React.useState(g.bandeau_texte ?? ctaTexte ?? "");
  const [position, setPosition] = React.useState(g.bandeau_position ?? POSITION_BANDEAU_DEFAUT);

  const suivreLecture = (e: React.SyntheticEvent<HTMLVideoElement>) => setTemps(e.currentTarget.currentTime);
  const prendre = () => arrondiDixieme(lecteur.current?.currentTime ?? 0);

  // Coupe : les deux champs vides = toute la vidéo.
  const d = lireSecondes(debut);
  const f = lireSecondes(fin);
  const sansCoupe = debut.trim() === "" && fin.trim() === "";
  const erreurCoupe = sansCoupe ? null : erreurPassage(d, f, null, PASSAGE_MAX_S);
  const erreurBandeau = avecBandeau && !texte.trim() ? t("ugcIa.montage.bandeauVide") : null;

  // L'aperçu est la même image que celle envoyée au serveur (police et emojis Apple chargés d'abord).
  const [apercu, setApercu] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!avecBandeau || !texte.trim()) {
      setApercu(null);
      return;
    }
    let actif = true;
    bandeauPng(taille.largeur, taille.hauteur, texte, position)
      .then((png) => actif && setApercu(png))
      .catch(() => actif && setApercu(null));
    return () => {
      actif = false;
    };
  }, [avecBandeau, texte, position, taille]);

  const rafraichir = () => qc.invalidateQueries({ queryKey: CLE_SOURCES_UGC_IA });
  const enregistrer = useMutation({
    mutationFn: async () =>
      monterGenerationUgcIa(g.id, {
        debut: sansCoupe ? null : d,
        fin: sansCoupe ? null : f,
        bandeau: {
          actif: avecBandeau,
          texte,
          position,
          ...(avecBandeau ? { png: await bandeauPng(taille.largeur, taille.hauteur, texte, position) } : {}),
        },
      }),
    onSuccess: () => {
      void rafraichir();
      fermer();
    },
  });
  const revenir = useMutation({
    mutationFn: () => annulerMontageUgcIa(g.id),
    onSuccess: () => {
      void rafraichir();
      fermer();
    },
  });

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogPopup className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">{t("ugcIa.montage.titre", { nom: nomPersona })}</DialogTitle>
          <DialogDescription>{t("ugcIa.montage.description")}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="pb-5">
          <div className="grid gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <div className="relative mx-auto aspect-[9/16] w-full max-w-[15rem] overflow-hidden rounded-lg bg-black">
                <video
                  ref={lecteur}
                  src={g.video_brute_url ?? undefined}
                  controls
                  playsInline
                  preload="metadata"
                  onTimeUpdate={suivreLecture}
                  onSeeked={suivreLecture}
                  onPause={suivreLecture}
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    if (v.videoWidth > 0 && v.videoHeight > 0) setTaille({ largeur: v.videoWidth, hauteur: v.videoHeight });
                  }}
                  className="absolute inset-0 h-full w-full object-contain"
                />
                {apercu && (
                  <img src={apercu} alt={t("ugcIa.montage.apercuBandeau")} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
                )}
              </div>
              <p className="flex items-center justify-center gap-1.5 rounded-md bg-muted px-2 py-1 text-sm font-medium tabular-nums">
                <Timer className="size-4 text-muted-foreground" aria-hidden />
                {t("ugcIa.lecture", { temps: arrondiDixieme(temps) })}
              </p>
              <p className="text-xs text-muted-foreground">{t("ugcIa.montage.original")}</p>
            </div>

            <div className="min-w-0 space-y-5">
              <section className="space-y-2" aria-label={t("ugcIa.montage.recadrer")}>
                <h3 className="text-sm font-semibold">{t("ugcIa.montage.recadrer")}</h3>
                <p className="text-xs text-muted-foreground">{t("ugcIa.montage.recadrerAide")}</p>
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      ["debut", debut, setDebut],
                      ["fin", fin, setFin],
                    ] as const
                  ).map(([cle, valeur, changer]) => (
                    <div key={cle} className="space-y-1">
                      <span className="block text-xs text-muted-foreground">{t(`ugcIa.${cle}`)}</span>
                      <div className="flex items-center gap-1.5">
                        <Input
                          size="sm"
                          className="w-20"
                          inputMode="decimal"
                          value={valeur}
                          placeholder={cle === "debut" ? "0" : t("ugcIa.montage.finVideo")}
                          onChange={(e) => changer(e.target.value)}
                          aria-label={t(`ugcIa.montage.${cle}`)}
                        />
                        <Button
                          variant="outline"
                          size="xs"
                          title={t("ugcIa.prendreTemps")}
                          aria-label={t("ugcIa.prendrePour", { champ: t(`ugcIa.montage.${cle}`), temps: arrondiDixieme(temps) })}
                          onClick={() => changer(prendre())}
                        >
                          <Timer aria-hidden />
                          {t("ugcIa.prendre", { temps: arrondiDixieme(temps) })}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {erreurCoupe && <p className="text-xs text-destructive">{t(`ugcIa.erreurPassage.${erreurCoupe}`, { max: PASSAGE_MAX_S })}</p>}
              </section>

              <section className="space-y-2" aria-label={t("ugcIa.montage.bandeau")}>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={avecBandeau} onChange={(e) => setAvecBandeau(e.target.checked)} />
                  {t("ugcIa.montage.mettreBandeau")}
                </label>
                <p className="text-xs text-muted-foreground">{t("ugcIa.montage.bandeauAide")}</p>
                {avecBandeau && (
                  <>
                    <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={2} aria-label={t("ugcIa.montage.texteBandeau")} />
                    {ctaTexte && texte !== ctaTexte && (
                      <Button variant="link" size="xs" onClick={() => setTexte(ctaTexte)}>
                        {t("ugcIa.montage.reprendreCta")}
                      </Button>
                    )}
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
                    {erreurBandeau && <p className="text-xs text-destructive">{erreurBandeau}</p>}
                  </>
                )}
              </section>

              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button loading={enregistrer.isPending} disabled={erreurCoupe != null || erreurBandeau != null} onClick={() => enregistrer.mutate()}>
                  <Clapperboard aria-hidden />
                  {t("ugcIa.montage.enregistrer")}
                </Button>
                {estMontee(g) && (
                  <Button variant="outline" loading={revenir.isPending} onClick={() => revenir.mutate()}>
                    <Undo2 aria-hidden />
                    {t("ugcIa.montage.revenir")}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("ugcIa.montage.duree")}</p>
              {(enregistrer.error || revenir.error) && (
                <p role="alert" className="text-xs text-destructive">
                  {messageErreur(enregistrer.error ?? revenir.error)}
                </p>
              )}
            </div>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
