import { useTranslation } from "react-i18next";
import { CalendarCheck, MessageCircle } from "lucide-react";

import { LIEN_SLACK, SALON_COHORTE_RUUL } from "./contenu";
import {
  conseilWarmupRuul,
  formaterInstantParis,
  formaterJour,
  partiesParis,
  premierPaiementRuul,
} from "./datesRuul";

/**
 * Cohorte Ruul, carte du warm-up : ce que ses dates veulent dire, en clair
 * (« lancé jeudi, il se passe quoi ? »), à la place de l'aide générique.
 */
export function AideWarmupRuul({
  debutLe,
  warmupStartedAt,
  warmupEndsAt,
}: {
  debutLe: string;
  warmupStartedAt: string | null;
  warmupEndsAt: string | null;
}) {
  const { t, i18n } = useTranslation();
  const conseil = conseilWarmupRuul({ debutLe, warmupStartedAt, warmupEndsAt });
  const lundi = formaterJour(debutLe, i18n.language);
  const texte =
    conseil.cas === "a_lancer"
      ? t("calendrier.ruul.aLancer", { lundi })
      : conseil.cas === "a_lancer_dimanche"
      ? t("calendrier.ruul.aLancerDimanche", { lundi })
      : conseil.cas === "a_lancer_en_retard"
      ? t("calendrier.ruul.aLancerEnRetard", { lundi })
      : conseil.cas === "en_cours"
      ? t(conseil.finAuLundi ? "calendrier.ruul.enCoursLundi" : "calendrier.ruul.enCours", {
          fin: formaterInstantParis(conseil.fin, i18n.language),
        })
      : null;
  return texte ? <p className="text-xs text-foreground/80">{texte}</p> : null;
}

/**
 * Cohorte Ruul, toujours visible sur le calendrier : le premier paiement (le
 * dimanche qui clôt la première semaine de posts) et le lien Slack.
 */
export function BandeauCohorteRuul({ debutLe }: { debutLe: string }) {
  const { t, i18n } = useTranslation();
  const dimanche = premierPaiementRuul(debutLe);
  const passe = partiesParis(new Date()).date > dimanche;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm">
        <CalendarCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          {passe
            ? t("calendrier.ruul.paiementHebdo")
            : t("calendrier.ruul.premierPaiement", {
                dimanche: formaterJour(dimanche, i18n.language),
                lundi: formaterJour(debutLe, i18n.language),
              })}
        </span>
      </p>
      <p className="flex shrink-0 items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("calendrier.ruul.question")}</span>
        <a
          href={LIEN_SLACK}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-primary underline underline-offset-2"
        >
          <MessageCircle className="size-4" />
          {t("calendrier.ruul.rejoindreSlack", { salon: SALON_COHORTE_RUUL })}
        </a>
      </p>
    </div>
  );
}
