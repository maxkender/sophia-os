import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";

import type { FicheSamedi as TFiche } from "./semaineComptes";
import { useFicheSamedi } from "./useFicheSamedi";

const date = (iso: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(iso));

/**
 * Prompt 26 : tout pour décider un Kill : les posts jour par jour (liens,
 * vues), les nudges, les messages de la semaine, l'historique, le contrat,
 * le montant en jeu, et ce que fait chaque bouton.
 */
export function FicheSamedi({ posterId, lundi }: { posterId: string; lundi: string }) {
  const { t } = useTranslation();
  const lu = useFicheSamedi(posterId, lundi, true);
  if (lu.isPending) return <p className="text-xs text-muted-foreground">{t("common.loading")}</p>;
  if (lu.error) return <p className="text-xs text-destructive">{(lu.error as Error).message}</p>;
  const f: TFiche = lu.data!;
  const p = "autoOnglets.decisions.liste.samedi.fiche";
  return (
    <div className="grid gap-3 text-xs md:grid-cols-2" data-testid="fiche-samedi">
      <section className="space-y-1">
        <p className="font-medium">{t(`${p}.contrat`)}</p>
        <p>
          {f.contrat.url ? (
            <a className="underline" href={f.contrat.url} target="_blank" rel="noreferrer">{f.contrat.id}</a>
          ) : (
            "—"
          )}
          {" · "}
          {t(`${p}.freelance`, { nom: f.contrat.freelance ?? "—" })}
          {" · "}
          {t(`${p}.tarif`, { tarif: f.contrat.tarif ?? "—" })}
        </p>
        <p className="font-medium" data-testid="montant-en-jeu">
          {t(`${p}.enJeu`, { montant: f.semaine?.montant ?? 0, faits: f.semaine?.faits ?? 0, prevus: f.semaine?.prevus ?? 0 })}
        </p>
        <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
          <li>{t(`${p}.boutons.kill`)}</li>
          <li>{t(`${p}.boutons.kill_np`)}</li>
          <li>{t(`${p}.boutons.double`)}</li>
          <li>{t(`${p}.boutons.keep`)}</li>
        </ul>
      </section>
      <section className="space-y-1">
        <p className="font-medium">{t(`${p}.posts`, { n: f.posts.length })}</p>
        <ul className="space-y-0.5">
          {f.posts.map((x, i) => (
            <li key={`${x.jour}-${i}`} className="flex flex-wrap gap-2">
              <span className="tabular-nums">{x.jour.slice(5)}</span>
              <span className="text-muted-foreground">@{x.handle ?? "?"}</span>
              {x.url ? (
                <a className="underline" href={x.url} target="_blank" rel="noreferrer">{t(`${p}.lien`)}</a>
              ) : (
                <Badge variant="warning">{t(`${p}.sansLien`)}</Badge>
              )}
              {x.vues !== null && <span className="tabular-nums">{t(`${p}.vues`, { n: x.vues })}</span>}
              {x.statut === "introuvable" && <Badge variant="error">{t(`${p}.introuvable`)}</Badge>}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-1">
        <p className="font-medium">{t(`${p}.nudges`, { n: f.nudges.length })}</p>
        <ul className="space-y-0.5">
          {f.nudges.map((n, i) => (
            <li key={i}>
              <span className="tabular-nums">{date(n.at)}</span> · {n.type} · {(n.canaux ?? [n.canal ?? "—"]).join(" + ")}
              {n.erreur && <span className="text-destructive"> · {n.erreur}</span>}
            </li>
          ))}
        </ul>
        <p className="pt-1 font-medium">{t(`${p}.messages`, { n: f.messages.length })}</p>
        <ul className="max-h-40 space-y-0.5 overflow-y-auto">
          {f.messages.map((m, i) => (
            <li key={i} className={m.sens === "recu" ? "" : "text-muted-foreground"}>
              <span className="tabular-nums">{date(m.at)}</span> · {t(`${p}.sens.${m.sens}`)} ({m.canal ?? "—"}) : {m.texte}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-1">
        <p className="font-medium">{t(`${p}.historique`)}</p>
        <p>{t(`${p}.cohorte`, { cohorte: f.historique.cohorte ?? "—" })}</p>
        <p>
          {t(`${p}.comptes`, { n: f.historique.comptes.length })}{" "}
          {f.historique.comptes.map((c) => `@${c.handle ?? "?"}${c.actif ? "" : ` (${t(`${p}.inactif`)})`}`).join(", ")}
        </p>
        <p>{t(`${p}.pauses`, { n: f.historique.pauses.length })}</p>
        <p>{t(`${p}.killsAnnules`, { n: f.historique.kills_annules })}</p>
      </section>
    </div>
  );
}
