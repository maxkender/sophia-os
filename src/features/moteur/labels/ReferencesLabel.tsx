/**
 * 23/11 : dans la ligne dépliée de la page Labels, la DA du label en petit (sa description de la Bible et une bande
 * de miniatures : la 1re slide des posts les plus vus de ses sources) et ses comptes de référence (les sources
 * TikTok qui portent ce label, avec leur étape). Lu depuis la Bible, mêmes données, même cache.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { lireCartes, VUES } from "@/features/bible/moodboard";
import { lireSources, type SourceBible } from "@/features/bible/sources";
import { cn } from "@/lib/utils";

/** Miniatures de la DA : assez pour voir le style, pas plus. */
const MAX_MINIATURES = 8;

const libelleEtape = (e: SourceBible["etape"]): string => VUES.find((v) => v.cle === e)?.libelle ?? e;

/** Les sources du label, les actives d'abord, puis les meilleures vues médianes. */
function sourcesDuLabel(sources: SourceBible[], labelId: string): SourceBible[] {
  return sources
    .filter((s) => s.labels.some((l) => l.id === labelId))
    .sort((a, b) => Number(b.actif) - Number(a.actif) || (b.perf?.vuesMediane ?? -1) - (a.perf?.vuesMediane ?? -1) || a.handle.localeCompare(b.handle));
}

/** La 1re slide de chaque source, puis les suivantes, jusqu'à `max` : une bande variée plutôt qu'un seul compte. */
function miniaturesDA(sources: SourceBible[], max = MAX_MINIATURES): { url: string; post: string | null; handle: string }[] {
  const out: { url: string; post: string | null; handle: string }[] = [];
  for (let i = 0; i < 3 && out.length < max; i++) {
    for (const s of sources) {
      const m = s.slides[i];
      if (m && out.length < max) out.push({ ...m, handle: s.handle });
    }
  }
  return out;
}

export function ReferencesLabel({ labelId }: { labelId: string }) {
  const { t } = useTranslation();
  const donnees = useQuery({ queryKey: ["bible", "sources"], queryFn: lireSources, staleTime: 5 * 60_000 });
  const cartes = useQuery({ queryKey: ["bible", "cartes"], queryFn: lireCartes, staleTime: 5 * 60_000 });
  const sources = React.useMemo(() => sourcesDuLabel(donnees.data?.sources ?? [], labelId), [donnees.data, labelId]);
  const da = cartes.data?.find((c) => c.label_id === labelId)?.description_da ?? null;
  const miniatures = miniaturesDA(sources);

  if (donnees.isError) return <p className="text-xs text-destructive">{(donnees.error as Error).message}</p>;
  if (donnees.isPending) return <p className="text-xs text-muted-foreground">{t("common.loading")}</p>;

  return (
    <div className="space-y-3" data-testid="references-label">
      <div className="space-y-1.5" data-testid="apercu-da">
        {da && <p className="max-w-3xl text-xs text-muted-foreground">{da}</p>}
        {miniatures.length > 0 ? (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {miniatures.map((m, i) => {
              const image = <img src={m.url} alt={t("labelsPage.daMiniature", { handle: m.handle })} loading="lazy" className="size-full object-cover" />;
              const classe = "block aspect-[9/16] w-14 shrink-0 overflow-hidden rounded-md bg-muted";
              return m.post ? (
                <a key={i} href={m.post} target="_blank" rel="noreferrer" className={classe}>{image}</a>
              ) : (
                <span key={i} className={classe}>{image}</span>
              );
            })}
          </div>
        ) : (
          !da && <p className="text-xs text-muted-foreground">{t("labelsPage.daAucune")}</p>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">{t("labelsPage.referencesTitre", { count: sources.length })}</p>
        {sources.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("labelsPage.referencesAucune")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {sources.map((s) => (
              <li key={s.id}>
                <a
                  href={`https://www.tiktok.com/@${s.handle}`}
                  target="_blank"
                  rel="noreferrer"
                  title={libelleEtape(s.etape)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs hover:border-foreground/40",
                    !s.actif && "opacity-60",
                  )}
                >
                  @{s.handle}
                  <span className="text-[10px] text-muted-foreground">{libelleEtape(s.etape)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
