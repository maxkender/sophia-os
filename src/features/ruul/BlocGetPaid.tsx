/**
 * 21/11 (Max) : en haut du dashboard d'un posteur RUUL pas encore prêt, un bloc qu'on ne peut pas fermer, dans sa langue :
 * les 3 étapes du set-up Ruul, cochées toutes seules (synchro horaire de l'API Ruul), chacune avec son bouton vers Ruul,
 * la date limite, et « I have a problem with Ruul » (Help prérempli avec l'étape bloquée). Prêt : « ✅ You're all set »
 * 3 jours, puis plus rien. Jamais pour un posteur Upwork. 26/11 (Max) : tant que la première semaine n'est pas payable,
 * le titre dit « tu peux le faire plus tard, avant ta première paie » (comme la page Join).
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { monLienRuul } from "./api";
import { ETAPES_SETUP, type EtapeSetup, etapeBloquee, etatBloc, LIENS_RUUL, lireMonSetupRuul, lireTextesSetup, type MonSetupRuul, ruulPlusTard, TEXTES_SETUP_EN, type TextesSetup } from "./setup";

export function BlocGetPaid() {
  const q = useQuery({ queryKey: ["ruul-mon-setup"], queryFn: lireMonSetupRuul, refetchInterval: 10 * 60_000 });
  const etat = etatBloc(q.data);
  const textes = useQuery({ queryKey: ["ruul-setup-textes"], queryFn: lireTextesSetup, enabled: etat !== "rien", staleTime: Infinity });
  if (!q.data || etat === "rien") return null;
  return <VueGetPaid s={q.data} t={textes.data ?? TEXTES_SETUP_EN} />;
}

/** La vue seule (pour les tests et l'aperçu). */
export function VueGetPaid({ s, t, maintenant }: { s: MonSetupRuul; t: TextesSetup; maintenant?: number }) {
  const etat = etatBloc(s, maintenant);
  const ouvrir = useMutation({
    mutationFn: async (e: EtapeSetup) => {
      // Le lien d'onboarding personnel quand il existe (il mène à la bonne étape), sinon la page Ruul.
      if (s.lien_auto) {
        const r = await monLienRuul().catch(() => null);
        if (r?.url) return r.url;
      }
      return LIENS_RUUL[e];
    },
    onSuccess: (url) => window.open(url, "_blank", "noopener"),
  });
  if (etat === "pret") {
    return (
      <section className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm font-medium" data-testid="bloc-get-paid-pret">
        {t.pret}
      </section>
    );
  }
  const bloquee = etapeBloquee(s);
  return (
    <section className="space-y-3 rounded-xl border-2 border-violet-300 bg-violet-50/60 p-4 shadow-sm dark:border-violet-800 dark:bg-violet-950/30" data-testid="bloc-get-paid">
      {/* 26/11 (Max) : avant la première semaine payable, Ruul peut attendre (avant la première paie). */}
      <p className="font-semibold" data-testid="titre-get-paid">{ruulPlusTard(s.cohorte_lundi, maintenant) ? t.titre_plus_tard : t.titre}</p>
      <ul className="space-y-2">
        {ETAPES_SETUP.map((e) => {
          const fait = Boolean(s.etapes?.[e]);
          const texte = e === "inscrit" ? t.inscrit.replace("{email}", s.email ?? "your application email") : t[e];
          return (
            <li key={e} className="flex flex-wrap items-center gap-2 text-sm" data-testid={`etape-${e}`} data-fait={fait}>
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded border", fait ? "border-success bg-success text-white" : "border-muted-foreground/50 bg-background")}>
                {fait && <Check className="size-3.5" />}
              </span>
              <span className={cn("flex-1", fait && "text-muted-foreground line-through")}>{texte}</span>
              {!fait && (
                <Button size="sm" className="h-7" loading={ouvrir.isPending && ouvrir.variables === e} onClick={() => ouvrir.mutate(e)} data-testid={`ouvrir-${e}`}>
                  {t.ouvrir}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-sm font-medium">{t.limite}</p>
      <Link className="text-xs text-primary underline" to={`/createur/help?ruul=${bloquee ?? "inscrit"}`} data-testid="probleme-ruul">
        {t.probleme}
      </Link>
    </section>
  );
}
