import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Boxes, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { drapeauLangue } from "@/features/moteur/langues";
import {
  deciderPersona,
  enregistrerDemo,
  itemsVideo,
  languesOrdonnees,
  listerDemos,
  listerPersonas,
  nomsComptes,
  POD_VIDEO,
  listerLivraisons,
  listerPods,
  parPod,
  rejeterLivraison,
  validerLivraison,
  type Livraison,
  type StatutLivraison,
} from "@/features/pods/api";

function varianteStatut(s: StatutLivraison): "warning" | "success" | "destructive" | "secondary" {
  if (s === "validee") return "success";
  if (s === "rejetee") return "destructive";
  if (s === "ecartee_note") return "secondary";
  return "warning";
}

function Deck({ livraison }: { livraison: Livraison }) {
  const { t } = useTranslation();
  const langues = languesOrdonnees(livraison);
  const [langue, setLangue] = React.useState(langues[0]);
  const deck = livraison.decks[langue];
  return (
    <div className="space-y-2">
      {langues.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {langues.map((l) => (
            <Button key={l} size="sm" variant={l === langue ? "default" : "outline"} onClick={() => setLangue(l)}>
              {drapeauLangue(l)} {l}
            </Button>
          ))}
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {deck?.slides.map((s) => (
          <div key={s.position} className="w-32 shrink-0 space-y-1">
            <a href={s.url} target="_blank" rel="noreferrer" className="relative block">
              {s.texte_overlay !== undefined && (
                <span className="absolute inset-x-1 top-1/2 -translate-y-1/2 whitespace-pre-line rounded bg-black/50 p-1 text-center text-[9px] leading-tight text-white">
                  {s.texte_sophia ?? s.texte_overlay}
                </span>
              )}
              <img
                src={s.url}
                alt={`slide ${s.position}`}
                loading="lazy"
                className={`h-56 w-full rounded-md border object-cover ${s.position_sophia ? "ring-2 ring-primary" : ""}`}
              />
            </a>
            {s.position_sophia && <p className="text-center text-xs text-primary">{t("pods.appli")}</p>}
            {s.reference_url && (
              <a href={s.reference_url} target="_blank" rel="noreferrer" className="block" title={t("pods.inspiration")}>
                <img src={s.reference_url} alt="" loading="lazy" className="h-16 w-auto rounded border opacity-80" />
                <span className="text-[10px] text-muted-foreground">{t("pods.inspiration")}</span>
              </a>
            )}
          </div>
        ))}
      </div>
      {deck?.hashtags && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t("pods.legende")} :</span> {deck.hashtags}
        </p>
      )}
    </div>
  );
}

function LigneLivraison({ livraison }: { livraison: Livraison }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [motif, setMotif] = React.useState("");
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["pods", "livraisons"] });
  const valider = useMutation({ mutationFn: () => validerLivraison(livraison.id), onSuccess: rafraichir });
  const rejeter = useMutation({ mutationFn: () => rejeterLivraison(livraison.id, motif), onSuccess: rafraichir });
  const occupe = valider.isPending || rejeter.isPending;
  const erreur = (valider.error ?? rejeter.error) as Error | null;

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{livraison.titre ?? livraison.id}</p>
          <p className="text-xs text-muted-foreground">
            {livraison.type === "original" && (
              <span className="mr-1 font-medium text-foreground">{t("pods.original")} · </span>
            )}
            {livraison.type === "langues" && (
              <span className="mr-1 font-medium text-foreground">
                {t("pods.nouvellesLangues", { langues: Object.keys(livraison.decks ?? {}).join(", ") })} ·
              </span>
            )}
            {livraison.source_vues != null && t("pods.vues", { n: livraison.source_vues.toLocaleString() })}
            {livraison.musique_titre && (
              <span className="ml-2">
                ♪{" "}
                {livraison.musique_url ? (
                  <a className="underline" href={livraison.musique_url} target="_blank" rel="noreferrer">
                    {livraison.musique_titre}
                  </a>
                ) : (
                  livraison.musique_titre
                )}
              </span>
            )}
            {livraison.source_url && (
              <a className="ml-2 inline-flex items-center gap-1 underline" href={livraison.source_url} target="_blank" rel="noreferrer">
                {t("pods.source")} <ExternalLink className="size-3" />
              </a>
            )}
          </p>
        </div>
        <Badge variant={varianteStatut(livraison.statut)}>{t(`pods.statut.${livraison.statut}`)}</Badge>
      </div>

      {livraison.type === "video" ? <DeckVideo livraison={livraison} /> : <Deck livraison={livraison} />}

      {livraison.statut === "a_valider" ? (
        <div className="space-y-2">
          <Textarea value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={t("pods.motif")} rows={1} />
          <div className="flex gap-2">
            <Button disabled={occupe} onClick={() => valider.mutate()}>
              {t("pods.valider")}
            </Button>
            <Button disabled={occupe} variant="outline" onClick={() => rejeter.mutate()}>
              {t("pods.rejeter")}
            </Button>
          </div>
          {erreur && <p className="text-sm text-destructive">{erreur.message}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {livraison.statut === "validee" &&
            (livraison.type === "video"
              ? t("pods.videoValidee")
              : t("pods.valide", { tier: livraison.tier, note: livraison.note_import }))}
          {livraison.statut === "ecartee_note" && t("pods.ecartee", { note: livraison.note_import })}
          {livraison.statut === "rejetee" && `${t("pods.rejete")}${livraison.motif ? ` — ${livraison.motif}` : ""}`}
        </p>
      )}
    </div>
  );
}

/** Livraison vidéo (pod 3) : une réaction refaite par compte, avec ses textes. */
function DeckVideo({ livraison }: { livraison: Livraison }) {
  const { t } = useTranslation();
  const items = itemsVideo(livraison);
  const noms = useQuery({
    queryKey: ["pods", "noms", livraison.id],
    queryFn: () => nomsComptes(items.map(([id]) => id)),
  });
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {items.map(([compteId, item]) => (
        <div key={compteId} className="w-44 shrink-0 space-y-1 text-xs">
          <video src={item.reaction_url} controls muted playsInline preload="metadata" className="h-72 w-full rounded-md border bg-black object-cover" />
          <p className="font-medium">
            {drapeauLangue(item.langue)} {noms.data?.get(compteId) ?? compteId.slice(0, 8)}
          </p>
          <p>
            <span className="text-muted-foreground">{t("pods.texteEcran")} :</span> {item.texte_ecran}
          </p>
          <p className="text-muted-foreground">{item.legende}</p>
        </div>
      ))}
    </div>
  );
}

/** Personas synthétiques du pod vidéo : 1 compte = 1 persona, validé à la main. */
function PanneauPersonas({ pod }: { pod: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["pods", "personas", pod], queryFn: () => listerPersonas(pod) });
  const decider = useMutation({
    mutationFn: ({ id, ok }: { id: string; ok: boolean }) => deciderPersona(id, ok),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pods", "personas", pod] }),
  });
  const personas = data ?? [];
  const aValider = personas.filter((p) => p.statut === "a_valider");
  const valides = personas.filter((p) => p.statut === "valide");
  return (
    <details className="rounded-xl border p-4" open={aValider.length > 0}>
      <summary className="cursor-pointer text-sm font-medium">
        {t("pods.personas", { valides: valides.length, attente: aValider.length })}
      </summary>
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      <p className="mt-2 text-xs text-muted-foreground">{t("pods.personasAide")}</p>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {[...aValider, ...valides].map((p) => (
          <div key={p.id} className="w-36 shrink-0 space-y-1 text-xs">
            <img src={p.image_url} alt="" loading="lazy" className="h-48 w-full rounded-md border object-cover" />
            <p className="font-medium">
              {drapeauLangue(p.compte?.langue ?? "")} {p.compte?.handle_tiktok ? `@${p.compte.handle_tiktok}` : p.compte?.persona_nom}
            </p>
            {p.statut === "a_valider" ? (
              <div className="flex gap-1">
                <Button size="sm" disabled={decider.isPending} onClick={() => decider.mutate({ id: p.id, ok: true })}>
                  {t("pods.valider")}
                </Button>
                <Button size="sm" variant="outline" disabled={decider.isPending} onClick={() => decider.mutate({ id: p.id, ok: false })}>
                  {t("pods.rejeter")}
                </Button>
              </div>
            ) : (
              <Badge variant="success">{t("pods.statut.validee")}</Badge>
            )}
          </div>
        ))}
      </div>
      {decider.error && <p className="text-sm text-destructive">{(decider.error as Error).message}</p>}
    </details>
  );
}

/** Démos Sophia par langue : la vidéo « utilisation » que le poster colle après la réaction. */
function PanneauDemos() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["pods", "demos"], queryFn: listerDemos });
  const [langue, setLangue] = React.useState("");
  const [fichier, setFichier] = React.useState<File | null>(null);
  const envoyer = useMutation({
    mutationFn: () => enregistrerDemo(langue, fichier!),
    onSuccess: () => {
      setFichier(null);
      setLangue("");
      void qc.invalidateQueries({ queryKey: ["pods", "demos"] });
    },
  });
  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer text-sm font-medium">{t("pods.demos", { n: data?.length ?? 0 })}</summary>
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      <p className="mt-2 text-xs text-muted-foreground">{t("pods.demosAide")}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {(data ?? []).map((d) => (
          <div key={d.id} className="w-28 space-y-1 text-xs">
            <video src={d.video_url} controls muted playsInline preload="metadata" className="h-48 w-full rounded-md border bg-black object-cover" />
            <p className="text-center font-medium">
              {drapeauLangue(d.langue)} {d.langue}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={langue}
          onChange={(e) => setLangue(e.target.value)}
          placeholder="fr"
          maxLength={2}
          className="h-9 w-16 rounded-md border bg-background px-2 text-sm"
          aria-label={t("pods.demoLangue")}
        />
        <input type="file" accept="video/mp4,video/quicktime" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} className="text-sm" />
        <Button size="sm" disabled={!fichier || langue.length !== 2 || envoyer.isPending} onClick={() => envoyer.mutate()}>
          {envoyer.isPending ? t("pods.demoEnvoi") : t("pods.demoEnvoyer")}
        </Button>
      </div>
      {envoyer.error && <p className="text-sm text-destructive">{(envoyer.error as Error).message}</p>}
    </details>
  );
}

/** Valide toute la file d'un pod au rang B, une livraison après l'autre. */
function ToutValiderEnB({ livraisons }: { livraisons: Livraison[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [fait, setFait] = React.useState(0);
  const [erreurs, setErreurs] = React.useState<string[]>([]);
  const tout = useMutation({
    mutationFn: async () => {
      setFait(0);
      setErreurs([]);
      for (const l of livraisons) {
        try {
          await validerLivraison(l.id, "B");
        } catch (e) {
          setErreurs((x) => [...x, `${l.titre ?? l.id} : ${(e as Error).message}`]);
        }
        setFait((n) => n + 1);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["pods", "livraisons"] }),
  });
  if (!livraisons.length) return null;
  return (
    <div className="space-y-1">
      <Button
        disabled={tout.isPending}
        onClick={() => window.confirm(t("pods.toutValiderBConfirm", { n: livraisons.length })) && tout.mutate()}
      >
        {tout.isPending ? t("pods.toutValiderBEnCours", { fait, n: livraisons.length }) : t("pods.toutValiderB", { n: livraisons.length })}
      </Button>
      {erreurs.map((e) => (
        <p key={e} className="text-sm text-destructive">
          {e}
        </p>
      ))}
    </div>
  );
}

export function AdminPodsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({ queryKey: ["pods", "livraisons"], queryFn: listerLivraisons });
  const pods = useQuery({ queryKey: ["pods", "liste"], queryFn: listerPods });

  const liste = pods.data ?? [];
  const attente = parPod(liste, data?.aValider ?? []);
  const faites = parPod(liste, data?.decidees ?? []);
  const slugs = [...new Set([...attente.keys(), ...faites.keys()])];
  const infos = (slug: string) => liste.find((p) => p.slug === slug);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("pods.title")}</CardTitle>
          <CardDescription>{t("pods.subtitle")}</CardDescription>
        </CardHeader>
        {slugs.length > 1 && (
          <CardContent className="flex flex-wrap gap-2">
            {slugs.map((slug) => (
              <a key={slug} href={`#pod-${slug}`}>
                <Badge variant={attente.get(slug)?.length ? "warning" : "secondary"}>
                  {infos(slug)?.nom ?? slug} · {t("pods.aValider")} {attente.get(slug)?.length ?? 0}
                </Badge>
              </a>
            ))}
          </CardContent>
        )}
      </Card>

      {(error || pods.error) && <p className="text-sm text-destructive">{((error ?? pods.error) as Error).message}</p>}

      {!isLoading && !slugs.length && (
        <EmptyState icon={<Boxes />} title={t("pods.vide")} description={t("pods.videDesc")} />
      )}

      {slugs.map((slug) => {
        const pod = infos(slug);
        const aValider = attente.get(slug) ?? [];
        const decidees = faites.get(slug) ?? [];
        return (
          <Card key={slug} id={`pod-${slug}`}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {pod?.nom ?? slug}
                {pod?.label && <Badge variant="secondary">{t("pods.label", { label: pod.label })}</Badge>}
                {pod && !pod.actif && <Badge variant="destructive">{t("pods.inactif")}</Badge>}
              </CardTitle>
              <CardDescription>
                {t("pods.aValider")} ({aValider.length})
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {slug === POD_VIDEO ? (
                <>
                  <PanneauPersonas pod={slug} />
                  <PanneauDemos />
                </>
              ) : (
                <ToutValiderEnB livraisons={aValider} />
              )}
              {aValider.length ? (
                aValider.map((l) => <LigneLivraison key={l.id} livraison={l} />)
              ) : (
                <p className="text-sm text-muted-foreground">{t("pods.vide")}</p>
              )}
              {!!decidees.length && (
                <details className="space-y-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    {t("pods.historique")} ({decidees.length})
                  </summary>
                  <div className="mt-4 space-y-4">
                    {decidees.map((l) => (
                      <LigneLivraison key={l.id} livraison={l} />
                    ))}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
