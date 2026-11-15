import * as React from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

import type { MessageCarte, SansReponse } from "./api";

const P = "problemes.messages";

/** 0532 : le dernier message sans réponse et les 15 derniers messages (Upwork, Slack), avec le canal et l'auteur. */
export function MessagesCarte({ messages, sansReponse }: { messages: MessageCarte[] | null | undefined; sansReponse: SansReponse | null | undefined }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = React.useState(false);
  const liste = messages ?? [];
  if (!liste.length && !sansReponse) return null;
  const quand = (iso: string) => new Date(iso).toLocaleString(localeDate(), { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="space-y-1 text-xs" data-testid="messages-carte">
      {sansReponse && (
        <p className={cn(sansReponse.question ? "font-medium text-red-600" : "text-muted-foreground")} data-testid="sans-reponse">
          {t(`${P}.sansReponse`, { canal: t(`${P}.canaux.${sansReponse.canal}`), heures: sansReponse.depuis_heures })} « {sansReponse.texte.slice(0, 200)} »
        </p>
      )}
      {liste.length > 0 && (
        <button type="button" className="text-[11px] text-primary underline" onClick={() => setOuvert(!ouvert)}>
          {t(ouvert ? `${P}.masquer` : `${P}.voir`, { count: liste.length })}
        </button>
      )}
      {ouvert && (
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2" data-testid="liste-messages">
          {liste.map((m, i) => (
            <li key={i} className={cn(m.auteur === "posteur" ? "" : "pl-4 text-muted-foreground")}>
              <span className="font-medium">{t(`${P}.auteurs.${m.auteur}`)}</span>
              <span className="text-muted-foreground"> · {t(`${P}.canaux.${m.canal}`)} · {quand(m.at)}</span>
              <p className="whitespace-pre-wrap">{m.texte}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
