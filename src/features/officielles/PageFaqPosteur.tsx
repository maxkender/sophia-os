import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { BoutonGuideNotion, GUIDE_NOTION_POSTER } from "@/features/documents/BoutonGuideNotion";

import { lireReponsesOfficielles, reponsesVisibles } from "./api";

/** Les liens taap.it écrits sans https:// deviennent cliquables. */
function avecLiens(texte: string) {
  return texte.split(/(\btaap\.it\/[\w.-]+)/g).map((morceau, i) =>
    /^taap\.it\//.test(morceau)
      ? <a key={i} href={`https://${morceau}`} target="_blank" rel="noopener noreferrer" className="underline">{morceau}</a>
      : morceau);
}

/** 6/11 : « FAQ » du posteur : les réponses officielles validées par Max, puis le guide. */
export function PageFaqPosteur() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["officielles", "posteur"], queryFn: lireReponsesOfficielles });
  const liste = reponsesVisibles(lu.data ?? []);
  return (
    <div className="space-y-4" data-testid="page-faq-posteur">
      <PageHeader title={t("officielles.faq.titre")} description={t("officielles.faq.description")} />
      {lu.isLoading && <p className="text-sm text-muted-foreground">{t("officielles.chargement")}</p>}
      {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
      <div className="space-y-2">
        {liste.map((r) => (
          <Card key={r.id} data-testid="faq-reponse">
            <CardContent className="space-y-1 p-4 text-sm">
              <p className="font-medium">{r.question}</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{avecLiens(r.reponse)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <BoutonGuideNotion url={GUIDE_NOTION_POSTER} titre={t("documents.voirRegles")} sousTitre={t("documents.guideNotionPoster")} />
    </div>
  );
}
