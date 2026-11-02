import { AccueilAuto } from "@/features/accueil/AccueilAuto";
import { Arrets } from "@/features/cohortes/Arrets";
import { TableauParHm } from "@/features/cohortes/PageCohortes";
import { PageOnboarding } from "@/features/onboarding/PageOnboarding";

/**
 * Recruits (prompt 22, partie 4), devenue « Onboarding posters » (prompt 25
 * v4) : en haut « Contracts to link » (avec son compteur), puis une carte par
 * recrue (étapes, messages envoyés, prochaine relance ; Send a message,
 * Postpone, Stop) à la place des colonnes du Pipeline, les arrêts complets et
 * leurs actions à la main, et le tableau par HM.
 */
export function PageRecruits({ maintenant }: { maintenant?: Date } = {}) {
  // Les liens d'Overview vers #contrats ou #arrets : PageAuto y descend.
  return (
    <div className="space-y-6" data-testid="page-recruits">
      <div id="contrats" className="scroll-mt-4">
        <AccueilAuto />
      </div>

      <PageOnboarding />

      <div id="arrets" className="scroll-mt-4">
        <Arrets />
      </div>

      <TableauParHm maintenant={maintenant} />
    </div>
  );
}
