import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { StatGroup, StatTile } from "@/components/ui/stat";

import { listerExemplesNatifs, listerRelecteurs } from "./api";
import { CLE_REQUETE_EXEMPLES, SEUIL_BANQUE } from "./SectionExemplesNatifs";
import { CLE_REQUETE_RELECTEURS } from "./SectionRelecteurs";

/** Les chiffres clés de la relecture native, en tête de la page admin. */
export function ChiffresRelecture() {
  const { t } = useTranslation();
  const relecteurs = useQuery({ queryKey: CLE_REQUETE_RELECTEURS, queryFn: listerRelecteurs });
  const exemples = useQuery({ queryKey: CLE_REQUETE_EXEMPLES, queryFn: listerExemplesNatifs });

  const tous = (relecteurs.data ?? []).filter((r) => r.statut === "invite" || r.statut === "actif");
  const actifs = tous.filter((r) => r.statut === "actif").length;
  const languesRelues = new Set(tous.map((r) => r.langue)).size;
  const prets = (exemples.data ?? []).filter((e) => e.statut === "pret");
  const parLangue = new Map<string, number>();
  for (const e of prets) parLangue.set(e.langue, (parLangue.get(e.langue) ?? 0) + 1);
  const languesBanque = [...parLangue.values()].filter((n) => n >= SEUIL_BANQUE).length;
  const vide = (pending: boolean, n: number) => (pending ? "—" : n);

  return (
    <StatGroup>
      <StatTile
        label={t("relectureNative.chiffres.relecteurs")}
        value={vide(relecteurs.isPending, tous.length)}
        detail={t("relectureNative.chiffres.relecteursDetail", { actifs, invites: tous.length - actifs })}
      />
      <StatTile
        label={t("relectureNative.chiffres.languesRelues")}
        value={vide(relecteurs.isPending, languesRelues)}
        detail={t("relectureNative.chiffres.languesReluesDetail")}
      />
      <StatTile
        label={t("relectureNative.chiffres.exemples")}
        value={vide(exemples.isPending, prets.length)}
        detail={t("relectureNative.chiffres.exemplesDetail", { n: parLangue.size })}
      />
      <StatTile
        label={t("relectureNative.chiffres.banques")}
        value={vide(exemples.isPending, languesBanque)}
        detail={t("relectureNative.chiffres.banquesDetail", { n: SEUIL_BANQUE })}
      />
    </StatGroup>
  );
}
