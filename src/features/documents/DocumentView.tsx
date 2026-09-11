import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { richTextClass } from "@/components/ui/RichTextEditor";
import { posterGuideCle } from "@/features/documents/posterGuide";
import { lireDocument } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

/** Le contenu vient d'un éditeur riche interne (admin), il peut donc contenir du
 *  HTML de mise en forme ; sinon (ancien texte simple) on préserve les sauts. */
function estHtml(contenu: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(contenu);
}

/**
 * Affiche un document (guide, FAQ) en lecture seule pour un manager ou un poster.
 * Le contenu est du texte simple : on préserve les sauts de ligne. L'admin l'édite
 * depuis la page Documents.
 */
export function DocumentView({ cle }: { cle: string }) {
  const { t, i18n } = useTranslation();
  const doc = useQuery({
    queryKey: ["document", cle],
    queryFn: async () => {
      if (cle !== "guide_poster") return lireDocument(cle);
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return lireDocument("guide_poster");
      const [{ data: profile }, { data: comptes }] = await Promise.all([
        supabase
          .from("profiles")
          .select("created_at, nationalite, langues")
          .eq("id", userId)
          .maybeSingle(),
        supabase.from("comptes").select("langue").eq("poster_id", userId),
      ]);
      const resolved = posterGuideCle({
        profileCreatedAt: profile?.created_at ?? null,
        nationalite: profile?.nationalite,
        langues: (profile?.langues as string[] | null) ?? null,
        compteLangues: (comptes ?? []).map((c) => c.langue as string | null),
      });
      return lireDocument(resolved);
    },
  });

  if (doc.isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!doc.data) {
    return <p className="text-sm text-muted-foreground">{t("common.empty")}</p>;
  }

  // Le document suit la langue de l'interface : anglais si l'UI est en anglais
  // ET que la version anglaise existe, sinon français (version par défaut).
  const enAnglais = i18n.resolvedLanguage === "en";
  const titre = enAnglais && doc.data.titre_en ? doc.data.titre_en : doc.data.titre;
  const contenu = enAnglais && doc.data.contenu_en ? doc.data.contenu_en : doc.data.contenu;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{titre}</CardTitle>
      </CardHeader>
      <CardContent>
        {estHtml(contenu) ? (
          <div
            className={richTextClass}
            // Contenu rédigé par l'admin via l'éditeur interne (pas d'entrée tierce).
            dangerouslySetInnerHTML={{ __html: contenu }}
          />
        ) : (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{contenu}</div>
        )}
      </CardContent>
    </Card>
  );
}
