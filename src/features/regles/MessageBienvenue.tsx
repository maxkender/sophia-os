import * as React from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GUIDE_NOTION_POSTER } from "@/features/documents/BoutonGuideNotion";
import { LIEN_SLACK } from "@/features/onboarding/contenu";

import { useRegles } from "./api";
import { remplirBienvenue } from "./textes";

/**
 * « Welcome message » (prompt 15, point 7) : après la création d'un poster,
 * le message à lui envoyer, en anglais, avec un bouton Copier. Le modèle est
 * un réglage (message_bienvenue_texte) ; le lien Slack vient du réglage
 * slack_lien_invitation, sinon de l'invitation par défaut.
 */
export function MessageBienvenue({ prenom, email, password }: { prenom: string; email: string; password: string }) {
  const { t } = useTranslation();
  const { textes, slack } = useRegles();
  const [copie, setCopie] = React.useState(false);
  const texte = remplirBienvenue(textes.bienvenue, {
    prenom: prenom || "there",
    email,
    password,
    url: window.location.origin,
    slack: slack ?? LIEN_SLACK,
    guide: GUIDE_NOTION_POSTER,
    regle_lien: textes.lien,
    regle_warmup: textes.warmup,
  });
  return (
    <div className="space-y-2 pt-2" data-testid="message-bienvenue">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{t("posters.bienvenue.titre")}</p>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => {
            void navigator.clipboard?.writeText(texte);
            setCopie(true);
          }}
        >
          {copie ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copie ? t("posters.bienvenue.copie") : t("posters.bienvenue.copier")}
        </Button>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-xs">{texte}</pre>
    </div>
  );
}
