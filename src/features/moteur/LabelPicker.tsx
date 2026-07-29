import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { listerLabels } from "@/features/moteur/api";

/**
 * Pastilles de labels (multi-sélection). `selected` = ids cochés ;
 * `onChange` reçoit la nouvelle liste.
 */
export function LabelPicker({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const labels = useQuery({ queryKey: ["labels"], queryFn: listerLabels });
  const set = new Set(selected);

  if (labels.isPending) {
    return <p className="text-xs text-muted-foreground">{t("common.loading")}</p>;
  }

  if (labels.isError) {
    return (
      <p className="text-xs text-destructive">
        {t("labels.erreurChargement")}: {(labels.error as Error).message}
      </p>
    );
  }

  if (!labels.data?.length) {
    return <p className="text-xs text-muted-foreground">{t("labels.aucun")}</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.data.map((lab) => {
        const on = set.has(lab.id);
        return (
          <button
            key={lab.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              const next = new Set(set);
              if (on) next.delete(lab.id);
              else next.add(lab.id);
              onChange([...next]);
            }}
            className={
              on
                ? "rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground"
                : "rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
            }
            style={
              on && lab.couleur
                ? { backgroundColor: lab.couleur, borderColor: lab.couleur }
                : undefined
            }
          >
            {lab.nom}
          </button>
        );
      })}
    </div>
  );
}

/** Charge + sauvegarde les labels d'une entité (compte / source / contenu). */
export function LabelEditor({
  load,
  save,
  queryKey,
  afficherTitre = true,
}: {
  load: () => Promise<string[]>;
  save: (ids: string[]) => Promise<unknown>;
  queryKey: unknown[];
  /** Masquer le titre « Labels » quand le parent l'affiche déjà. */
  afficherTitre?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey, queryFn: load });
  const [local, setLocal] = React.useState<string[] | null>(null);
  const ids = local ?? q.data ?? [];

  const mut = useMutation({
    mutationFn: (next: string[]) => save(next),
    onSuccess: () => {
      setLocal(null);
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["labels"] });
    },
  });

  return (
    <div className="space-y-1.5">
      {afficherTitre && <p className="text-xs font-medium">{t("labels.title")}</p>}
      {q.isError && (
        <p className="text-xs text-destructive">
          {t("labels.erreurChargement")}: {(q.error as Error).message}
        </p>
      )}
      <LabelPicker
        selected={ids}
        disabled={mut.isPending || q.isPending || q.isError}
        onChange={(next) => {
          setLocal(next);
          mut.mutate(next);
        }}
      />
      {mut.isError && (
        <p className="text-xs text-destructive">{(mut.error as Error).message}</p>
      )}
    </div>
  );
}
