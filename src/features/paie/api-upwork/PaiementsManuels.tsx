import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { lirePaiementsManuels, noterPaiementManuelFait, type PaiementManuel } from "./api";

const P = "paie.manuels";

function Ligne({ m }: { m: PaiementManuel }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fait = useMutation({
    mutationFn: () => noterPaiementManuelFait(m.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["paie", "manuels"] }),
  });
  return (
    <li className="space-y-1 p-3" data-paiement-manuel={m.id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{m.poster_nom ?? "—"}</span>
        <span className="tabular-nums font-semibold">{m.montant} $</span>
        {m.lien && (
          <a className="text-xs underline" href={m.lien} target="_blank" rel="noreferrer">
            {t(`${P}.contrat`, { contrat: m.contrat_id })}
          </a>
        )}
        {m.fait_at ? (
          <Badge variant="success">{t(`${P}.paye`, { nom: m.fait_par_nom ?? "?" })}</Badge>
        ) : (
          <Button
            size="xs"
            variant="outline"
            loading={fait.isPending}
            onClick={() => {
              if (window.confirm(t(`${P}.confirmer`, { nom: m.poster_nom ?? "", montant: m.montant }))) fait.mutate();
            }}
          >
            {t(`${P}.marquer`)}
          </Button>
        )}
      </div>
      <ul className="ml-4 list-disc text-xs">
        {m.lignes.map((l, i) => (
          <li key={i}>
            {l.libelle} : <span className="tabular-nums">{l.montant} $</span>
          </li>
        ))}
      </ul>
      {m.note && <p className="text-xs text-muted-foreground">{m.note}</p>}
      {fait.error && <p className="text-xs text-destructive">{(fait.error as Error).message}</p>}
    </li>
  );
}

/** 31/10 (0476) : « To pay by hand », en haut de la liste de paie du lundi. Rien n'est payé par l'OS. */
export function PaiementsManuels() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["paie", "manuels"], queryFn: lirePaiementsManuels });
  const liste = lu.data ?? [];
  if (!lu.isPending && liste.length === 0 && !lu.error) return null;
  const aFaire = liste.filter((m) => !m.fait_at);
  const total = aFaire.reduce((n, m) => n + Number(m.montant ?? 0), 0);
  return (
    <Card data-testid="paiements-manuels">
      <CardHeader>
        <CardTitle className="text-base">{t(`${P}.titre`, { n: aFaire.length, total: Math.round(total * 100) / 100 })}</CardTitle>
        <CardDescription>{t(`${P}.aide`)}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
        <ul className="divide-y rounded-md border">
          {liste.map((m) => (
            <Ligne key={m.id} m={m} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
