import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signInWithPassword } from "./api";
import { AuthLayout } from "./AuthLayout";
import { definirMotDePasse, jetonDeRecherche, type LienLu, lireLien } from "./setPassword";

/** L'aide quand il n'y a pas de lien valable (aussi sous le bouton de la page de connexion). */
export function AideSetPassword() {
  const { t } = useTranslation();
  return <p className="text-sm text-muted-foreground">{t("auth.setPassword.aide")}</p>;
}

/**
 * 1/11 : /set-password?t=… : le lien personnel du welcome. La recrue choisit son
 * mot de passe et donne son email perso (Slack), puis elle est connectée.
 */
export function SetPasswordPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const jeton = React.useMemo(() => jetonDeRecherche(location.search), [location.search]);
  const [lien, setLien] = React.useState<LienLu | null>(null);
  const [chargement, setChargement] = React.useState(Boolean(jeton));
  const [emailPerso, setEmailPerso] = React.useState("");
  const [motDePasse, setMotDePasse] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [enCours, setEnCours] = React.useState(false);
  const [erreur, setErreur] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!jeton) return;
    let actif = true;
    lireLien(jeton)
      .then((l) => actif && setLien(l))
      .catch(() => actif && setLien({ statut: "inconnu", email: null, prenom: null }))
      .finally(() => actif && setChargement(false));
    return () => {
      actif = false;
    };
  }, [jeton]);

  async function soumettre(event: React.FormEvent) {
    event.preventDefault();
    setErreur(null);
    if (motDePasse !== confirmation) {
      setErreur(t("auth.mismatch"));
      return;
    }
    if (!jeton) return;
    setEnCours(true);
    const r = await definirMotDePasse(jeton, motDePasse, emailPerso);
    if (!r.email) {
      setEnCours(false);
      if (r.statut && r.statut !== "ok") setLien({ statut: r.statut, email: null, prenom: null });
      setErreur(r.erreur ?? t("auth.errorGeneric"));
      return;
    }
    const { error } = await signInWithPassword(r.email, motDePasse);
    setEnCours(false);
    if (error) {
      setErreur(t("auth.setPassword.connexionAPart"));
      return;
    }
    navigate("/", { replace: true });
  }

  if (chargement) {
    return (
      <AuthLayout title={t("auth.setPassword.titre")} description={t("auth.setPassword.lecture")}>
        <div className="h-16" />
      </AuthLayout>
    );
  }

  if (!jeton || !lien || lien.statut !== "ok") {
    const cle = !jeton || !lien ? "sansLien" : lien.statut === "utilise" ? "utilise" : lien.statut === "expire" ? "expire" : "inconnu";
    return (
      <AuthLayout title={t("auth.setPassword.titre")} description={t(`auth.setPassword.etat.${cle}`)}>
        <div className="space-y-4">
          <AideSetPassword />
          <Button type="button" variant="outline" className="w-full" onClick={() => navigate("/login")}>
            {t("auth.setPassword.versConnexion")}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("auth.setPassword.titre")}
      description={t("auth.setPassword.intro", { prenom: lien.prenom?.trim() || "there" })}
    >
      <form onSubmit={soumettre} className="space-y-4">
        <Field>
          <FieldLabel htmlFor="login">{t("auth.setPassword.login")}</FieldLabel>
          <Input id="login" value={lien.email ?? ""} readOnly autoComplete="username" />
          <p className="text-xs text-muted-foreground">{t("auth.setPassword.loginAide")}</p>
        </Field>
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
          {enCours ? t("common.saving") : t("auth.setPassword.valider")}
        </Button>
      </form>
    </AuthLayout>
  );
}
