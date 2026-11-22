import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";

import { enregistrerMonWhatsApp, lireBanniereWhatsApp, lireMonWhatsApp, type MonWhatsApp, numeroInternational } from "./api";

/** La phrase de la case à cocher (décochée par défaut) : le consentement WhatsApp. */
export const PHRASE_ACCORD_WHATSAPP = "I agree to receive WhatsApp messages about my onboarding and posting";

const CLE_PLUS_TARD = "whatsapp-banniere-plus-tard";

function plusTardLu(): boolean {
  try {
    return window.sessionStorage.getItem(CLE_PLUS_TARD) === "1";
  } catch {
    return false;
  }
}

/**
 * 0839 : la bannière WhatsApp du dashboard posteur (numéro au format international + case d'accord décochée), qui
 * appelle whatsapp_mon_numero. Rien n'apparaît tant que le réglage whatsapp_banniere est éteint (par défaut), ni pour
 * l'admin qui traverse l'espace, ni pour le posteur qui a déjà donné son accord.
 */
export function BanniereWhatsApp() {
  const { roleReel } = useAuth();
  const reglage = useQuery({ queryKey: ["whatsapp-banniere"], queryFn: lireBanniereWhatsApp, staleTime: 5 * 60_000, enabled: roleReel === "poster" });
  if (roleReel !== "poster" || reglage.data !== true) return null;
  return <Banniere />;
}

function Banniere() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["whatsapp-mon-numero"], queryFn: lireMonWhatsApp, staleTime: 5 * 60_000 });
  const [numero, setNumero] = React.useState("");
  const [accord, setAccord] = React.useState(false);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  const [merci, setMerci] = React.useState(false);
  const [plusTard, setPlusTard] = React.useState(plusTardLu);

  if (q.isLoading || q.error || plusTard) return null;
  const d = q.data;
  const dejaAccord = !!d?.whatsapp_e164 && !!d.whatsapp_optin_at && !d.whatsapp_optout_at;
  if (dejaAccord && !merci) return null;

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    const e164 = numeroInternational(numero);
    if (!e164) {
      setErreur("Please enter your number in international format, e.g. +33612345678.");
      return;
    }
    if (!accord) return;
    setOccupe(true);
    setErreur(null);
    try {
      const r = await enregistrerMonWhatsApp(e164, true);
      setMerci(true);
      qc.setQueryData<MonWhatsApp | null>(["whatsapp-mon-numero"], r);
    } catch (err) {
      setErreur(err instanceof Error && /invalide|invalid/i.test(err.message)
        ? "Please enter your number in international format, e.g. +33612345678."
        : "Something went wrong. Please try again.");
    } finally {
      setOccupe(false);
    }
  };

  const fermer = () => {
    try {
      window.sessionStorage.setItem(CLE_PLUS_TARD, "1");
    } catch {
      // stockage indisponible : la bannière se ferme pour cette page seulement
    }
    setPlusTard(true);
  };

  return (
    <div data-testid="banniere-whatsapp" className="mb-4 space-y-3 rounded-xl border border-emerald-500/40 bg-emerald-500/8 p-4 text-sm leading-relaxed">
      <p className="font-semibold">Get your reminders on WhatsApp</p>
      {merci ? (
        <p role="status" className="text-emerald-700 dark:text-emerald-400">Saved. Thank you!</p>
      ) : (
        <>
          <p className="text-muted-foreground">Add your WhatsApp number to receive short reminders about your onboarding and your posts.</p>
          <form className="space-y-2" onSubmit={(e) => void enregistrer(e)} noValidate>
            <Input
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              className="h-9 w-72 max-w-full"
              placeholder="+33612345678"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              aria-label="WhatsApp number (international format)"
            />
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={accord} onChange={(e) => setAccord(e.target.checked)} data-testid="accord-whatsapp" />
              <span>{PHRASE_ACCORD_WHATSAPP}</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={occupe || !accord || !numero.trim()}>Save</Button>
              <Button type="button" size="sm" variant="ghost" onClick={fermer}>Not now</Button>
            </div>
          </form>
          {erreur ? <p role="alert" className="text-destructive">{erreur}</p> : null}
        </>
      )}
    </div>
  );
}
