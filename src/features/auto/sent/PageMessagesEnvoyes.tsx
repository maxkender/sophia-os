import { useTranslation } from "react-i18next";

import { Prevues, StatsRelances } from "@/features/nudges/PageNudges";
import { ReglagesRegles } from "@/features/regles/ReglagesRegles";

import { OngletsAuto, PanneauOnglet } from "../OngletsAuto";
import { useOnglet } from "../useOnglet";
import { ApercuMessages, MessagesEnAttente } from "./Attente";
import { JournalMessages } from "./JournalMessages";
import { TextesMessages } from "./TextesMessages";
import { TimingMessages } from "./TimingMessages";

const ONGLETS = ["journal", "prevus", "apercu", "textes", "timing"] as const;

/**
 * Messages sent (prompt 22, partie 6) : tout ce que l'OS envoie. Le journal
 * (avec les chiffres des étapes sur 7 jours), ce qui partirait au prochain
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
        ) : onglet === "prevus" ? (
          <>
            {/* 0432 : les messages qui attendent un « Send » (jamais de rattrapage d'un coup). */}
            <MessagesEnAttente />
            <Prevues />
          </>
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
