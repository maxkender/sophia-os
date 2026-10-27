import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { enregistrerReglagesMessages, lireReglagesMessages, type ReglagesMessages as TReglages } from "./api";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Les messages du samedi aux posteurs (v3, 0382), modifiables par l'admin :
 * message de Kill automatique (oui / non, texte), texte de l'offre Double et
 * son heure limite. Textes en anglais ; `{prenom}` devient le prénom.
 */
export function ReglagesMessages() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["reglages", "messages-posteurs"], queryFn: lireReglagesMessages });
  const [r, setR] = React.useState<TReglages | null>(null);
  React.useEffect(() => {
    if (lu.data) setR(lu.data);
  }, [lu.data]);
  const enregistrer = useMutation({
    mutationFn: () => enregistrerReglagesMessages(r!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reglages", "messages-posteurs"] }),
  });
  const jours = [1, 2, 3, 4, 5, 6, 7];
  const nomJour = (iso: number) =>
    new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, 1 + iso)));

  return (
    <Card data-testid="reglages-messages-posteurs">
      <CardHeader>
        <CardTitle>{t("messagesPosteurs.reglages.titre")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("messagesPosteurs.reglages.aide")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
        {r && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={r.kill_message_auto}
                onChange={(e) => setR({ ...r, kill_message_auto: e.target.checked })}
              />
              {t("messagesPosteurs.reglages.killAuto")}
            </label>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="kill-texte">
                {t("messagesPosteurs.reglages.killTexte")}
              </label>
              <Textarea
                id="kill-texte"
                value={r.kill_message_texte}
                onChange={(e) => setR({ ...r, kill_message_texte: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="double-texte">
                {t("messagesPosteurs.reglages.doubleTexte")}
              </label>
              <Textarea
                id="double-texte"
                value={r.double_popup_texte}
                onChange={(e) => setR({ ...r, double_popup_texte: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>{t("messagesPosteurs.reglages.expire")}</span>
              <select
                className={selectClass}
                aria-label={t("messagesPosteurs.reglages.expireJour")}
                value={r.double_popup_expire.jour_iso}
                onChange={(e) =>
                  setR({ ...r, double_popup_expire: { ...r.double_popup_expire, jour_iso: Number(e.target.value) } })}
              >
                {jours.map((j) => (
                  <option key={j} value={j}>
                    {nomJour(j)}
                  </option>
                ))}
              </select>
              <Input
                type="time"
                className="w-28"
                aria-label={t("messagesPosteurs.reglages.expireHeure")}
                value={r.double_popup_expire.heure}
                onChange={(e) => setR({ ...r, double_popup_expire: { ...r.double_popup_expire, heure: e.target.value } })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                disabled={enregistrer.isPending || !r.kill_message_texte.trim() || !r.double_popup_texte.trim()}
                onClick={() => enregistrer.mutate()}
              >
                {t("messagesPosteurs.reglages.enregistrer")}
              </Button>
              {enregistrer.isSuccess && <span className="text-sm text-muted-foreground">{t("messagesPosteurs.reglages.ok")}</span>}
              {enregistrer.error && <span className="text-sm text-destructive">{(enregistrer.error as Error).message}</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
