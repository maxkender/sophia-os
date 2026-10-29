import * as React from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";
import { KILL_H_MIN } from "@/features/nudges/api";
import { lireReglagesBruts } from "@/features/reglagesOs/api";
import { Pied } from "@/features/reglagesOs/CartesReglages";
import { useReglages } from "@/features/reglagesOs/useReglages";

import { CLES_TIMING, erreursTiming, lireTiming, valeursTiming, type Timing } from "./timing";

type Champ = Exclude<keyof Timing, "double_heure">;

const SECTIONS: readonly { cle: string; champs: readonly Champ[] }[] = [
  { cle: "etapes", champs: ["connexion_message_h", "tiktok_message_h", "warmup_lance_message_h", "warmup_bien_fait_jour", "warmup_bien_fait_heure"] },
  { cle: "kill", champs: ["kill_h", "kill_annulation_h"] },
  { cle: "fenetre", champs: ["fenetre_debut", "fenetre_fin"] },
  { cle: "semaine", champs: ["lundi_heure", "lundi_soir_heure", "jeudi_heure", "semaine_fin"] },
  { cle: "double", champs: ["double_jour_iso"] },
  { cle: "upwork", champs: ["relances_upwork_max"] },
];

/** Les champs qui se choisissent par jour (ISO) plutôt qu'en nombre. */
const JOURS: Partial<Record<Champ, readonly number[]>> = {
  warmup_bien_fait_jour: [4, 5, 6, 7],
  double_jour_iso: [1, 2, 3, 4, 5, 6, 7],
};

/**
 * Messages sent → Timing (prompt 22, partie 6.4) : les délais des étapes, le
 * Kill 48 h (24 h au moins, vérifié aussi en base, 0413), l'annulation 12 h,
 * la fenêtre d'envoi, l'heure du lundi, du lundi soir et du jeudi, et la fin
 * de l'offre Double. Admin seulement ; le Head of Ops les lit.
 */
export function TimingMessages() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const { lu, enregistrer } = useReglages(CLES_TIMING);
  const [b, setB] = React.useState<Timing | null>(null);
  React.useEffect(() => {
    if (lu.data) setB(lireTiming(lu.data));
  }, [lu.data]);
  if (lu.error) return <p className="text-sm text-destructive">{(lu.error as Error).message}</p>;
  if (!b) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  const erreurs = erreursTiming(b);
  const champ = (k: Champ) => {
    const libelle = t(`autoOnglets.timing.champs.${k}`);
    const jours = JOURS[k];
    return (
      <label key={k} className="block space-y-1 text-sm">
        <span className="block text-xs text-muted-foreground">{libelle}</span>
        {jours ? (
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={b[k]}
            disabled={!admin}
            aria-label={libelle}
            onChange={(e) => setB({ ...b, [k]: Number(e.target.value) })}
          >
            {jours.map((j) => (
              <option key={j} value={j}>
                {t(`reglagesOs.jours.${j}`)}
              </option>
            ))}
          </select>
        ) : (
          <Input
            type="number"
            min={k === "kill_h" ? KILL_H_MIN : 0}
            value={String(b[k])}
            disabled={!admin}
            aria-label={libelle}
            onChange={(e) => setB({ ...b, [k]: Number(e.target.value) })}
          />
        )}
      </label>
    );
  };
  return (
    <Card data-testid="timing-messages">
      <CardHeader>
        <CardTitle>{t("autoOnglets.timing.titre")}</CardTitle>
        <CardDescription>{t("autoOnglets.timing.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {SECTIONS.map((s) => (
          <section key={s.cle} className="space-y-2">
            <h3 className="text-sm font-semibold">{t(`autoOnglets.timing.sections.${s.cle}`)}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {s.champs.map(champ)}
              {s.cle === "double" && (
                <label className="block space-y-1 text-sm">
                  <span className="block text-xs text-muted-foreground">{t("autoOnglets.timing.champs.double_heure")}</span>
                  <Input
                    type="time"
                    value={b.double_heure}
                    disabled={!admin}
                    aria-label={t("autoOnglets.timing.champs.double_heure")}
                    onChange={(e) => setB({ ...b, double_heure: e.target.value })}
                  />
                </label>
              )}
            </div>
          </section>
        ))}
        {erreurs.map((e) => (
          <p key={e} className="text-xs text-destructive" data-erreur-timing={e}>
            {t(`autoOnglets.timing.erreurs.${e}`, { n: KILL_H_MIN })}
          </p>
        ))}
        <Pied
          admin={admin}
          enregistrer={enregistrer}
          cles={CLES_TIMING}
          desactive={erreurs.length > 0}
          onSave={async () => {
            // Relu juste avant : les autres champs de ces réglages restent tels quels.
            const frais = await lireReglagesBruts(CLES_TIMING);
            enregistrer.mutate(valeursTiming(b, frais));
          }}
        />
      </CardContent>
    </Card>
  );
}
