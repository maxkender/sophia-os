import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";
import { BoutonSendUpwork } from "@/features/pipeline/BoutonSendUpwork";
import { localeDate } from "@/locales/localeDate";

import { ETATS_MESSAGE, lireMessagesEnvoyes, type EtatMessage, type MessageEnvoye } from "./api";
import { familleType, filtrerMessages, PERIODES, useLibelleType, type FiltresMessages } from "./journal";

const VARIANTE: Record<EtatMessage, "success" | "info" | "warning" | "error" | "secondary"> = {
  envoye: "success",
  simule: "info",
  pause: "warning",
  bloque: "secondary",
  erreur: "error",
};

const selectClass = "h-9 rounded-md border bg-background px-2 text-sm";

/**
 * Messages sent → journal (prompt 22, partie 6.1) : TOUS les messages
 * envoyés, avec la date, le posteur, le type, le canal (Upwork, Slack,
 * tableau de bord), l'état (envoyé, simulé en test, bloqué par la pause, en
 * erreur) et la réaction du posteur. Filtres par type, canal, état, posteur.
 */
export function JournalMessages() {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const [f, setF] = React.useState<FiltresMessages>({ jours: 14, famille: "", canal: "", etat: "", posteur: "" });
  const depuis = React.useMemo(() => new Date(Date.now() - f.jours * 86_400_000).toISOString().slice(0, 13), [f.jours]);
  const lu = useQuery({ queryKey: ["messages-envoyes", depuis], queryFn: () => lireMessagesEnvoyes(`${depuis}:00:00Z`) });
  const libelleType = useLibelleType();
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
  });
  const tous = lu.data ?? [];
  const familles = [...new Set(tous.map((m) => familleType(m.type)))].sort();
  const canaux = [...new Set(tous.map((m) => m.canal))].sort();
  const lignes = filtrerMessages(tous, f);
  return (
    <Card data-testid="journal-messages">
      <CardHeader>
        <CardTitle>{t("autoOnglets.sent.journal.titre")}</CardTitle>
        <CardDescription>{t("autoOnglets.sent.journal.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select className={selectClass} aria-label={t("autoOnglets.sent.journal.periode")} value={f.jours}
            onChange={(e) => setF({ ...f, jours: Number(e.target.value) })}>
            {PERIODES.map((j) => (
              <option key={j} value={j}>{t("autoOnglets.sent.journal.jours", { n: j })}</option>
            ))}
          </select>
          <select className={selectClass} aria-label={t("autoOnglets.sent.journal.type")} value={f.famille}
            onChange={(e) => setF({ ...f, famille: e.target.value })}>
            <option value="">{t("autoOnglets.sent.journal.tousTypes")}</option>
            {familles.map((x) => (
              <option key={x} value={x}>{libelleType(x === "note" || x === "pause" ? `${x}:…` : x)}</option>
            ))}
          </select>
          <select className={selectClass} aria-label={t("autoOnglets.sent.journal.canal")} value={f.canal}
            onChange={(e) => setF({ ...f, canal: e.target.value })}>
            <option value="">{t("autoOnglets.sent.journal.tousCanaux")}</option>
            {canaux.map((c) => (
              <option key={c} value={c}>{t(`autoOnglets.sent.canaux.${c}`, { defaultValue: c })}</option>
            ))}
          </select>
          <select className={selectClass} aria-label={t("autoOnglets.sent.journal.etat")} value={f.etat}
            onChange={(e) => setF({ ...f, etat: e.target.value as EtatMessage | "" })}>
            <option value="">{t("autoOnglets.sent.journal.tousEtats")}</option>
            {ETATS_MESSAGE.map((x) => (
              <option key={x} value={x}>{t(`autoOnglets.sent.etats.${x}`)}</option>
            ))}
          </select>
          <Input className="h-9 w-48" placeholder={t("autoOnglets.sent.journal.posteur")} aria-label={t("autoOnglets.sent.journal.posteur")}
            value={f.posteur} onChange={(e) => setF({ ...f, posteur: e.target.value })} />
          <span className="text-xs text-muted-foreground" data-testid="journal-messages-total">
            {t("autoOnglets.sent.journal.total", { n: lignes.length })}
          </span>
        </div>
        {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
        {lu.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {lu.data && lignes.length === 0 && <p className="text-sm text-muted-foreground">{t("autoOnglets.sent.journal.vide")}</p>}
        {lignes.length > 0 && (
          <ul className="divide-y rounded-xl border">
            {lignes.map((m) => (
              <Ligne key={`${m.source}-${m.ref}-${m.canal}-${m.at}`} m={m} quand={fmt.format(new Date(m.at))} admin={role === "admin"}
                libelleType={libelleType} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Ligne({ m, quand, admin, libelleType }: { m: MessageEnvoye; quand: string; admin: boolean; libelleType: (t: string) => string }) {
  const { t } = useTranslation();
  return (
    <li className="space-y-1 p-3 text-sm" data-message={m.source} data-etat={m.etat}>
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="w-36 shrink-0 text-xs text-muted-foreground">{quand}</span>
        <span className="font-medium">{m.poster_nom ?? "—"}</span>
        <Badge variant="secondary">{libelleType(m.type)}</Badge>
        <span className="text-xs text-muted-foreground">{t(`autoOnglets.sent.canaux.${m.canal}`, { defaultValue: m.canal })}</span>
        <Badge variant={VARIANTE[m.etat]}>{t(`autoOnglets.sent.etats.${m.etat}`)}</Badge>
        {m.reaction && <Badge variant="info">{t(`autoOnglets.sent.reactions.${m.reaction}`, { defaultValue: m.reaction })}</Badge>}
      </p>
      {m.detail && <p className="text-xs text-muted-foreground">{m.detail}</p>}
      {m.texte && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">{t("autoOnglets.sent.journal.voirTexte")}</summary>
          <p className="mt-1 whitespace-pre-line rounded-md bg-muted/40 p-2">{m.texte}</p>
        </details>
      )}
      {/* Parti sur Slack ou en échec : le même texte sur Upwork, en un clic (admin). */}
      {admin && m.source === "nudges" && m.poster_id && m.texte && (m.canal !== "upwork" || m.etat === "erreur") && (
        <BoutonSendUpwork posterId={m.poster_id} nom={m.poster_nom} texte={m.texte} type={m.type} />
      )}
    </li>
  );
}
