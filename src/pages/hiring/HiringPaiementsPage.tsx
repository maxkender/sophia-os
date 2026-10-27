import * as React from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/features/auth/AuthContext";
import { BonusAVenir } from "@/features/bonus/BonusAVenir";
import { SectionBonus } from "@/features/bonus/SectionBonus";
import { ChoixHm } from "@/features/ckd/vueHm/ChoixHm";
import { semaineIso } from "@/features/moteur/cohortes";
import { dollars, totaux } from "@/features/paie/logique";
import { SectionPaieHm } from "@/features/paie/SectionPaieHm";
import { usePaieHm } from "@/features/paie/usePaieHm";

/**
 * Paiements de la vue HM : la paie du lundi et les bonus, sortis de la page
 * cohorte (27/10). Réservée au Head of Ops pour l'instant (route et menu) :
 * les HM n'en ont pas encore l'usage.
 */
export function HiringPaiementsPage() {
  const { t, i18n } = useTranslation();
  const { user, role } = useAuth();
  // Le Head of Ops choisit la HM des bonus à venir.
  const [hm, setHm] = React.useState("");
  const { semaine, paie } = usePaieHm(user?.id);
  const aFaire = totaux(paie.data ?? []);
  const langue = i18n.resolvedLanguage ?? "fr";

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold tracking-tight">{t("accueilHm.paiementsTitre")}</h1>
      {role === "head_of_ops" && <ChoixHm valeur={hm} onChange={setHm} />}

      {aFaire.aPayer > 0 && (
        <p className="rounded-md border border-warning/40 bg-warning/8 px-3 py-2 text-sm font-medium">
          {t("accueilHm.paieAFaire", {
            semaine: semaineIso(semaine),
            n: aFaire.aPayer,
            montant: dollars(aFaire.resteAPayer, langue),
          })}
        </p>
      )}

      <SectionPaieHm hmId={user?.id} />

      <BonusAVenir hm={hm} />

      {/* Les bonus se paient ici pour le Head of Ops (Lucia), comme dans Admin → Paie. */}
      {role === "head_of_ops" && <SectionBonus />}
    </div>
  );
}
