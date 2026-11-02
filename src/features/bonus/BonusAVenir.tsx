import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Gift } from "lucide-react";

import { nomsHms } from "@/features/paie/api";
import { dollars } from "@/features/paie/logique";
import { localeDate } from "@/locales/localeDate";

import { lireBonusAVenir } from "./api";
import { grouperAVenir } from "./logique";

/**
 * « Bonus à venir » sur le dashboard HM (0374) : qui, combien, quand, pour
 * qu'elle puisse le dire au posteur. Elle ne paie rien. `hm` : la HM choisie
 * par l'admin ou le Head of Ops ("" = toutes) ; une HM ne reçoit que les siens.
 * Rien à afficher : rien n'apparaît.
 */
export function BonusAVenir({ hm = "" }: { hm?: string }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const donnees = useQuery({
    queryKey: ["accueil-hm", "bonus-a-venir"],
    queryFn: async () => {
      const lignes = await lireBonusAVenir();
      return { lignes, noms: await nomsHms([...new Set(lignes.map((l) => l.poster_id))]) };
    },
  });
  const groupes = grouperAVenir((donnees.data?.lignes ?? []).filter((l) => !hm || l.hm_id === hm));
  if (groupes.length === 0) return null;
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(localeDate(langue), { day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(`${d}T12:00:00Z`),
    );
  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-4" data-testid="bonus-a-venir">
      <p className="flex items-center gap-2 font-medium">
        <Gift className="size-4 text-primary" aria-hidden />
        {t("bonus.aVenir.titre")}
      </p>
      <p className="text-xs text-muted-foreground">{t("bonus.aVenir.desc")}</p>
      <div className="mt-2 space-y-2">
        {groupes.map((g) => (
          <div key={g.lundi}>
            <p className="text-sm font-medium">
              {t("bonus.aVenir.lundi", { date: fmt(g.lundi) })} · {dollars(g.total, langue)}
            </p>
            <ul className="space-y-0.5 text-sm">
              {g.lignes.map((l, i) => (
                <li key={`${l.poster_id}-${l.type}-${i}`}>
                  {t("bonus.aVenir.ligne", {
                    nom: donnees.data?.noms.get(l.poster_id) ?? "—",
                    type: t(`bonus.types.${l.type}`),
                    montant: dollars(l.montant, langue),
                  })}
                  <span className="text-muted-foreground"> — {l.detail}</span>
                  {l.etat === "apercu" && (
                    <span className="ml-1 text-xs text-muted-foreground">({t("bonus.aVenir.estimation")})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
