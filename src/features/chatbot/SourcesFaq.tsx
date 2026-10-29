import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

import { listerGuidesCopies, recopierGuides, type PageGuideCopiee } from "./api";
import { CLE_FAQ } from "./faqDonnees";

/** Les deux guides Notion recopiés (guides-notion) : leur page racine. */
const GUIDES: readonly { guide: PageGuideCopiee["guide"]; url: string }[] = [
  { guide: "poster", url: "https://app.notion.com/p/3f4241308d6681f8ad41dc507f2c8505" },
  { guide: "manager", url: "https://app.notion.com/p/3f4241308d66818c84f3c3eb514f140c" },
];

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * FAQ bot → Sources (prompt 22, partie 9) : les pages Notion recopiées, la
 * date de la dernière copie, « Recopier maintenant » et un lien vers chaque
 * guide. Le bloc était replié dans les réglages du bot (Assistant). La copie
 * tourne aussi toute seule, toutes les heures (cron guides-notion).
 */
export function SourcesFaq() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const guides = useQuery({ queryKey: [...CLE_FAQ, "guides"], queryFn: listerGuidesCopies });
  const recopier = useMutation({
    mutationFn: () => recopierGuides(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CLE_FAQ, "guides"] }),
  });
  const pages = guides.data ?? [];
  const derniere = (liste: readonly PageGuideCopiee[]) =>
    liste.reduce<string | null>((max, p) => (!max || p.copie_at > max ? p.copie_at : max), null);
  const date = (iso: string) => new Date(iso).toLocaleString(localeDate(i18n.language));
  const bilan = recopier.data;
  const erreursCopie = [
    ...(bilan?.guides ?? []).flatMap((g) => g.erreurs),
    ...(bilan && !bilan.ok && bilan.error ? [bilan.error] : []),
  ];
  const tout = derniere(pages);
  return (
    <div className="space-y-4" data-testid="faq-sources">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {pages.length && tout ? t("chatbot.faq.guidePages", { n: pages.length, date: date(tout) }) : t("chatbot.faq.guideVide")}
        </p>
        <Button size="sm" variant="outline" disabled={recopier.isPending} onClick={() => recopier.mutate()}>
          <RefreshCw className={cn(recopier.isPending && "animate-spin")} />
          {recopier.isPending ? t("chatbot.faq.recopieEnCours") : t("chatbot.faq.recopier")}
        </Button>
      </div>
      {bilan?.guides && !erreursCopie.length && (
        <p className="text-xs text-success">
          {t("chatbot.faq.recopieOk", {
            recopiees: bilan.guides.reduce((n, g) => n + g.recopiees, 0),
            inchangees: bilan.guides.reduce((n, g) => n + g.inchangees, 0),
          })}
        </p>
      )}
      {erreursCopie.map((e) => (
        <p key={e} role="alert" className="text-xs text-destructive">
          {e}
        </p>
      ))}
      {(guides.error || recopier.error) && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(guides.error ?? recopier.error)}
        </p>
      )}
      {guides.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {GUIDES.map((g) => {
          const duGuide = pages.filter((p) => p.guide === g.guide);
          const le = derniere(duGuide);
          return (
            <section key={g.guide} className="space-y-2 rounded-lg border p-3" data-guide={g.guide}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t(`autoOnglets.faq.guides.${g.guide}`)}</h3>
                <a href={g.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  {t("autoOnglets.faq.ouvrirGuide")}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </div>
              <p className="text-xs text-muted-foreground">
                {le ? t("autoOnglets.faq.copie", { n: duGuide.length, date: date(le) }) : t("chatbot.faq.guideVide")}
              </p>
              {duGuide.length > 0 && (
                <ul className="max-h-80 space-y-0.5 overflow-y-auto text-xs">
                  {duGuide.map((p) => (
                    <li key={p.page_id} className="flex items-baseline justify-between gap-2">
                      <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 truncate underline-offset-2 hover:underline">
                        {p.chemin}
                      </a>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{date(p.copie_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
