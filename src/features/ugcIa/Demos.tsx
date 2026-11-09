import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Download, Gauge, GripVertical, MonitorSmartphone, Plus, Scissors, Smartphone, Timer, Trash2, Upload, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Segments } from "@/components/ui/segments";
import { TitreCarte } from "@/features/bleo/ui";
import { cn } from "@/lib/utils";

import { ajouterDemoDeSource, CLE_DEMOS, finaliserDemo, importerDemo, listerDemos, supprimerDemo, type DemoUgcIa, type SourceUgcIa } from "./api";
import { arrondiDixieme, lireSecondes, messageErreur } from "./logique";
import {
  deplacerVers,
  dureeFichier,
  dureePassages,
  erreurPassages,
  nouveauPassage,
  PASSAGES_MAX,
  rendreVideo,
  VITESSES_DEMO,
  type Passage,
} from "./rendu";

const VITESSES = VITESSES_DEMO.map((v) => ({ cle: String(v), contenu: `×${String(v).replace(".", ",")}` }));

/**
 * Bibliothèque des démos (0665) : la vidéo de l'appli qu'on colle après une
 * réaction. Importée de l'ordinateur, ou reprise de la partie téléphone d'une
 * source ; montée ici (passages gardés, ordre, vitesse) avant d'être assemblée.
 */
export function CarteDemos({ sources }: { sources: SourceUgcIa[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const demos = useQuery({
    queryKey: CLE_DEMOS,
    queryFn: listerDemos,
    // Un montage se réencode côté serveur : on relit jusqu'à ce qu'il soit fini.
    refetchInterval: (q) => ((q.state.data ?? []).some((d) => d.montage_statut === "en_cours") ? 5000 : false),
  });
  const [aMonter, setAMonter] = React.useState<DemoUgcIa | null>(null);
  const rafraichir = () => qc.invalidateQueries({ queryKey: CLE_DEMOS });
  const importer = useMutation({
    mutationFn: async (fichiers: File[]) => {
      for (const f of fichiers) await importerDemo(f, await dureeFichier(f));
    },
    onSettled: rafraichir,
  });
  const reprendre = useMutation({
    mutationFn: (sourceId: string) => ajouterDemoDeSource(sourceId),
    onSuccess: async (r) => {
      await rafraichir();
      setAMonter(r.demo);
    },
  });
  const liste = demos.data ?? [];
  // Les parties téléphone des sources pas encore dans la bibliothèque.
  const reprises = new Set(liste.map((d) => d.source_id).filter(Boolean));
  const telephones = sources.filter((s) => s.telephone_url && !reprises.has(s.id));

  return (
    <Card data-testid="demos">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <TitreCarte icone={MonitorSmartphone}>{t("ugcIa.demos.titre", { count: liste.length })}</TitreCarte>
        <Button variant="outline" size="sm" asChild disabled={importer.isPending}>
          <label className="cursor-pointer">
            <Upload aria-hidden />
            {importer.isPending ? t("ugcIa.posts.envoi") : t("ugcIa.demos.importer")}
            <input
              type="file"
              accept="video/*"
              multiple
              className="sr-only"
              disabled={importer.isPending}
              aria-label={t("ugcIa.demos.importer")}
              onChange={(e) => {
                const fichiers = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (fichiers.length) importer.mutate(fichiers);
              }}
            />
          </label>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("ugcIa.demos.aide")}</p>
        {(importer.error || reprendre.error || demos.error) && (
          <p role="alert" className="text-sm text-destructive">
            {messageErreur(importer.error ?? reprendre.error ?? demos.error)}
          </p>
        )}
        {demos.data && liste.length === 0 && telephones.length === 0 && <p className="text-sm text-muted-foreground">{t("ugcIa.demos.aucune")}</p>}
        <ul className="divide-y">
          {liste.map((d) => (
            <LigneDemo key={d.id} demo={d} monter={() => setAMonter(d)} />
          ))}
          {telephones.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" data-testid={`demo-telephone-${s.id}`}>
              <Smartphone className="size-4 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {t("ugcIa.demos.telephoneDe", { titre: (s.source_texte ?? s.source_url).replace(/\s+/g, " ").slice(0, 40) })}
              </span>
              <Badge variant="outline">{t("ugcIa.demos.pasMontee")}</Badge>
              <Button variant="outline" size="xs" loading={reprendre.isPending && reprendre.variables === s.id} onClick={() => reprendre.mutate(s.id)}>
                <Scissors aria-hidden />
                {t("ugcIa.demos.monter")}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
      {aMonter && <DialogueDemo demo={aMonter} fermer={() => setAMonter(null)} />}
    </Card>
  );
}

function LigneDemo({ demo: d, monter }: { demo: DemoUgcIa; monter: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const supprimer = useMutation({ mutationFn: () => supprimerDemo(d.id), onSuccess: () => qc.invalidateQueries({ queryKey: CLE_DEMOS }) });
  const enCours = d.montage_statut === "en_cours";
  return (
    <li className="space-y-1 py-2 text-sm" data-testid={`demo-${d.id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {d.source_id ? <Smartphone className="size-4 text-muted-foreground" aria-hidden /> : <MonitorSmartphone className="size-4 text-muted-foreground" aria-hidden />}
        <span className="min-w-0 flex-1 truncate font-medium">{d.nom}</span>
        {d.video_url ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Timer className="size-3.5" aria-hidden />
            {t("ugcIa.demos.montee", { duree: d.duree_s ?? "?", passages: d.passages.length, vitesse: String(d.vitesse).replace(".", ",") })}
          </span>
        ) : (
          d.brut_duree_s != null && <span className="text-xs text-muted-foreground">{t("ugcIa.demos.brute", { duree: d.brut_duree_s })}</span>
        )}
        {enCours ? (
          <Badge variant="warning">{t("ugcIa.montage.enCours")}</Badge>
        ) : d.montage_statut === "echec" ? (
          <Badge variant="error">{t("ugcIa.demos.echec")}</Badge>
        ) : (
          <Badge variant={d.video_url ? "success" : "outline"}>{d.video_url ? t("ugcIa.demos.prete") : t("ugcIa.demos.pasMontee")}</Badge>
        )}
        <span className="flex items-center gap-1">
          <Button variant="outline" size="xs" disabled={enCours} onClick={monter}>
            <Scissors aria-hidden />
            {t("ugcIa.demos.monter")}
          </Button>
          {d.video_url && (
            <Button variant="ghost" size="xs" render={<a href={d.video_url} download />}>
              <Download aria-hidden />
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            loading={supprimer.isPending}
            aria-label={t("ugcIa.demos.supprimer")}
            onClick={() => window.confirm(t("ugcIa.demos.confirmerSuppression")) && supprimer.mutate()}
          >
            <Trash2 aria-hidden />
          </Button>
        </span>
      </div>
      {d.montage_statut === "echec" && d.montage_erreur && <p className="text-xs text-destructive">{d.montage_erreur}</p>}
      {supprimer.error && <p className="text-xs text-destructive">{messageErreur(supprimer.error)}</p>}
    </li>
  );
}

/**
 * Monter une démo : garder des passages (le reste est enlevé), les mettre dans
 * l'ordre (glisser-déposer), accélérer. La page rend la démo (le temps de la
 * vidéo, onglet visible), la fonction la réencode.
 */
export function DialogueDemo({ demo, fermer }: { demo: DemoUgcIa; fermer: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lecteur = React.useRef<HTMLVideoElement>(null);
  const [temps, setTemps] = React.useState(0);
  const [duree, setDuree] = React.useState<number | null>(demo.brut_duree_s);
  const [passages, setPassages] = React.useState<Passage[]>(() =>
    demo.passages.length > 0 ? demo.passages : demo.brut_duree_s ? [{ debut: 0, fin: demo.brut_duree_s }] : [],
  );
  const [vitesse, setVitesse] = React.useState(String(demo.vitesse || 1));
  const [glisse, setGlisse] = React.useState<number | null>(null);
  const [progres, setProgres] = React.useState<number | null>(null);
  const suivre = (e: React.SyntheticEvent<HTMLVideoElement>) => setTemps(e.currentTarget.currentTime);
  const prendre = () => Math.round((lecteur.current?.currentTime ?? 0) * 10) / 10;

  // Une vidéo de partie téléphone sans durée connue : on la lit sur le lecteur.
  const surMeta = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const d = e.currentTarget.duration;
    if (Number.isFinite(d)) {
      const arrondie = Math.round(d * 10) / 10;
      setDuree(arrondie);
      setPassages((avant) => (avant.length > 0 ? avant : [{ debut: 0, fin: arrondie }]));
    }
  };

  const v = Number(vitesse);
  const erreur = erreurPassages(passages, duree);
  const changer = (i: number, champ: keyof Passage, valeur: number | null) =>
    setPassages((avant) => avant.map((p, j) => (j === i && valeur != null ? { ...p, [champ]: valeur } : p)));

  const rendre = useMutation({
    mutationFn: async () => {
      setProgres(0);
      const rendu = await rendreVideo({
        segments: passages.map((p) => ({ url: demo.brut_url, debut: p.debut, fin: p.fin, vitesse: v })),
        onProgres: setProgres,
      });
      return finaliserDemo(demo.id, rendu, passages, v);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: CLE_DEMOS });
      fermer();
    },
    onSettled: () => setProgres(null),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !rendre.isPending && fermer()}>
      <DialogPopup className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Scissors className="size-4" aria-hidden />
            {t("ugcIa.demos.titreMontage", { nom: demo.nom })}
          </DialogTitle>
          <DialogDescription>{t("ugcIa.demos.aideMontage")}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="pb-5">
          <div className="grid gap-5 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <video
                ref={lecteur}
                src={demo.brut_url}
                controls
                muted
                playsInline
                preload="metadata"
                onTimeUpdate={suivre}
                onSeeked={suivre}
                onPause={suivre}
                onLoadedMetadata={surMeta}
                className="mx-auto aspect-[9/16] w-full max-w-[14rem] rounded-lg bg-black object-contain"
              />
              <p className="flex items-center justify-center gap-1.5 rounded-md bg-muted px-2 py-1 text-sm font-medium tabular-nums">
                <Timer className="size-4 text-muted-foreground" aria-hidden />
                {t("ugcIa.lecture", { temps: arrondiDixieme(temps) })}
              </p>
            </div>

            <div className="min-w-0 space-y-4">
              <Frise duree={duree} passages={passages} temps={temps} aller={(s) => lecteur.current && (lecteur.current.currentTime = s)} />

              <section className="space-y-2" aria-label={t("ugcIa.demos.passages")}>
                <h3 className="text-sm font-semibold">{t("ugcIa.demos.passages")}</h3>
                <p className="text-xs text-muted-foreground">{t("ugcIa.demos.aidePassages")}</p>
                <ol className="space-y-1.5">
                  {passages.map((p, i) => (
                    <li
                      key={i}
                      draggable
                      onDragStart={() => setGlisse(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (glisse != null) setPassages((avant) => deplacerVers(avant, glisse, i));
                        setGlisse(null);
                      }}
                      onDragEnd={() => setGlisse(null)}
                      className={cn("flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm", glisse === i && "opacity-50")}
                      data-testid={`passage-${i}`}
                    >
                      <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
                      <span className="w-5 text-muted-foreground tabular-nums">{i + 1}.</span>
                      {(["debut", "fin"] as const).map((champ) => (
                        <span key={champ} className="flex items-center gap-1">
                          <Input
                            size="sm"
                            className="w-16"
                            inputMode="decimal"
                            value={String(p[champ])}
                            onChange={(e) => changer(i, champ, lireSecondes(e.target.value))}
                            aria-label={t(`ugcIa.demos.${champ}Passage`, { n: i + 1 })}
                          />
                          <Button
                            variant="outline"
                            size="xs"
                            aria-label={t("ugcIa.prendrePour", { champ: t(`ugcIa.demos.${champ}Passage`, { n: i + 1 }), temps: arrondiDixieme(temps) })}
                            onClick={() => changer(i, champ, prendre())}
                          >
                            <Timer aria-hidden />
                          </Button>
                        </span>
                      ))}
                      <span className="ml-auto flex items-center">
                        <Button variant="ghost" size="icon-xs" aria-label={t("ugcIa.posts.monter")} disabled={i === 0} onClick={() => setPassages(deplacerVers(passages, i, i - 1))}>
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t("ugcIa.posts.descendre")}
                          disabled={i === passages.length - 1}
                          onClick={() => setPassages(deplacerVers(passages, i, i + 1))}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                        <Button variant="ghost" size="icon-xs" aria-label={t("ugcIa.demos.enlever", { n: i + 1 })} onClick={() => setPassages(passages.filter((_, j) => j !== i))}>
                          <X aria-hidden />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ol>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={passages.length >= PASSAGES_MAX}
                  onClick={() => setPassages([...passages, nouveauPassage(lecteur.current?.currentTime ?? temps, duree)])}
                >
                  <Plus aria-hidden />
                  {t("ugcIa.demos.ajouterPassage")}
                </Button>
              </section>

              <section className="flex flex-wrap items-center gap-3">
                <Gauge className="size-4 text-muted-foreground" aria-hidden />
                <Segments libelle={t("ugcIa.demos.vitesse")} options={VITESSES} actif={vitesse} onChange={setVitesse} />
                <span className="text-sm text-muted-foreground">{t("ugcIa.demos.dureeFinale", { duree: dureePassages(passages, v) })}</span>
              </section>

              {erreur && <p className="text-xs text-destructive">{t(`ugcIa.demos.erreur.${erreur}`, { max: PASSAGES_MAX })}</p>}
              {progres != null && (
                <div className="space-y-1">
                  <Progress value={Math.round(progres * 100)} />
                  <p className="text-xs text-muted-foreground">{t("ugcIa.rendu.enCours")}</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button loading={rendre.isPending} disabled={erreur != null} onClick={() => rendre.mutate()}>
                  <Scissors aria-hidden />
                  {t("ugcIa.demos.rendre")}
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

/** La frise de la vidéo : les passages gardés en couleur, numérotés ; un clic y amène le lecteur. */
function Frise({ duree, passages, temps, aller }: { duree: number | null; passages: Passage[]; temps: number; aller: (s: number) => void }) {
  const { t } = useTranslation();
  if (!duree) return null;
  const pct = (s: number) => `${Math.min(100, Math.max(0, (s / duree) * 100))}%`;
  return (
    <div className="space-y-1">
      <div
        role="slider"
        tabIndex={0}
        aria-label={t("ugcIa.demos.frise")}
        aria-valuemin={0}
        aria-valuemax={duree}
        aria-valuenow={Math.round(temps * 10) / 10}
        className="relative h-8 w-full cursor-pointer overflow-hidden rounded-md bg-muted"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          aller(((e.clientX - r.left) / r.width) * duree);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") aller(Math.min(duree, temps + 0.5));
          if (e.key === "ArrowLeft") aller(Math.max(0, temps - 0.5));
        }}
      >
        {passages.map((p, i) => (
          <span
            key={i}
            className="absolute inset-y-0 flex items-center justify-center bg-primary/70 text-[10px] font-semibold text-primary-foreground"
            style={{ left: pct(p.debut), width: `calc(${pct(p.fin)} - ${pct(p.debut)})` }}
          >
            {i + 1}
          </span>
        ))}
        <span className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: pct(temps) }} aria-hidden />
      </div>
      <p className="text-[11px] text-muted-foreground">{t("ugcIa.demos.aideFrise")}</p>
    </div>
  );
}
