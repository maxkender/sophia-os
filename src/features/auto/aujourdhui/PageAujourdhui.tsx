import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useProblemes } from "@/features/auto/useProblemes";
import { lireProblemes } from "@/features/problemes/api";

import { lireAujourdhui } from "./api";
import { jourParis, lignesAujourdhui } from "./logique";

/**
 * 12/11 (OS clair) : « Aujourd'hui ». En haut, les alertes graves (s'il y en a) ; puis
 * 5 lignes au plus : ce que Max doit faire maintenant, chacune avec son bouton.
 */
export function PageAujourdhui() {
  const { t } = useTranslation();
  const chiffres = useQuery({ queryKey: ["os", "aujourdhui"], queryFn: lireAujourdhui, refetchInterval: 60_000 });
  const cartes = useQuery({ queryKey: ["problemes", "ouverts"], queryFn: () => lireProblemes("ouverts"), refetchInterval: 60_000 });
  const alertes = useProblemes(true).problemes.filter((p) => p.gravite === "grave");
  const liste = cartes.data ?? [];
  const lignes = lignesAujourdhui({
    pourMax: chiffres.data?.pour_max ?? 0,
    maintenant: liste.filter((p) => p.rituel === "maintenant").length,
    jeudi: liste.filter((p) => p.rituel === "jeudi").length,
    samedi: liste.filter((p) => p.rituel === "samedi").length,
    ruulAInviter: chiffres.data?.ruul_a_inviter ?? 0,
    contratsARelier: chiffres.data?.contrats_a_relier ?? 0,
    ruulImportHeures: chiffres.data ? chiffres.data.ruul_import_heures : undefined,
    jourSemaine: jourParis(),
  });
  const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const charge = !chiffres.isLoading && !cartes.isLoading;

  return (
    <div className="space-y-4" data-testid="page-aujourdhui">
      <p className="text-sm text-muted-foreground first-letter:uppercase">{date}</p>
      {alertes.map((a) => (
        <div key={a.cle} className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm dark:border-red-800 dark:bg-red-950/40" data-testid="alerte">
          ⚠️ {t(`auto.problemes.types.${a.type}.titre`, a.params)}
          {a.lien && <Link to={a.lien} className="ml-2 underline">Ouvrir</Link>}
        </div>
      ))}
      {(chiffres.error || cartes.error) && <p className="text-sm text-destructive">{((chiffres.error ?? cartes.error) as Error).message}</p>}
      {charge && lignes.length === 0 && (
        <Card><CardContent className="p-6 text-center text-lg" data-testid="rien">Rien à faire 👌</CardContent></Card>
      )}
      <div className="space-y-2">
        {lignes.map((l) => (
          <Card key={l.cle} data-testid="ligne-aujourdhui">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="text-2xl" aria-hidden>{l.icone}</span>
              <span className="min-w-0 flex-1 text-base font-medium">{l.texte}</span>
              <Link to={l.to} className={buttonVariants({ size: "sm" })}>{l.bouton}</Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
