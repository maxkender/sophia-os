import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRegles } from "@/features/regles/api";
import { RegleTexte } from "@/features/regles/CartesRegles";
import { cn } from "@/lib/utils";

import {
  CINQ_ETAPES,
  dimancheAvant,
  etatsCinqEtapes,
  premierPostLe,
  premiereSemaineFinie,
  type CleEtape,
  type EtatCinq,
} from "./cinqEtapes";
import { lireMaPremiereSemaine } from "./cinqEtapesApi";
import { formaterJour, partiesParis } from "./datesRuul";

function Pastille({ numero, etat }: { numero: number; etat: EtatCinq }) {
  return (
    <span
      className={cn(
        "relative flex size-6 shrink-0 items-center justify-center rounded-full font-semibold text-xs",
        etat === "fait" && "bg-success text-success-foreground",
        etat === "en_cours" && "bg-primary text-primary-foreground ring-4 ring-primary/20",
        (etat === "a_venir" || etat === "recommande") && "border bg-background text-muted-foreground",
      )}
    >
      {etat === "fait" ? <Check className="size-3.5" /> : numero}
    </span>
  );
}

/**
 * La première semaine en 5 étapes, sur l'accueil du posteur (chantier du
 * 28 oct., partie G) : Log in · Join Slack (recommandé) · TikTok @handle ·
 * Start warmup + 5 follows avant dimanche minuit · 1er post le lundi, avec la
 * règle du lien. Pas pour la cohorte Ruul (exclue), qui garde sa frise.
 * S'efface une fois la 1re semaine de posts finie.
 */
export function CinqEtapes({
  handle,
  warmupStartedAt,
  warmupEndsAt,
  maintenant = new Date(),
}: {
  handle: string | null;
  warmupStartedAt: string | null;
  warmupEndsAt: string | null;
  maintenant?: Date;
}) {
  const { t, i18n } = useTranslation();
  const { slack } = useRegles();
  const profil = useQuery({ queryKey: ["ma-premiere-semaine"], queryFn: lireMaPremiereSemaine });
  if (!profil.data) return null;
  const aujourdhui = partiesParis(maintenant).date;
  const premierPost = premierPostLe({
    warmupEndsAt,
    cohorteLundi: profil.data.cohorteLundi,
    maintenant,
    aujourdhui,
  });
  if (premiereSemaineFinie(premierPost, aujourdhui)) return null;
  const etats = etatsCinqEtapes({ slackLie: profil.data.slackLie, warmupStartedAt, premierPost, aujourdhui });
  const jour = (d: string) => formaterJour(d, i18n.language);
  const arobase = handle ? `@${handle.replace(/^@/, "")}` : null;

  const contenu: Record<CleEtape, { titre: string; detail?: React.ReactNode }> = {
    connexion: { titre: t("calendrier.cinq.connexion") },
    slack: {
      titre: t("calendrier.cinq.slack"),
      detail: (
        <>
          <p>{t("calendrier.cinq.slackDetail")}</p>
          {etats.slack !== "fait" && slack && (
            <Button asChild size="sm" variant="outline" className="mt-1 h-7">
              <a href={slack} target="_blank" rel="noreferrer">
                {t("calendrier.cinq.rejoindreSlack")}
              </a>
            </Button>
          )}
        </>
      ),
    },
    tiktok: {
      titre: arobase ? t("calendrier.cinq.tiktok", { handle: arobase }) : t("calendrier.cinq.tiktokSansHandle"),
      detail: <p>{t("calendrier.cinq.tiktokDetail")}</p>,
    },
    warmup: {
      titre: t("calendrier.cinq.warmup", { dimanche: jour(dimancheAvant(premierPost)) }),
      detail: <RegleTexte regle="warmup" className="mt-1 p-2 text-xs" />,
    },
    post: {
      titre: t("calendrier.cinq.post", { lundi: jour(premierPost) }),
      detail: <RegleTexte regle="lien" className="mt-1 p-2 text-xs" />,
    },
  };

  return (
    <section className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4" data-testid="cinq-etapes">
      <h2 className="font-semibold text-base tracking-tight">{t("calendrier.cinq.titre")}</h2>
      <ol>
        {CINQ_ETAPES.map((cle, i) => (
          <li key={cle} className="relative flex gap-3 pb-4 last:pb-0" data-etape={cle} data-etat={etats[cle]}>
            {i < CINQ_ETAPES.length - 1 && <span aria-hidden className="absolute top-7 bottom-0 left-3 w-px bg-border" />}
            <Pastille numero={i + 1} etat={etats[cle]} />
            <div className={cn("min-w-0 space-y-0.5 text-sm", etats[cle] === "fait" && "opacity-60")}>
              <p className="font-semibold leading-6">
                {contenu[cle].titre}
                {etats[cle] === "recommande" && (
                  <span className="ml-2 font-normal text-muted-foreground text-xs">{t("calendrier.cinq.recommande")}</span>
                )}
              </p>
              {etats[cle] !== "fait" && contenu[cle].detail && (
                <div className="text-muted-foreground text-xs leading-relaxed">{contenu[cle].detail}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
