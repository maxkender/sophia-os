import * as React from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contratUpworkValide, emailPersoValide } from "@/features/moteur/api";
import type { ValeursContactPoster } from "@/features/moteur/contactPoster";

/**
 * Liens Upwork (profil, contrat) et email perso d'un poster (0358) : à sa
 * création (admin et recruteur) et dans sa fiche. À la création, le contrat
 * et l'email perso sont obligatoires (prompt 15, point 7).
 */
export function ChampsContactPoster({
  valeurs,
  onChange,
  idPrefixe = "contact",
  obligatoires = false,
}: {
  valeurs: ValeursContactPoster;
  onChange: (valeurs: ValeursContactPoster) => void;
  idPrefixe?: string;
  /** Prompt 15, point 7 : à la création, le lien du contrat et l'email perso sont obligatoires. */
  obligatoires?: boolean;
}) {
  const { t } = useTranslation();
  const maj = (cle: keyof ValeursContactPoster) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...valeurs, [cle]: e.target.value });
  const emailFaux = !emailPersoValide(valeurs.email_perso);
  const contratFaux = !contratUpworkValide(valeurs.upwork_contrat_url);
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
        <Label htmlFor={`${idPrefixe}-contrat`}>
          {t("posters.contact.upworkContrat")}
          {obligatoires && " *"}
        </Label>
        <Input
          id={`${idPrefixe}-contrat`}
          value={valeurs.upwork_contrat_url}
          placeholder="https://www.upwork.com/nx/wm/workroom/…"
          required={obligatoires}
          aria-invalid={contratFaux || undefined}
          onChange={maj("upwork_contrat_url")}
        />
        {contratFaux && <p className="text-xs text-destructive">{t("posters.contact.contratInvalide")}</p>}
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefixe}-email`}>
          {t("posters.contact.emailPerso")}
          {obligatoires && " *"}
        </Label>
        <Input
          id={`${idPrefixe}-email`}
          type="email"
          required={obligatoires}
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
