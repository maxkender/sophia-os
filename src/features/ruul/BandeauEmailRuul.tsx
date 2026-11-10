import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";

import { enregistrerMonEmailRuul, lireMonEmailRuul, type MonEmailRuul } from "./api";

/** Le temps pendant lequel « Enregistré » reste affiché avant que le bandeau disparaisse. */
export const DELAI_MERCI_MS = 2500;

/**
 * 10/11 : le bandeau du posteur Ruul qui n'a pas encore donné son email Ruul
 * (sans email, on ne peut pas le payer). En haut de l'espace posteur, jusqu'à
 * ce qu'il l'enregistre. Réservé au vrai posteur, comme `PopupMessagesPosteur` :
 * l'admin qui traverse l'espace ne voit rien.
 */
export function BandeauEmailRuul() {
  const { roleReel } = useAuth();
  if (roleReel !== "poster") return null;
  return <Bandeau />;
}

function Bandeau() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ruul-mon-email"], queryFn: lireMonEmailRuul, staleTime: 5 * 60_000 });
  const [email, setEmail] = React.useState("");
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  const [merci, setMerci] = React.useState(false);

  // Après « Enregistré », le bandeau disparaît : on met l'email dans le cache.
  React.useEffect(() => {
    if (!merci) return;
    const id = window.setTimeout(() => {
      qc.setQueryData<MonEmailRuul>(["ruul-mon-email"], (d) => ({ ruul: d?.ruul ?? true, email: email.trim() }));
      setMerci(false);
    }, DELAI_MERCI_MS);
    return () => window.clearTimeout(id);
  }, [merci, qc, email]);

  if (!q.data?.ruul || q.data.email) return null;

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    const valeur = email.trim();
    if (!valeur) return;
    setOccupe(true);
    setErreur(null);
    try {
      const r = await enregistrerMonEmailRuul(valeur);
      if (r.ok) setMerci(true);
      else setErreur(r.erreur || t("emailRuul.erreur"));
    } catch {
      setErreur(t("emailRuul.erreur"));
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div
      data-testid="bandeau-email-ruul"
      className="mb-4 space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/8 p-4 text-sm leading-relaxed"
    >
      <p className="font-semibold">{t("emailRuul.titre")}</p>
      {merci ? (
        <p role="status" className="text-emerald-700 dark:text-emerald-400">{t("emailRuul.enregistre")}</p>
      ) : (
        <>
          <p className="text-muted-foreground">{t("emailRuul.intro")}</p>
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => void enregistrer(e)} noValidate>
            <Input
              type="email"
              autoComplete="email"
              className="h-9 w-72 max-w-full"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label={t("emailRuul.libelle")}
            />
            <Button type="submit" size="sm" disabled={occupe || !email.trim()}>
              {t("emailRuul.enregistrer")}
            </Button>
          </form>
          {erreur ? <p role="alert" className="text-destructive">{erreur}</p> : null}
        </>
      )}
    </div>
  );
}
