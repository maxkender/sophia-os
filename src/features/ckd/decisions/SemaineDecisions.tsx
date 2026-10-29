import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, CircleDot, Clock } from "lucide-react";

import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import { lireSemaine, type SemaineDecisions as Semaine } from "./api";
import { etatMoment, lundiAffiche, MOMENTS, type EtatMoment, type Moment } from "./logique";

const STYLE: Record<EtatMoment, string> = {
  fait: "border-success/40 bg-success/5",
  a_toi: "border-warning bg-warning/10",
  a_venir: "border-border bg-card",
};

function Icone({ etat }: { etat: EtatMoment }) {
  if (etat === "fait") return <Check className="size-3.5" aria-hidden />;
  if (etat === "a_toi") return <CircleDot className="size-3.5" aria-hidden />;
  return <Clock className="size-3.5" aria-hidden />;
}

function nombres(m: Moment, s: Semaine): Record<string, number> {
  switch (m) {
    case "jeudi":
      return { n: s.jeudi.propositions, reste: s.jeudi.a_decider };
    case "samedi":
      return { n: s.samedi.propositions, reste: s.samedi.a_decider };
    case "lundi_fin":
      return { n: s.dimanche.prevus, faits: s.dimanche.faits };
    default:
      return { n: s.lundi.lignes, payees: s.lundi.payees };
  }
}

/**
 * La vraie semaine, en haut de la page Decisions (28 oct.) : jeudi 6 h
 * (Recréer, tu valides), samedi 6 h (Kill ou Double, avant 20 h), dimanche
 * 23 h 30 (arrêts), lundi (paie). Chaque moment : Done, Your turn ou
 * Upcoming, et ses nombres. Prompt 22, partie 5 : plus de « Wed 12:00 ».
 */
export function SemaineDecisions({ maintenant = new Date() }: { maintenant?: Date }) {
  const { t, i18n } = useTranslation();
  const lundi = lundiAffiche(aujourdhuiParis(maintenant));
  const semaine = useQuery({ queryKey: ["ckd", "semaine-decisions", lundi], queryFn: () => lireSemaine(lundi) });
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), { day: "numeric", month: "short", timeZone: "UTC" });
  if (semaine.error) return <p className="text-sm text-destructive">{(semaine.error as Error).message}</p>;
  if (!semaine.data) return null;
  const s = semaine.data;
  return (
    <section className="space-y-2" data-testid="semaine-decisions">
      <p className="text-sm text-muted-foreground">
        {t("decisions.semaine.titre", { date: fmt.format(new Date(`${lundi}T12:00:00Z`)) })}
      </p>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {MOMENTS.map((m) => {
          const etat = etatMoment(m, s, lundi, maintenant);
          return (
            <li key={m} className={cn("min-w-0 rounded-lg border px-3 py-2", STYLE[etat])} data-moment={m} data-etat={etat}>
              <p className="text-xs font-medium text-muted-foreground">{t(`decisions.semaine.${m}.quand`)}</p>
              <p className="text-sm font-medium">{t(`decisions.semaine.${m}.quoi`)}</p>
              <p className="text-xs">{t(`decisions.semaine.${m}.nombres`, nombres(m, s))}</p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium">
                <Icone etat={etat} />
                {t(`decisions.etats.${etat}`)}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
