import { useTranslation } from "react-i18next";
import { ExternalLink, Smartphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { drapeauLangue } from "@/features/moteur/langues";

import type { LigneBoitePost } from "./api";
import { formaterNombre, formaterVues } from "./format";

/**
 * Le post parent d'une ligne de la boîte, tel que posté (D37) : ses slides
 * dans l'ordre (image et texte posé, slide d'appli marquée), son passage de
 * référence et ses meilleurs passages. C'est ce que le podz lira avant de
 * décliner.
 */
export function PostParent({ ligne }: { ligne: LigneBoitePost }) {
  const { t, i18n } = useTranslation();
  const post = ligne.post;
  if (!post) return <p className="py-2 text-xs text-muted-foreground">{t("bleo.podz.aucunPost")}</p>;
  return (
    <div className="space-y-2 py-2" data-testid="post-parent">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          {t("bleo.podz.postTel", {
            langue: `${drapeauLangue(post.langue)} ${post.langue}`,
            vues: formaterVues(post.vues, i18n.language),
            r: formaterNombre(post.r, 2),
          })}
        </span>
        {post.url && (
          <a
            href={post.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-foreground hover:underline"
          >
            <ExternalLink className="size-3" aria-hidden />
            TikTok
          </a>
        )}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {post.slides.map((s) => (
          <figure key={s.position} className="w-32 shrink-0 space-y-1">
            <div className="relative aspect-[9/16] overflow-hidden rounded-md border bg-muted">
              {s.image ? (
                <img src={s.image} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center text-[10px] text-muted-foreground">—</span>
              )}
              <span className="absolute left-1 top-1 rounded bg-background/80 px-1 font-mono text-[10px]">
                {s.position}
              </span>
              {s.appli && (
                <Badge variant="info" size="sm" className="absolute right-1 top-1">
                  <Smartphone aria-hidden />
                  {t("bleo.podz.slideAppli")}
                </Badge>
              )}
            </div>
            <figcaption className="line-clamp-6 text-[11px] leading-snug" title={s.texte ?? undefined}>
              {s.texte ?? "—"}
            </figcaption>
          </figure>
        ))}
      </div>
      {ligne.passages.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>{t("bleo.podz.meilleursPassages")}</span>
          {ligne.passages.map((p, i) => (
            <span key={`${i}-${p.url ?? ""}`} className="inline-flex items-center gap-1">
              {drapeauLangue(p.langue)} {formaterVues(p.vues, i18n.language)} · r {formaterNombre(p.r, 2)}
              {p.url && (
                <a href={p.url} target="_blank" rel="noreferrer" aria-label="TikTok" className="hover:text-foreground">
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
