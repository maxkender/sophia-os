import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Trash2, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardPanel, EmptyState } from "@/components/ui/card";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { listerPosters } from "@/features/moteur/api";
import { drapeauLangue, LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";

import {
  ajouterRelecteur,
  listerRelecteurs,
  majRelecteur,
  supprimerRelecteur,
  synchroniserNotion,
  URL_NOTION_RELECTEURS,
  type ResumeSynchroNotion,
} from "./api";
import { CLASSES_TON, initiales, type Ton } from "./apparence";
import { languesDuPoster, STATUTS_RELECTEUR, type StatutRelecteur } from "./logique";
import { messageErreur } from "./messageErreur";
import { TuileIcone } from "./Puces";

export const CLE_REQUETE_RELECTEURS = ["relecteurs-natifs"] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const TON_STATUT: Record<StatutRelecteur, Ton> = {
  invite: "bleu",
  actif: "vert",
  pause: "ambre",
  retire: "neutre",
};

function nomPoster(p: { prenom: string | null; nom: string | null; email: string | null }): string {
  return [p.prenom, p.nom].filter(Boolean).join(" ") || p.email || "—";
}

/**
 * Les relecteurs natifs : leur langue et leur statut, et l'ajout d'un posteur
 * comme relecteur. Un relecteur corrigera les posts publiés dans sa langue ; il
 * ne voit son espace que s'il est invité ou actif ET que l'espace est ouvert.
 */
export function SectionRelecteurs() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const relecteurs = useQuery({ queryKey: CLE_REQUETE_RELECTEURS, queryFn: listerRelecteurs });
  const posters = useQuery({ queryKey: ["posters"], queryFn: listerPosters });

  const [posterId, setPosterId] = React.useState("");
  const [langue, setLangue] = React.useState("");

  const candidats = React.useMemo(
    () =>
      (posters.data ?? [])
        .filter((p) => p.role === "poster" && p.is_active)
        .sort((a, b) => nomPoster(a).localeCompare(nomPoster(b))),
    [posters.data],
  );

  const choisirPoster = (id: string) => {
    setPosterId(id);
    const p = candidats.find((c) => c.id === id);
    const langues = p ? languesDuPoster(p) : [];
    setLangue(langues[0] ?? "");
  };

  // La table Notion « Relecteurs natifs » suit chaque changement.
  const synchro = useMutation({ mutationFn: synchroniserNotion });
  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: CLE_REQUETE_RELECTEURS });
    synchro.mutate();
  };

  const ajouter = useMutation({
    mutationFn: () => ajouterRelecteur(posterId, langue),
    onSuccess: () => {
      setPosterId("");
      setLangue("");
      rafraichir();
    },
  });
  const changerStatut = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: StatutRelecteur }) => majRelecteur(id, { statut }),
    onSuccess: rafraichir,
  });
  const retirer = useMutation({ mutationFn: (id: string) => supprimerRelecteur(id), onSuccess: rafraichir });

  const erreur = relecteurs.error ?? posters.error;

  return (
    <div className="space-y-4">
      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(erreur)}
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
          <TuileIcone icone={Users} ton="bleu" />
          <div className="min-w-[12rem] flex-1">
            <p className="text-sm font-semibold">{t("relectureNative.relecteurs.titre")}</p>
            <p className="text-xs text-muted-foreground">{t("relectureNative.relecteurs.aide")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => synchro.mutate()} disabled={synchro.isPending}>
              {synchro.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {t("relectureNative.notion.maj")}
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href={URL_NOTION_RELECTEURS} target="_blank" rel="noreferrer">
                <ExternalLink />
                {t("relectureNative.notion.ouvrir")}
              </a>
            </Button>
          </div>
        </div>
        <EtatNotion pending={synchro.isPending} resultat={synchro.data} erreur={synchro.error} />
        {relecteurs.isPending && <p className="px-5 py-4 text-sm text-muted-foreground">{t("common.loading")}</p>}
        {relecteurs.data?.length === 0 && (
          <div className="p-5">
            <EmptyState title={t("relectureNative.relecteurs.vide")} />
          </div>
        )}
        {(relecteurs.data?.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className={cn(MICRO_LABEL, "px-5 py-2.5")}>{t("relectureNative.relecteurs.relecteur")}</th>
                  <th className={cn(MICRO_LABEL, "px-3 py-2.5")}>{t("relectureNative.relecteurs.langue")}</th>
                  <th className={cn(MICRO_LABEL, "px-3 py-2.5")}>{t("relectureNative.relecteurs.statut")}</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {(relecteurs.data ?? []).map((r) => (
                  <tr key={r.id} className="align-middle" data-testid={`relecteur-${r.id}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                          {initiales(nomPoster(r))}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{nomPoster(r)}</p>
                          {r.email && <p className="truncate text-xs text-muted-foreground">{r.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="mr-1.5 text-base" aria-hidden>
                        {drapeauLangue(r.langue)}
                      </span>
                      {nomLangue(r.langue)}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        className={cn(
                          "h-8 rounded-full border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          CLASSES_TON[TON_STATUT[r.statut]],
                        )}
                        aria-label={t("relectureNative.relecteurs.statut")}
                        value={r.statut}
                        disabled={changerStatut.isPending}
                        onChange={(e) => changerStatut.mutate({ id: r.id, statut: e.target.value as StatutRelecteur })}
                      >
                        {STATUTS_RELECTEUR.map((s) => (
                          <option key={s} value={s}>
                            {t(`relectureNative.statuts.${s}`)}
                          </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            title={t("relectureNative.relecteurs.retirer")}
                            aria-label={t("relectureNative.relecteurs.retirer")}
                            disabled={retirer.isPending}
                            onClick={() => {
                              if (window.confirm(t("relectureNative.relecteurs.confirmerRetrait", { nom: nomPoster(r) })))
                                retirer.mutate(r.id);
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(changerStatut.error ?? retirer.error) && (
          <p role="alert" className="px-5 py-3 text-xs text-destructive">
            {messageErreur(changerStatut.error ?? retirer.error)}
          </p>
        )}
      </Card>

      <Card>
        <CardPanel className="space-y-4">
          <div className="flex items-start gap-3">
            <TuileIcone icone={UserPlus} />
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold">{t("relectureNative.relecteurs.ajouterTitre")}</p>
              <p className="text-xs text-muted-foreground">{t("relectureNative.relecteurs.ajouterAide")}</p>
            </div>
          </div>
          <form
            className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (posterId && langue) ajouter.mutate();
            }}
          >
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t("relectureNative.relecteurs.poster")}</span>
              <select
                className={selectClass}
                value={posterId}
                onChange={(e) => choisirPoster(e.target.value)}
                disabled={posters.isPending}
              >
                <option value="">{t("relectureNative.relecteurs.choisirPoster")}</option>
                {candidats.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nomPoster(p)}
                    {languesDuPoster(p).length > 0 ? ` · ${languesDuPoster(p).map(drapeauLangue).join(" ")}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t("relectureNative.relecteurs.langue")}</span>
              <select className={selectClass} value={langue} onChange={(e) => setLangue(e.target.value)}>
                <option value="">{t("relectureNative.relecteurs.choisirLangue")}</option>
                {LANGUES_CIBLES.map((l) => (
                  <option key={l} value={l}>
                    {drapeauLangue(l)} {nomLangue(l)}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={!posterId || !langue || ajouter.isPending}>
              <UserPlus />
              {t("relectureNative.relecteurs.ajouter")}
            </Button>
          </form>
          {ajouter.error && (
            <p role="alert" className="text-xs text-destructive">
              {messageErreur(ajouter.error)}
            </p>
          )}
        </CardPanel>
      </Card>
    </div>
  );
}

/** Où en est la table Notion, sous l'en-tête des relecteurs. Rien tant qu'on n'a rien demandé. */
function EtatNotion({
  pending,
  resultat,
  erreur,
}: {
  pending: boolean;
  resultat: ResumeSynchroNotion | undefined;
  erreur: unknown;
}) {
  const { t } = useTranslation();
  let contenu: React.ReactNode = null;
  if (pending) {
    contenu = <span className="text-muted-foreground">{t("relectureNative.notion.enCours")}</span>;
  } else if (erreur) {
    contenu = (
      <span role="alert" className="flex items-center gap-1.5 text-destructive">
        <AlertCircle className="size-3.5 shrink-0" aria-hidden />
        {messageErreur(erreur)}
      </span>
    );
  } else if (resultat?.secret_manquant) {
    contenu = <span className="text-warning-foreground">{t("relectureNative.notion.secretManquant")}</span>;
  } else if (resultat) {
    contenu = (
      <span className="flex items-center gap-1.5 text-success-foreground">
        <CheckCircle2 className="size-3.5" aria-hidden />
        {t("relectureNative.notion.aJour", { n: resultat.ecrites ?? 0 })}
      </span>
    );
  }
  if (!contenu) return null;
  return (
    <div className="border-b bg-muted/30 px-5 py-2 text-xs" data-testid="etat-notion">
      {contenu}
    </div>
  );
}
