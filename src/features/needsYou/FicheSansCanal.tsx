import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { activerPoster } from "@/features/moteur/api";

import { lireFicheSansCanal, lireOffresUpwork, relierSansCanal } from "./ficheSansCanalApi";

const P = "needsYou.sansCanal";
const jour = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date(iso));

/**
 * Needs you, « No channel to reach them » (format fiche, prompt 25 MAJ §10) :
 * ce qu'on sait, l'offre Upwork à son nom (état, lien), le contrat qui attend
 * dans « Contracts to link » (pays à choisir), puis « Link a contract » ou
 * « Never joined → deactivate ». La carte se ferme seule une fois reliée.
 */
export function FicheSansCanal({ posterId }: { posterId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["sans-canal", posterId], queryFn: () => lireFicheSansCanal(posterId) });
  const [contrat, setContrat] = React.useState("");
  const [pays, setPays] = React.useState("");
  const fini = () => {
    void qc.invalidateQueries({ queryKey: ["needs-you"] });
    void qc.invalidateQueries({ queryKey: ["sans-canal", posterId] });
  };
  const relier = useMutation({ mutationFn: (v: { contrat: string; pays: string | null }) => relierSansCanal(posterId, v.contrat, v.pays), onSuccess: fini });
  const desactiver = useMutation({ mutationFn: () => activerPoster(posterId, false), onSuccess: fini });
  const offres = useMutation({ mutationFn: lireOffresUpwork, onSuccess: fini });
  const f = lu.data;
  React.useEffect(() => {
    if (f?.pays && !pays) setPays(f.pays);
  }, [f?.pays, pays]);
  if (lu.isPending) return <p className="text-xs text-muted-foreground">{t("common.loading")}</p>;
  if (lu.error || !f) return <p className="text-xs text-destructive">{(lu.error as Error | null)?.message}</p>;
  const attente = f.en_attente[0];
  const occupe = relier.isPending || desactiver.isPending;
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-xs" data-testid="fiche-sans-canal">
      <p>
        {t(`${P}.connu`, {
          hm: f.hm ?? "—",
          date: jour(f.cree_le),
          connexion: f.connexion ? t(`${P}.derniere`, { date: jour(f.connexion) }) : t(`${P}.jamais`),
          cohorte: f.cohorte ? jour(`${f.cohorte}T12:00:00Z`) : "—",
        })}
        {f.reporte && <> · {t(`${P}.reporte`)}</>}
      </p>
      <div data-testid="offre-upwork">
        <span className="font-medium">{t(`${P}.offre`)} </span>
        {f.offres.length > 0 ? (
          f.offres.map((o) => (
            <span key={o.offre_id} className="mr-3 inline-flex flex-wrap items-center gap-1">
              {t(`${P}.etat`, { etat: o.etat ?? "?", nom: o.nom ?? "?" })}
              <a className="text-primary underline" href={`https://www.upwork.com/nx/wm/offer/${o.offre_id}`} target="_blank" rel="noreferrer">{t(`${P}.voirOffre`)}</a>
              {o.contrat_id && !o.relie && (
                <Button size="xs" variant="outline" disabled={occupe} onClick={() => relier.mutate({ contrat: o.contrat_id!, pays: null })}>
                  {t(`${P}.relierCe`, { id: o.contrat_id })}
                </Button>
              )}
            </span>
          ))
        ) : (
          <span>{f.offres_lues_at ? t(`${P}.introuvable`) : t(`${P}.pasLues`)}</span>
        )}
        <Button size="xs" variant="ghost" loading={offres.isPending} onClick={() => offres.mutate()}>{t(`${P}.relireOffres`)}</Button>
        {offres.data && !offres.data.ok && <span className="text-destructive"> {offres.data.error}</span>}
      </div>
      {attente && (
        <div className="flex flex-wrap items-center gap-2" data-testid="contrat-en-attente">
          <span className="font-medium">{t(`${P}.trouve`, { id: attente.contrat_id })}</span>
          <Input className="h-7 w-16" maxLength={2} value={pays} placeholder="FR" aria-label={t(`${P}.pays`)} onChange={(e) => setPays(e.target.value.toUpperCase())} />
          <Button
            size="xs"
            disabled={occupe || pays.trim().length !== 2}
            onClick={() => {
              if (window.confirm(t(`${P}.confirmPays`, { id: attente.contrat_id, pays }))) relier.mutate({ contrat: attente.contrat_id, pays });
            }}
          >
            {t(`${P}.choisirPays`)}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select className="h-7 max-w-80 rounded-md border bg-background px-1" aria-label={t(`${P}.relier`)} value={contrat} onChange={(e) => setContrat(e.target.value)}>
          <option value="">{t(`${P}.choisir`)}</option>
          {f.libres.map((c) => (
            <option key={c.contrat_id} value={c.contrat_id}>
              {c.proche ? "★ " : ""}{c.contrat_id} · {c.nom ?? "?"}{c.debut_at ? ` · ${jour(c.debut_at)}` : ""}
            </option>
          ))}
        </select>
        <Button
          size="xs"
          disabled={occupe || !contrat}
          onClick={() => {
            if (window.confirm(t(`${P}.confirmRelier`, { id: contrat }))) relier.mutate({ contrat, pays: null });
          }}
        >
          {t(`${P}.relier`)}
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={occupe}
          onClick={() => {
            if (window.confirm(t(`${P}.confirmDesactiver`, { nom: [f.prenom, f.nom].filter(Boolean).join(" ") }))) desactiver.mutate();
          }}
        >
          {t(`${P}.desactiver`)}
        </Button>
      </div>
      {(relier.error || desactiver.error) && <p className="text-destructive">{((relier.error ?? desactiver.error) as Error).message}</p>}
    </div>
  );
}
