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
  languesOrdonnees,
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
          <a key={s.position} href={s.url} target="_blank" rel="noreferrer" className="shrink-0">
            <img
              src={s.url}
              alt={`slide ${s.position}`}
              loading="lazy"
              className={`h-56 w-auto rounded-md border ${s.position_sophia ? "ring-2 ring-primary" : ""}`}
            />
            {s.position_sophia && <p className="mt-0.5 text-center text-xs text-primary">{t("pods.appli")}</p>}
          </a>
        ))}
      </div>
      {deck?.hashtags && <p className="text-xs text-muted-foreground">{deck.hashtags}</p>}
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
            {livraison.type === "langues" && (
              <span className="mr-1 font-medium text-foreground">
                {t("pods.nouvellesLangues", { langues: Object.keys(livraison.decks ?? {}).join(", ") })} ·
              </span>
            )}
            {livraison.source_vues != null && t("pods.vues", { n: livraison.source_vues.toLocaleString() })}
            {livraison.source_url && (
              <a className="ml-2 inline-flex items-center gap-1 underline" href={livraison.source_url} target="_blank" rel="noreferrer">
                {t("pods.source")} <ExternalLink className="size-3" />
              </a>
            )}
          </p>
        </div>
        <Badge variant={varianteStatut(livraison.statut)}>{t(`pods.statut.${livraison.statut}`)}</Badge>
      </div>

      <Deck livraison={livraison} />

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
          {livraison.statut === "validee" && t("pods.valide", { tier: livraison.tier, note: livraison.note_import })}
          {livraison.statut === "ecartee_note" && t("pods.ecartee", { note: livraison.note_import })}
          {livraison.statut === "rejetee" && `${t("pods.rejete")}${livraison.motif ? ` — ${livraison.motif}` : ""}`}
        </p>
      )}
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
