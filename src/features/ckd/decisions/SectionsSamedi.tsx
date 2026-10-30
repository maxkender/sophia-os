import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  type ContratSansPosteur,
  type Couverture,
  fermerContratSansPosteur,
  type Force,
  type LigneSimulation,
  lireContratsSansPosteur,
  relireContratsSansPosteur,
} from "./samediExhaustif";
import { TD, TH } from "./TableauComptes";

const P = "autoOnglets.decisions.liste.samedi";

const date = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date(iso)) : "—";

/** « 331 shown out of 347 active posters (381 accounts) » et, repliée, la liste « Not in the list ». */
export function CompteurCouverture({ c }: { c: Couverture }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 text-sm" data-testid="couverture-samedi">
      <p className="font-medium">{t(`${P}.couverture.ligne`, { n: c.montres, N: c.posteurs, M: c.comptes })}</p>
      {c.absents.length > 0 && (
        <details className="rounded-md border px-3 py-1.5 text-xs" data-testid="pas-dans-la-liste">
          <summary className="cursor-pointer font-medium">{t(`${P}.couverture.absents`, { n: c.absents.length })}</summary>
          <ul className="mt-1 divide-y">
            {c.absents.map((a) => (
              <li key={a.poster_id} className="flex flex-wrap gap-2 py-1">
                <span className="font-medium">{a.nom ?? a.poster_id}</span>
                <span className="text-muted-foreground">{t(`${P}.couverture.raisons.${a.raison}`, { defaultValue: a.raison })}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {c.sansCompte > 0 && <p className="text-xs text-muted-foreground">{t(`${P}.couverture.sansCompte`, { n: c.sansCompte })}</p>}
    </div>
  );
}

/** Pourquoi le posteur est toujours dans la liste, Kill & pay proposé. */
export function BadgesForces({ forces }: { forces: Force[] }) {
  const { t } = useTranslation();
  return (
    <div className="mt-1 max-w-64 space-y-0.5 text-xs" data-testid="forces">
      {forces.map((f) => (
        <p key={f.raison}>
          <Badge variant="error" data-force={f.raison}>{t(`${P}.forces.${f.raison}`)}</Badge>
          {f.detail && <span className="ml-1 text-muted-foreground">{f.detail}</span>}
        </p>
      ))}
    </div>
  );
}

/** Les contrats actifs de VIk Studios sans profil OS. Rien n'est fermé sans un clic (et sa confirmation). */
export function ContratsSansPosteur({ admin }: { admin: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["contrats-sans-posteur"], queryFn: lireContratsSansPosteur });
  const relire = useMutation({
    mutationFn: relireContratsSansPosteur,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["contrats-sans-posteur"] }),
  });
  const fermer = useMutation({
    mutationFn: fermerContratSansPosteur,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["contrats-sans-posteur"] }),
  });
  const liste = lu.data ?? [];
  if (!lu.isPending && liste.length === 0 && !lu.error) return null;
  const parProposition = (p: ContratSansPosteur["proposition"]) => liste.filter((c) => c.proposition === p).length;
  return (
    <Card data-testid="contrats-sans-posteur">
      <CardHeader>
        <CardTitle className="text-base">{t(`${P}.sansPosteur.titre`, { n: liste.length })}</CardTitle>
        <CardDescription>
          {t(`${P}.sansPosteur.aide`, { hm: parProposition("hm"), relier: parProposition("relier"), ancien: parProposition("ancien") })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
        {admin && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" loading={relire.isPending} onClick={() => relire.mutate()} data-testid="relire-sans-posteur">
              {t(`${P}.sansPosteur.relire`)}
            </Button>
            {relire.data && <span className="text-xs text-muted-foreground">{t(`${P}.sansPosteur.relu`, relire.data)}</span>}
            {(relire.error || fermer.error) && <span className="text-xs text-destructive">{((relire.error ?? fermer.error) as Error).message}</span>}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b">
                <th className={TH}>{t(`${P}.sansPosteur.colonnes.nom`)}</th>
                <th className={TH}>{t(`${P}.sansPosteur.colonnes.debut`)}</th>
                <th className={TH}>{t(`${P}.sansPosteur.colonnes.message`)}</th>
                <th className={TH}>{t(`${P}.sansPosteur.colonnes.finance`)}</th>
                <th className={TH}>{t(`${P}.sansPosteur.colonnes.proposition`)}</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {liste.map((c) => (
                <tr key={c.contrat_id} className="border-b border-border/40" data-contrat={c.contrat_id}>
                  <td className={TD}>
                    <a className="font-medium underline" href={`https://www.upwork.com/nx/wm/workroom/${c.contrat_id}/overview`} target="_blank" rel="noreferrer">
                      {c.nom ?? c.contrat_id}
                    </a>
                    <p className="text-muted-foreground">{c.titre ?? "—"}</p>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{date(c.debut_at)}</td>
                  <td className={`${TD} max-w-72`}>
                    {c.dernier_message?.texte ? (
                      <>
                        <span className="text-muted-foreground">
                          {date(c.dernier_message.at)} · {t(`${P}.sansPosteur.de.${c.dernier_message.de ?? "posteur"}`)} :{" "}
                        </span>
                        <span className="line-clamp-2">{c.dernier_message.texte}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{c.salon_lu_at ? t(`${P}.sansPosteur.aucunMessage`) : t(`${P}.sansPosteur.pasLu`)}</span>
                    )}
                  </td>
                  <td className={TD}>
                    {!c.jalons_lus_at ? (
                      <span className="text-muted-foreground">{t(`${P}.sansPosteur.pasLu`)}</span>
                    ) : c.finances.length ? (
                      <Badge variant="warning">{c.finances.map((f) => `${f.nom ?? "?"} · ${f.depot ?? "?"} $`).join(", ")}</Badge>
                    ) : (
                      <span className="text-muted-foreground">{t(`${P}.sansPosteur.rienFinance`)}</span>
                    )}
                  </td>
                  <td className={TD}>
                    <Badge variant={c.proposition === "ancien" ? "error" : c.proposition === "hm" ? "secondary" : "info"} data-proposition={c.proposition}>
                      {t(`${P}.sansPosteur.propositions.${c.proposition}`)}
                    </Badge>
                    <p className="mt-0.5 text-muted-foreground">{c.raison}</p>
                  </td>
                  <td className={TD}>
                    {admin && c.proposition === "ancien" && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={fermer.isPending && fermer.variables === c.contrat_id}
                        onClick={() => {
                          if (window.confirm(t(`${P}.sansPosteur.confirmer`, { nom: c.nom ?? c.contrat_id }))) fermer.mutate(c.contrat_id);
                        }}
                      >
                        {t(`${P}.sansPosteur.fermer`)}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Validate en mode Test : ce qui se passerait, ligne par ligne. Rien n'a été fait. */
export function ResultatSimulation({ lignes, autres }: { lignes: LigneSimulation[]; autres: string[] }) {
  const { t } = useTranslation();
  return (
    <Card data-testid="simulation-validate" className="border-amber-500/60">
      <CardHeader>
        <CardTitle className="text-base">{t(`${P}.simulation.titre`, { n: lignes.length })}</CardTitle>
        <CardDescription>{t(`${P}.simulation.aide`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {lignes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b">
                  <th className={TH}>{t(`${P}.simulation.colonnes.posteur`)}</th>
                  <th className={TH}>{t(`${P}.simulation.colonnes.desactivation`)}</th>
                  <th className={TH}>{t(`${P}.simulation.colonnes.slack`)}</th>
                  <th className={TH}>{t(`${P}.simulation.colonnes.fermeture`)}</th>
                  <th className={TH}>{t(`${P}.simulation.colonnes.remboursement`)}</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.poster_id} className="border-b border-border/40" data-simulation={l.poster_id}>
                    <td className={TD}>
                      <span className="font-medium">{l.nom ?? "—"}</span>
                      <Badge variant="error" className="ml-1">{t(`${P}.choix.${l.choix}`)}</Badge>
                    </td>
                    <td className={TD}>{l.desactivation}</td>
                    <td className={TD}>{l.slack}</td>
                    <td className={TD}>{l.fermeture}</td>
                    <td className={TD}>{l.remboursement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {autres.length > 0 && (
          <p className="text-xs text-muted-foreground">{t(`${P}.simulation.autres`, { liste: autres.join(" · ") })}</p>
        )}
        {lignes.length === 0 && autres.length === 0 && <p className="text-muted-foreground">{t(`${P}.simulation.rien`)}</p>}
      </CardContent>
    </Card>
  );
}
