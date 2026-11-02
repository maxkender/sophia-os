import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { type Conversation, urlContrat, urlRoom } from "./conversation";

/** « Open Upwork conversation ↗ · Contract ↗ », ou « No conversation yet » / « No Upwork contract ». */
export function LienConversation({ c, className }: { c: Conversation | undefined; className?: string }) {
  const { t } = useTranslation();
  if (!c) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 text-xs", className)} data-testid="lien-conversation">
      {c.room_id ? (
        <a className="inline-flex items-center gap-0.5 font-medium text-primary underline" href={urlRoom(c.room_id)} target="_blank" rel="noreferrer">
          {t("conversation.ouvrir")}
          <ExternalLink className="size-3" />
        </a>
      ) : (
        <span className="text-muted-foreground">{t(c.contrat_id ? "conversation.pasEncore" : "conversation.sansContrat")}</span>
      )}
      {c.contrat_id && (
        <a className="inline-flex items-center gap-0.5 underline" href={urlContrat(c.contrat_id)} target="_blank" rel="noreferrer">
          {t("conversation.contrat", { contrat: c.contrat_id })}
          <ExternalLink className="size-3" />
        </a>
      )}
    </span>
  );
}
