import * as React from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emailPersoValide } from "@/features/moteur/api";
import type { ValeursContactPoster } from "@/features/moteur/contactPoster";

/**
 * Liens Upwork (profil, contrat) et email perso d'un poster (0358) : à sa
 * création (admin et recruteur) et dans sa fiche. Tous facultatifs.
 */
export function ChampsContactPoster({
  valeurs,
  onChange,
  idPrefixe = "contact",
}: {
  valeurs: ValeursContactPoster;
  onChange: (valeurs: ValeursContactPoster) => void;
  idPrefixe?: string;
}) {
  const { t } = useTranslation();
  const maj = (cle: keyof ValeursContactPoster) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...valeurs, [cle]: e.target.value });
  const emailFaux = !emailPersoValide(valeurs.email_perso);
  return (
    <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefixe}-upwork`}>{t("posters.contact.upworkProfil")}</Label>
        <Input
          id={`${idPrefixe}-upwork`}
          value={valeurs.upwork_url}
          placeholder="https://www.upwork.com/freelancers/…"
          onChange={maj("upwork_url")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefixe}-contrat`}>{t("posters.contact.upworkContrat")}</Label>
        <Input
          id={`${idPrefixe}-contrat`}
          value={valeurs.upwork_contrat_url}
          placeholder="https://www.upwork.com/…"
          onChange={maj("upwork_contrat_url")}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefixe}-email`}>{t("posters.contact.emailPerso")}</Label>
        <Input
          id={`${idPrefixe}-email`}
          type="email"
          value={valeurs.email_perso}
          placeholder="name@gmail.com"
          aria-invalid={emailFaux || undefined}
          onChange={maj("email_perso")}
        />
        {emailFaux && <p className="text-xs text-destructive">{t("posters.contact.emailInvalide")}</p>}
      </div>
    </div>
  );
}
