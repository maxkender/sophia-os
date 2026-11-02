import * as React from "react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase/client";
import { AuthLayout } from "./AuthLayout";
import { useAuth } from "./AuthContext";

/**
 * Première connexion : le mot de passe vient de l'admin, le poster choisit le
 * sien. Le posteur donne aussi son email perso (chantier du 28 oct.) : c'est
 * celui de Slack, la liaison se fait toute seule avec (`slack_relier`).
 */
export function ChangePasswordPage() {
  const { t } = useTranslation();
  const { user, role, refresh } = useAuth();
  const posteur = role === "poster";
  const [emailPerso, setEmailPerso] = React.useState("");
  const [motDePasse, setMotDePasse] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [enCours, setEnCours] = React.useState(false);
  const [erreur, setErreur] = React.useState<string | null>(null);

  async function soumettre(event: React.FormEvent) {
    event.preventDefault();
    setErreur(null);

    if (motDePasse !== confirmation) {
      setErreur(t("auth.mismatch"));
      return;
    }

    setEnCours(true);
    const { error } = await supabase.auth.updateUser({ password: motDePasse });

    if (error) {
      setEnCours(false);
      setErreur(error.message);
      return;
    }

    const email = emailPerso.trim().toLowerCase();
    const { error: errProfil } = await supabase
      .from("profiles")
      .update(posteur && email ? { must_change_password: false, email_perso: email } : { must_change_password: false })
      .eq("id", user!.id);
    if (errProfil) {
      setEnCours(false);
      setErreur(errProfil.message);
      return;
    }

    setEnCours(false);
    refresh();
  }

  return (
    <AuthLayout title={t("auth.changeTitle")} description={t("auth.changeBody")}>
      <form onSubmit={soumettre} className="space-y-4">
        {posteur && (
          <Field>
            <FieldLabel htmlFor="email-perso">{t("auth.emailPerso")}</FieldLabel>
            <Input
              id="email-perso"
              type="email"
              required
              autoComplete="email"
              value={emailPerso}
              onChange={(e) => setEmailPerso(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("auth.emailPersoAide")}</p>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="mdp">{t("auth.newPassword")}</FieldLabel>
          <Input
            id="mdp"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="mdp2">{t("auth.confirmPassword")}</FieldLabel>
          <Input
            id="mdp2"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </Field>

        {erreur && (
          <Alert variant="error">
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" className="w-full" loading={enCours}>
          {enCours ? t("common.saving") : t("auth.save")}
        </Button>
      </form>
    </AuthLayout>
  );
}
