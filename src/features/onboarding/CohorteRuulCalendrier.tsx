import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, MessageCircle, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";

import { LIEN_SLACK, SALON_COHORTE_RUUL } from "./contenu";
import {
  ajouterJours,
  formaterInstantParis,
  finPremiereSemaineRuul,
  formaterJour,
  friseRuul,
  premierPaiementRuul,
  type EtatEtape,
} from "./datesRuul";

function Etape({
  numero,
  etat,
  titre,
  quand,
  detail,
  derniere = false,
}: {
  numero: number;
  etat: EtatEtape;
  titre: string;
  quand: string;
  detail?: string;
  derniere?: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!derniere && <span aria-hidden className="absolute top-7 bottom-0 left-3 w-px bg-border" />}
      <span
        className={cn(
          "relative flex size-6 shrink-0 items-center justify-center rounded-full font-semibold text-xs",
          etat === "fait" && "bg-success text-success-foreground",
          etat === "en_cours" && "bg-primary text-primary-foreground ring-4 ring-primary/20",
          etat === "a_venir" && "border bg-background text-muted-foreground",
        )}
      >
        {etat === "fait" ? <Check className="size-3.5" /> : numero}
      </span>
      <div className={cn("min-w-0 space-y-0.5", etat === "fait" && "opacity-60")}>
        <p className="font-semibold text-sm leading-6">{titre}</p>
        <p className={cn("text-sm", etat === "en_cours" ? "font-medium text-primary" : "text-foreground/80")}>{quand}</p>
        {detail && <p className="text-muted-foreground text-xs leading-relaxed">{detail}</p>}
      </div>
    </li>
  );
}

/**
 * Cohorte Ruul : la première semaine en quatre étapes datées, du clic sur
 * « Start warmup » au premier paiement (le lundi qui suit la première semaine
 * de posts). Disparaît une fois ce paiement passé.
 */
export function FriseCohorteRuul({
  debutLe,
  warmupStartedAt,
  warmupEndsAt,
}: {
  debutLe: string;
  warmupStartedAt: string | null;
  warmupEndsAt: string | null;
}) {
  const { t, i18n } = useTranslation();
  const frise = friseRuul({ debutLe, warmupStartedAt, warmupEndsAt });
  if (frise.terminee) return null;
  const { conseil, etats } = frise;
  const jour = (d: string) => formaterJour(d, i18n.language);
  const lundi = jour(debutLe);
  const dimanche = jour(finPremiereSemaineRuul(debutLe));
  const paiement = jour(premierPaiementRuul(debutLe));

  const quandLancer =
    etats.lancer === "fait"
      ? t("calendrier.ruul.frise.lancerFait")
      : conseil.cas === "a_lancer_dimanche"
      ? t("calendrier.ruul.frise.lancerDimanche")
      : conseil.cas === "a_lancer_en_retard"
      ? t("calendrier.ruul.frise.lancerRetard", { lundi })
      : t("calendrier.ruul.frise.lancerQuand", { samedi: jour(ajouterJours(debutLe, -2)) });

  const finAuLundi = conseil.cas === "a_lancer" || (conseil.cas === "en_cours" && conseil.finAuLundi);
  const quandWarmup =
    conseil.cas === "en_cours"
      ? t("calendrier.ruul.frise.warmupJusqua", { fin: formaterInstantParis(conseil.fin, i18n.language) })
      : conseil.cas === "a_lancer"
      ? t("calendrier.ruul.frise.warmupJusqua", { fin: t("calendrier.ruul.frise.lundiMinuit", { lundi }) })
      : conseil.cas === "termine"
      ? t("calendrier.ruul.frise.warmupFini")
      : t("calendrier.ruul.frise.warmup24h");

  const quandPosts =
    conseil.cas === "termine"
      ? t("calendrier.ruul.frise.postsEnCours")
      : finAuLundi
      ? t("calendrier.ruul.frise.postsLundi", { lundi })
      : conseil.cas === "a_lancer_dimanche"
      ? t("calendrier.ruul.frise.postsMardi")
      : t("calendrier.ruul.frise.postsLendemain");

  return (
    <section className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <h2 className="font-semibold text-base tracking-tight">{t("calendrier.ruul.frise.titre")}</h2>
      <ol>
        <Etape numero={1} etat={etats.lancer} titre={t("calendrier.ruul.frise.lancer")} quand={quandLancer} />
        <Etape
          numero={2}
          etat={etats.warmup}
          titre={t("calendrier.ruul.frise.warmup")}
          quand={quandWarmup}
          detail={t("calendrier.ruul.frise.warmupDetail")}
        />
        <Etape
          numero={3}
          etat={etats.posts}
          titre={t("calendrier.ruul.frise.posts")}
          quand={quandPosts}
          detail={t("calendrier.ruul.frise.postsDetail")}
        />
        <Etape
          numero={4}
          etat={etats.paiement}
          titre={t("calendrier.ruul.frise.paiement")}
          quand={paiement}
          detail={t("calendrier.ruul.frise.paiementDetail", { lundi, dimanche })}
          derniere
        />
      </ol>
    </section>
  );
}

/** Cohorte Ruul, toujours visible : une question → Slack ; la paie → la page Payments. */
export function BandeauCohorteRuul() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-2">
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
      <Link
        to="/createur/paiements"
        className="inline-flex items-center gap-1.5 font-medium text-primary underline underline-offset-2"
      >
        <Wallet className="size-4" />
        {t("calendrier.ruul.voirPaiements")}
      </Link>
    </div>
  );
}
