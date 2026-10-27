import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { StatGroup, StatTile } from "@/components/ui/stat";

import { listerEcrituresKit, listerKit, listerRelecteurs } from "./api";
import { postsDuKit } from "./kit";
import { CLE_REQUETE_ECRITURES_KIT, CLE_REQUETE_KIT } from "./SectionKitAdmin";
import { CLE_REQUETE_RELECTEURS } from "./SectionRelecteurs";

/** Les chiffres clés de la relecture native, en tête de la page admin. */
export function ChiffresRelecture() {
  const { t } = useTranslation();
  const relecteurs = useQuery({ queryKey: CLE_REQUETE_RELECTEURS, queryFn: listerRelecteurs });
  const kit = useQuery({ queryKey: CLE_REQUETE_KIT, queryFn: listerKit });
  const ecritures = useQuery({ queryKey: CLE_REQUETE_ECRITURES_KIT, queryFn: () => listerEcrituresKit() });

  const tous = (relecteurs.data ?? []).filter((r) => r.statut === "invite" || r.statut === "actif");
  const actifs = tous.filter((r) => r.statut === "actif").length;
  const questionnaires = tous.filter((r) => r.questionnaire_termine_at).length;
  const posts = postsDuKit(kit.data ?? []);
  const slides = posts.reduce((n, p) => n + p.slides_en.length, 0);
  const ids = new Set(posts.map((p) => p.id));
  const rendus = (ecritures.data ?? []).filter((e) => e.rendu_at && ids.has(e.kit_id)).length;
  const attendus = questionnaires * posts.length;
  const vide = (n: number) => (relecteurs.isPending ? "—" : n);

  return (
    <StatGroup>
      <StatTile
        label={t("relectureNative.chiffres.relecteurs")}
        value={vide(tous.length)}
        detail={t("relectureNative.chiffres.relecteursDetail", { actifs, invites: tous.length - actifs })}
      />
      <StatTile
        label={t("relectureNative.chiffres.questionnaires")}
        value={vide(questionnaires)}
        unit={`/ ${tous.length}`}
        detail={t("relectureNative.chiffres.questionnairesDetail")}
      />
      <StatTile
        label={t("relectureNative.chiffres.kit")}
        value={kit.isPending ? "—" : posts.length}
        detail={t("relectureNative.chiffres.kitDetail", { n: slides })}
      />
      <StatTile
        label={t("relectureNative.chiffres.rendus")}
        value={ecritures.isPending ? "—" : rendus}
        unit={attendus > 0 ? `/ ${attendus}` : undefined}
        detail={t("relectureNative.chiffres.rendusDetail")}
      />
    </StatGroup>
  );
}
