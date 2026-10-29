import { useTranslation } from "react-i18next";

import { Prevues, StatsRelances } from "@/features/nudges/PageNudges";
import { ReglagesRegles } from "@/features/regles/ReglagesRegles";
import { EnvoisMain } from "@/features/envoisMain/EnvoisMain";

import { OngletsAuto, PanneauOnglet } from "../OngletsAuto";
import { useOnglet } from "../useOnglet";
import { ApercuMessages } from "./Attente";
import { JournalMessages } from "./JournalMessages";
import { TextesMessages } from "./TextesMessages";
import { TimingMessages } from "./TimingMessages";

const ONGLETS = ["journal", "main", "prevus", "apercu", "textes", "timing"] as const;

/**
 * Messages sent (prompt 22, partie 6) : tout ce que l'OS envoie. Le journal
 * (avec les chiffres des étapes sur 7 jours, la raison de chaque message ;
 * prompt 25 MAJ : plus de To approve, tout part automatiquement), ce qui partirait au prochain
 * passage (Planned), tous les textes (Texts) et les délais (Timing). Remplace
 * Follow-ups ; le mode des relances est dans Overview → Switches.
 */
export function PageMessagesEnvoyes() {
  const { t } = useTranslation();
  const [onglet, choisir] = useOnglet(ONGLETS, "journal");
  return (
    <div className="space-y-6" data-testid="page-messages-envoyes">
      <OngletsAuto
        id="sent"
        libelle={t("autoOnglets.sent.ongletsAria")}
        onglets={ONGLETS.map((o) => ({ cle: o, titre: t(`autoOnglets.sent.onglets.${o}`) }))}
        actif={onglet}
        onChange={choisir}
      />
      <PanneauOnglet id="sent" actif={onglet}>
        {onglet === "journal" ? (
          <>
            <StatsRelances />
            <JournalMessages />
          </>
        ) : onglet === "main" ? (
          // Prompt 25 v4 : Upwork plein, les messages que les HM envoient à la main.
          <EnvoisMain avecHm toujours />
        ) : onglet === "prevus" ? (
          <Prevues />
        ) : onglet === "apercu" ? (
          <ApercuMessages />
        ) : onglet === "textes" ? (
          <>
            <TextesMessages />
            {/* Les règles dites aux posteurs sur leur tableau de bord (lien le jour même, warm-up, bienvenue). */}
            <ReglagesRegles />
          </>
        ) : (
          <TimingMessages />
        )}
      </PanneauOnglet>
    </div>
  );
}
