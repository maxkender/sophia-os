import * as React from "react";
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";

import { quitterVueHm } from "./api";
import { resteVueHm, type VueHm } from "./session";

/** Bandeau fixe de la vue HM : qui, lecture seule, temps restant, « Quitter ». */
export function BandeauVueHm({ vue }: { vue: VueHm }) {
  const { t } = useTranslation();
  const [reste, setReste] = React.useState(() => resteVueHm(vue));
  const [sortie, setSortie] = React.useState(false);

  const quitter = React.useCallback(() => {
    setSortie(true);
    void quitterVueHm();
  }, []);

  React.useEffect(() => {
    const id = window.setInterval(() => setReste(resteVueHm(vue)), 15_000);
    return () => window.clearInterval(id);
  }, [vue]);

  // Au bout d'1 h la base refuse tout : on rend l'onglet à l'admin.
  React.useEffect(() => {
    if (reste <= 0 && !sortie) quitter();
  }, [reste, sortie, quitter]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-900 lg:px-8">
      <span className="flex items-center gap-2 font-medium">
        <Eye className="size-4" />
        {t("vueHm.bandeau", { prenom: vue.prenom })}
        <span className="font-normal text-sky-800">
          {t("vueHm.reste", { minutes: Math.max(0, Math.ceil(reste / 60_000)) })}
        </span>
      </span>
      <Button size="sm" variant="outline" disabled={sortie} onClick={quitter}>
        {t("vueHm.quitter")}
      </Button>
    </div>
  );
}
