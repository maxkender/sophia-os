import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { lireNudges, lireRelancesPrevues } from "@/features/nudges/api";
import { localeDate } from "@/locales/localeDate";

import { lundiDeLaSemaine } from "./logique";

/** Le nudge du jeudi (prompt 21, C7) : jeudi_texte aux posteurs, jeudi_texte_recrue aux recrues pas prêtes. */
const estJeudi = (type: string) => type === "jeudi" || type.startsWith("jeudi_");

interface LigneJeudi {
  cle: string;
  poster_id: string;
  nom: string | null;
  type: string;
  etat: "envoye" | "erreur" | "prevu" | "bloque";
  canal: string | null;
  quand: string;
  texte: string | null;
  detail: string | null;
}

/**
 * Weekly decisions → Thursday (prompt 22, partie 5) : la liste du nudge du
 * jeudi de la semaine, ce qui est parti (nudges) et ce qui partirait au
 * prochain passage (relances prévues, en test ou hors fenêtre). Ce nudge ne
 * lance aucun compte à rebours de Kill.
 */
export function JeudiNudge({ maintenant = new Date() }: { maintenant?: Date }) {
  const { t, i18n } = useTranslation();
  const lundi = lundiDeLaSemaine(aujourdhuiParis(maintenant));
  const envoyes = useQuery({ queryKey: ["nudges", "liste", lundi], queryFn: () => lireNudges(lundi) });
  const prevues = useQuery({ queryKey: ["nudges", "prevues"], queryFn: lireRelancesPrevues });
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
  });
  const lignes: LigneJeudi[] = [
    ...(envoyes.data ?? []).filter((n) => estJeudi(n.type)).map((n): LigneJeudi => ({
      cle: `n-${n.id}`,
      poster_id: n.poster_id,
      nom: n.poster_nom,
      type: n.type,
      etat: n.slack_erreur ? "erreur" : "envoye",
      canal: n.canal,
      quand: n.envoye_at,
      texte: n.texte,
      detail: n.slack_erreur,
    })),
    ...(prevues.data ?? []).filter((p) => estJeudi(p.type) && p.periode >= lundi).map((p): LigneJeudi => ({
      cle: `p-${p.poster_id}-${p.type}-${p.periode}`,
      poster_id: p.poster_id,
      nom: p.poster_nom,
      type: p.type,
      etat: p.statut === "prevu" ? "prevu" : "bloque",
      canal: p.canal,
      quand: p.maj_at,
      texte: p.texte,
      detail: p.raison ? t(`nudges.prevues.raisons.${p.raison}`, { defaultValue: p.raison }) : null,
    })),
  ];
  const VARIANTE = { envoye: "success", erreur: "error", prevu: "info", bloque: "warning" } as const;
  const erreur = envoyes.error ?? prevues.error;
  return (
    <Card data-testid="jeudi-nudge">
      <CardHeader>
        <CardTitle>{t("autoOnglets.decisions.jeudi.titre")}</CardTitle>
        <CardDescription>{t("autoOnglets.decisions.jeudi.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {erreur && <p className="text-sm text-destructive">{(erreur as Error).message}</p>}
        {envoyes.data && prevues.data && lignes.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("autoOnglets.decisions.jeudi.vide")}</p>
        )}
        {lignes.length > 0 && (
          <ul className="divide-y rounded-xl border">
            {lignes.map((l) => (
              <li key={l.cle} className="space-y-1 p-3 text-sm" data-jeudi={l.etat}>
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{l.nom ?? "—"}</span>
                  <Badge variant="secondary">
                    {t(`autoOnglets.decisions.jeudi.types.${l.type}`, { defaultValue: l.type })}
                  </Badge>
                  <Badge variant={VARIANTE[l.etat]}>{t(`autoOnglets.decisions.jeudi.etats.${l.etat}`)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {[l.canal ? t(`nudges.canaux.${l.canal}`, { defaultValue: l.canal }) : null, fmt.format(new Date(l.quand))]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </p>
                {l.detail && <p className="text-xs text-muted-foreground">{l.detail}</p>}
                {l.texte && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">{t("autoOnglets.decisions.jeudi.voirTexte")}</summary>
                    <p className="mt-1 whitespace-pre-line rounded-md bg-muted/40 p-2">{l.texte}</p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
