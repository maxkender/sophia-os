import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { confirmerSuggestion, lireLiaisonsAVerifier, lireSuggestions, verifierLiaison, type LiaisonContrat } from "./liaisonsApi";

const CLES = [["contrats-suggestions"], ["liaisons-a-verifier"]] as const;

function Regle({ l }: { l: LiaisonContrat }) {
  const { t } = useTranslation();
  const r = l.regle ?? 0;
  return (
    <Badge variant={r === 1 ? "secondary" : "warning"}>
      {t(`accueil.liaisons.regles.${r}`)}
      {l.partage ? ` · ${t("accueil.liaisons.partage")}` : ""}
    </Badge>
  );
}

/**
 * Prompt 21, A4 : plus aucune liaison contrat ↔ posteur « à peu près ». Les
 * ressemblances de nom sont des suggestions qu'une personne confirme ; les
 * liaisons faites automatiquement depuis le 28 oct. sont à vérifier (OK ou
 * Délier, confirmé).
 */
export function LiaisonsContrats() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const suggestions = useQuery({ queryKey: CLES[0], queryFn: lireSuggestions });
  const aVerifier = useQuery({ queryKey: CLES[1], queryFn: lireLiaisonsAVerifier });
  const rafraichir = () => {
    for (const k of CLES) void qc.invalidateQueries({ queryKey: k });
    void qc.invalidateQueries({ queryKey: ["accueils"] });
  };
  const confirmer = useMutation({
    mutationFn: (l: LiaisonContrat) => confirmerSuggestion(l.poster_id, l.contrat_id),
    onSuccess: rafraichir,
  });
  const verifier = useMutation({
    mutationFn: ({ l, delier }: { l: LiaisonContrat; delier: boolean }) => verifierLiaison(l.poster_id, delier),
    onSuccess: rafraichir,
  });
  const delier = (l: LiaisonContrat) => {
    if (window.confirm(t("accueil.liaisons.confirmerDelier", { nom: l.poster_nom ?? l.poster_id, contrat: l.contrat_id }))) {
      verifier.mutate({ l, delier: true });
    }
  };
  const lier = (l: LiaisonContrat) => {
    if (window.confirm(t("accueil.liaisons.confirmerLier", { nom: l.poster_nom ?? l.poster_id, freelancer: l.freelancer_nom ?? l.contrat_id }))) {
      confirmer.mutate(l);
    }
  };
  const erreur = (confirmer.error ?? verifier.error ?? suggestions.error ?? aVerifier.error) as Error | null;
  const s = suggestions.data ?? [];
  const v = aVerifier.data ?? [];
  return (
    <div className="space-y-3" data-testid="liaisons-contrats">
      {erreur && <p className="text-sm text-destructive">{erreur.message}</p>}
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("accueil.liaisons.suggestions", { n: s.length })}</p>
        <p className="text-xs text-muted-foreground">{t("accueil.liaisons.suggestionsAide")}</p>
        {s.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {s.map((l) => (
              <li key={`${l.poster_id}-${l.contrat_id}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm" data-suggestion={l.poster_id}>
                <span className="font-medium">{l.poster_nom ?? "—"}</span>
                <span className="text-muted-foreground">→ {l.freelancer_nom ?? l.contrat_id}</span>
                <Regle l={l} />
                <Button size="sm" variant="outline" className="ml-auto h-8" disabled={confirmer.isPending} onClick={() => lier(l)}>
                  {t("accueil.liaisons.lier")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <details className="group rounded-lg border" open={v.some((l) => (l.regle ?? 0) !== 1)}>
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium">
          {t("accueil.liaisons.aVerifier", { n: v.length })}
        </summary>
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t("accueil.liaisons.aVerifierAide")}</p>
        <ul className="divide-y border-t">
          {v.map((l) => (
            <li key={l.poster_id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm" data-a-verifier={l.poster_id}>
              <span className="font-medium">{l.poster_nom ?? "—"}</span>
              {l.pays && <span className="text-xs text-muted-foreground">{l.pays}</span>}
              <span className="text-muted-foreground">→ {l.freelancer_nom ?? l.contrat_id}</span>
              <Regle l={l} />
              <span className="ml-auto flex gap-1">
                <Button size="sm" variant="outline" className="h-8" disabled={verifier.isPending} onClick={() => verifier.mutate({ l, delier: false })}>
                  {t("accueil.liaisons.ok")}
                </Button>
                <Button size="sm" variant="destructive" className="h-8" disabled={verifier.isPending} onClick={() => delier(l)}>
                  {t("accueil.liaisons.delier")}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
