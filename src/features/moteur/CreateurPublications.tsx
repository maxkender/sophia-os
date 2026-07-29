import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink, LinkIcon, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listerPublicationsCompte,
  renseignerLienPublie,
  type PublicationCompte,
} from "@/features/moteur/api";
import { nomLangue } from "@/features/moteur/langues";
import type { PosterProfil } from "@/features/moteur/types";

function LienEdition({
  pub,
  onSaved,
}: {
  pub: PublicationCompte;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [edit, setEdit] = React.useState(!pub.publie_url);
  const [url, setUrl] = React.useState(pub.publie_url ?? "");
  const save = useMutation({
    mutationFn: () =>
      renseignerLienPublie(
        { passageId: pub.passage_id, postId: pub.post_id },
        url,
      ),
    onSuccess: () => {
      setEdit(false);
      onSaved();
    },
  });

  if (!edit && pub.publie_url) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={pub.publie_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2"
        >
          TikTok <ExternalLink className="size-3" />
        </a>
        <button
          type="button"
          className="text-muted-foreground underline underline-offset-2"
          onClick={() => {
            setUrl(pub.publie_url ?? "");
            setEdit(true);
          }}
        >
          {t("posters.modifierLien")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={t("posters.lienPlaceholder")}
        className="h-7 min-w-[14rem] flex-1 text-xs"
      />
      <Button
        size="sm"
        className="h-7"
        disabled={save.isPending || !url.trim()}
        onClick={() => save.mutate()}
      >
        {save.isPending ? t("common.saving") : t("common.save")}
      </Button>
      {pub.publie_url && (
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setEdit(false)}>
          {t("common.cancel")}
        </Button>
      )}
      {save.isError && (
        <span className="w-full text-[11px] text-destructive">
          {save.error instanceof Error ? save.error.message : String(save.error)}
        </span>
      )}
    </div>
  );
}

/**
 * Panneau des TikToks déjà publiés d'un créateur : ouvrir les liens connus,
 * et renseigner manuellement ceux qui manquent (sync post + passage).
 */
export function CreateurPublications({
  poster,
  onClose,
}: {
  poster: PosterProfil;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const compteId = poster.compte_id;
  const pubs = useQuery({
    queryKey: ["publications-compte", compteId],
    queryFn: () => listerPublicationsCompte(compteId!),
    enabled: !!compteId,
  });

  const nom =
    [poster.prenom, poster.nom].filter(Boolean).join(" ") || poster.email || "—";
  const sansLien = (pubs.data ?? []).filter((p) => !p.publie_url).length;
  const avecLien = (pubs.data ?? []).filter((p) => p.publie_url);

  function ouvrirTous() {
    for (const p of avecLien) {
      if (p.publie_url) window.open(p.publie_url, "_blank", "noopener,noreferrer");
    }
  }

  function rafraichir() {
    void queryClient.invalidateQueries({ queryKey: ["publications-compte", compteId] });
    void queryClient.invalidateQueries({ queryKey: ["stats-posts"] });
    void queryClient.invalidateQueries({ queryKey: ["stats-comptes"] });
    void queryClient.invalidateQueries({ queryKey: ["slideshow"] });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("posters.tiktoksPublies")}</p>
          <p className="text-xs text-muted-foreground">
            {t("posters.tiktoksPubliesDesc", { nom })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {avecLien.length > 0 && (
            <Button size="sm" variant="outline" onClick={ouvrirTous}>
              <ExternalLink className="size-3.5" />
              {t("posters.ouvrirTous", { count: avecLien.length })}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose} aria-label={t("common.close")}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {!compteId && (
        <p className="text-xs text-muted-foreground">{t("posters.sansCompteCree")}</p>
      )}

      {compteId && pubs.isPending && (
        <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
      )}
      {compteId && pubs.isError && (
        <p className="text-xs text-destructive">
          {pubs.error instanceof Error ? pubs.error.message : String(pubs.error)}
        </p>
      )}
      {compteId && pubs.data && pubs.data.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("posters.aucunPublie")}</p>
      )}

      {compteId && pubs.data && pubs.data.length > 0 && (
        <>
          {sansLien > 0 && (
            <Badge variant="warning" className="gap-1">
              <LinkIcon className="size-3" />
              {t("posters.sansLien", { count: sansLien })}
            </Badge>
          )}
          <ul className="space-y-2">
            {pubs.data.map((p) => (
              <li key={p.key} className="rounded-md border bg-card p-2 text-xs">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                  <span className="font-medium">
                    {p.titre?.trim() || t("posts.title")}
                  </span>
                  <span className="text-muted-foreground">
                    {[
                      p.date_publication_prevue
                        ? new Date(p.date_publication_prevue).toLocaleDateString(
                            i18n.language,
                          )
                        : p.publie_at
                          ? new Date(p.publie_at).toLocaleDateString(i18n.language)
                          : null,
                      p.langue ? nomLangue(p.langue) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {!p.publie_url && (
                  <p className="mb-1 text-[11px] text-amber-700 dark:text-amber-400">
                    {t("posters.lienManquant")}
                  </p>
                )}
                <LienEdition pub={p} onSaved={rafraichir} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
