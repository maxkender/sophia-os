import { useTranslation } from "react-i18next";

import { useApplication } from "@/features/moteur/ApplicationContext";
import { clePromptPertinence, estSlugSophia, nomApplication } from "@/features/moteur/applications";
import { PromptCommentMasterCard } from "@/features/commentMasters/PromptCommentMasterCard";

import { EditeurPrompt } from "./EditeurPrompt";

/**
 * Les prompts qui ne sont ni la traduction d'une langue ni le placement :
 * la pertinence de l'application du sélecteur, l'identité UGC, les consignes
 * de rédaction par type de post, le commentaire des comment masters.
 */
const PROMPTS_COMMUNS = [
  { cle: "ugc_face_swap", titre: "prompts.ugcFaceSwapTitle", desc: "prompts.ugcFaceSwapDesc" },
  { cle: "composition_recycle", titre: "prompts.recycleTitle", desc: "prompts.recycleDesc" },
  { cle: "composition_nouveau", titre: "prompts.nouveauTitle", desc: "prompts.nouveauDesc" },
  { cle: "composition_remanie", titre: "prompts.remanieTitle", desc: "prompts.remanieDesc" },
] as const;

export function SectionAutresPrompts() {
  const { t } = useTranslation();
  const { slug, application } = useApplication();
  const nom = application ? nomApplication(application) : nomApplication({ slug });
  const sophia = estSlugSophia(slug);
  return (
    <div className="space-y-6" data-testid="section-autres">
      <div>
        <h2 className="text-sm font-semibold">{t("prompts.sectionApplication", { nom })}</h2>
        <p className="text-xs text-muted-foreground">{t("prompts.application", { nom })}</p>
        {!sophia && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t("prompts.sansRepli", { nom })}</p>}
      </div>
      <EditeurPrompt
        key={clePromptPertinence(slug)}
        cle={clePromptPertinence(slug)}
        titre={t("prompts.pertinenceTitleApp", { nom })}
        desc={t("prompts.pertinenceDescApp", { nom })}
      />
      <div className="pt-2">
        <h2 className="text-sm font-semibold">{t("prompts.communsTitre")}</h2>
        <p className="text-xs text-muted-foreground">{t("prompts.communsDesc")}</p>
      </div>
      {PROMPTS_COMMUNS.map((p) => (
        <EditeurPrompt key={p.cle} cle={p.cle} titre={t(p.titre)} desc={t(p.desc)} />
      ))}
      <div className="pt-2">
        <h2 className="text-sm font-semibold">{t("prompts.commentMaster.section")}</h2>
        <p className="text-xs text-muted-foreground">{t("prompts.commentMaster.sectionDesc")}</p>
      </div>
      <PromptCommentMasterCard />
    </div>
  );
}
