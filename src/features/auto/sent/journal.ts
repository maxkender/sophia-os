import { useTranslation } from "react-i18next";

import type { EtatMessage, MessageEnvoye } from "./api";

/** Messages sent → journal (prompt 22, partie 6.1) : les filtres, sans rien lire en base. */
export const PERIODES = [7, 14, 30] as const;

export interface FiltresMessages {
  jours: number;
  /** La famille du type : « note » et « pause » regroupent leurs sous-types. */
  famille: string;
  canal: string;
  etat: EtatMessage | "";
  posteur: string;
}

export function familleType(type: string): string {
  return type.includes(":") ? type.split(":", 1)[0]! : type;
}

const sansAccents = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function filtrerMessages(messages: readonly MessageEnvoye[], f: Omit<FiltresMessages, "jours">): MessageEnvoye[] {
  const qui = sansAccents(f.posteur.trim());
  return messages.filter(
    (m) =>
      (!f.famille || familleType(m.type) === f.famille) &&
      (!f.canal || m.canal === f.canal) &&
      (!f.etat || m.etat === f.etat) &&
      (!qui || sansAccents(m.poster_nom ?? "").includes(qui)),
  );
}

/** Le libellé d'un type : l'étape, la note du tableau de bord ou l'action bloquée par la pause. */
export function useLibelleType() {
  const { t } = useTranslation();
  return (type: string) => {
    const [famille, suite] = type.includes(":") ? (type.split(":", 2) as [string, string]) : [type, ""];
    if (famille === "note") return t("autoOnglets.sent.types.note", { quoi: t(`autoOnglets.sent.notes.${suite}`, { defaultValue: suite }) });
    if (famille === "pause") return t("autoOnglets.sent.types.pause", { quoi: suite });
    return t(`autoOnglets.sent.types.${type}`, { defaultValue: t(`nudges.types.${type}`, { defaultValue: type }) });
  };
}
