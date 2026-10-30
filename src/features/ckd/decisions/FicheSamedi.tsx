import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";

import { IconeCanal } from "./ColonnesContexte";
import { lireFil } from "./contexte";
import { nomsConcordent } from "./statutCompte";
import type { FicheSamedi as TFiche } from "./semaineComptes";
import { useFicheSamedi } from "./useFicheSamedi";

const date = (iso: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(iso));

/** L'état de la paie de la semaine : OK, tarif manquant, aucune milestone financée, milestone bizarre. */
function etatPaie(f: TFiche): "ok" | "tarif_manquant" | "aucune" | "bizarre" | "inconnu" {
  if (!f.semaine) return "inconnu";
  if (f.semaine.faits > 0 && (f.semaine.tarif === null || f.semaine.tarif === undefined)) return "tarif_manquant";
  const finances = f.paie?.finances ?? [];
  if (f.semaine.faits > 0 && finances.length === 0) return "aucune";
  const tarif = Number(f.semaine.tarif ?? 0);
  // Une milestone financée hors tarif (× nombre de comptes), ou plus de deux : à vérifier (0453 : tarif + 1 $ toléré, transition).
  const bizarre = finances.length > 2 || finances.some((j) => {
    const m = Number(j.montant ?? 0);
    return tarif > 0 && m % tarif !== 0 && m !== tarif + 1;
  });
  return bizarre ? "bizarre" : "ok";
}

/**
 * Prompts 12 et 26 : tout pour décider, en un clic sur la ligne : les liens
 * (Upwork, TikTok, Slack, OS), le contrat (freelance sur Upwork, tarif,
 * « vérifier le contrat »), le montant en jeu et l'état de la paie, les posts
 * jour par jour (ou d'un seul jour), les nudges, les messages de la semaine,
 * l'historique, les fiches Needs you, Disputes et To read, et ce que fait
 * chaque bouton.
 */
export function FicheSamedi({ posterId, lundi, jour = null }: { posterId: string; lundi: string; jour?: string | null }) {
  const { t } = useTranslation();
  const lu = useFicheSamedi(posterId, lundi, true);
  const fil = useQuery({ queryKey: ["posteur-fil", posterId], queryFn: () => lireFil(posterId) });
  if (lu.isPending) return <p className="text-xs text-muted-foreground">{t("common.loading")}</p>;
  if (lu.error) return <p className="text-xs text-destructive">{(lu.error as Error).message}</p>;
  const f: TFiche = lu.data!;
  const p = "autoOnglets.decisions.liste.samedi.fiche";
  const posts = jour ? f.posts.filter((x) => x.jour === jour) : f.posts;
  const paie = etatPaie(f);
  const aVerifier = !nomsConcordent(f.contrat.freelance, f.contrat.profil ?? null);
  return (
    <div className="grid gap-3 text-xs md:grid-cols-2" data-testid="fiche-samedi">
      <section className="space-y-1">
        <p className="font-medium">{t(`${p}.liensTitre`)}</p>
        <p className="flex flex-wrap gap-3" data-testid="fiche-liens">
          {f.contrat.url && <a className="underline" href={f.contrat.url} target="_blank" rel="noreferrer">{t(`${p}.liens.upwork`)}</a>}
          {f.liens?.tiktok && <a className="underline" href={f.liens.tiktok} target="_blank" rel="noreferrer">{t(`${p}.liens.tiktok`)}</a>}
          {f.liens?.slack && <a className="underline" href={f.liens.slack} target="_blank" rel="noreferrer">{t(`${p}.liens.slack`)}</a>}
          {f.liens?.os && <Link className="underline" to={f.liens.os}>{t(`${p}.liens.os`)}</Link>}
        </p>
        <p className="font-medium">{t(`${p}.contrat`)}</p>
        <p>
          {f.contrat.url ? (
            <a className="underline" href={f.contrat.url} target="_blank" rel="noreferrer">{f.contrat.id}</a>
          ) : (
            <Badge variant="error">{t(`${p}.sansContrat`)}</Badge>
          )}
          {" · "}
          {t(`${p}.freelance`, { nom: f.contrat.freelance ?? "—" })}
          {" · "}
          {t(`${p}.tarif`, { tarif: f.contrat.tarif ?? "—" })}
          {aVerifier && <Badge variant="warning" className="ml-2">{t(`${p}.verifierContrat`)}</Badge>}
        </p>
        <p className="font-medium" data-testid="montant-en-jeu">
          {t(`${p}.enJeu`, { montant: f.semaine?.montant ?? 0, faits: f.semaine?.faits ?? 0, prevus: f.semaine?.prevus ?? 0 })}
        </p>
        <p data-testid="etat-paie">
          {t(`${p}.paie.titre`)} <Badge variant={paie === "ok" ? "success" : paie === "inconnu" ? "secondary" : "warning"}>{t(`${p}.paie.${paie}`)}</Badge>
          {(f.paie?.finances ?? []).map((j, i) => (
            <span key={i} className="ml-2 text-muted-foreground">{j.nom ?? "?"} · {j.montant ?? "?"} $</span>
          ))}
        </p>
        <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
          <li>{t(`${p}.boutons.kill`)}</li>
          <li>{t(`${p}.boutons.kill_np`)}</li>
          <li>{t(`${p}.boutons.double`)}</li>
          <li>{t(`${p}.boutons.keep`)}</li>
          <li>{t(`${p}.boutons.repondre`)}</li>
          <li>{t(`${p}.boutons.autre`)}</li>
        </ul>
      </section>
      <section className="space-y-1">
        <p className="font-medium">{jour ? t(`${p}.postsJour`, { jour: jour.slice(5), n: posts.length }) : t(`${p}.posts`, { n: posts.length })}</p>
        <ul className="space-y-0.5" data-testid="fiche-posts">
          {posts.map((x, i) => (
            <li key={`${x.jour}-${i}`} className="flex flex-wrap gap-2">
              <span className="tabular-nums">{x.jour.slice(5)}</span>
              <span className="text-muted-foreground">@{x.handle ?? "?"}</span>
              {x.url ? (
                <a className="underline" href={x.url} target="_blank" rel="noreferrer">{t(`${p}.lien`)}</a>
              ) : (
                <Badge variant="warning">{t(`${p}.sansLien`)}</Badge>
              )}
              {x.url && (
                <Badge variant={x.statut === "resolu" ? "success" : x.statut === "introuvable" ? "error" : "secondary"}>
                  {t(`${p}.statutsLien.${x.statut === "resolu" ? "trouve" : x.statut === "introuvable" ? "introuvable" : "a_verifier"}`)}
                </Badge>
              )}
              <span className="tabular-nums">{x.url ? (x.vues === null ? t(`${p}.pasDeReleve`) : t(`${p}.vues`, { n: x.vues })) : null}</span>
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
        {/* Prompt 27 : les 10 derniers messages des deux côtés, Slack et Upwork mélangés, avec leur canal. */}
        <p className="pt-1 font-medium">{t(`${p}.fil`, { n: fil.data?.length ?? 0 })}</p>
        {fil.error && <p className="text-destructive">{(fil.error as Error).message}</p>}
        <ul className="max-h-60 space-y-1 overflow-y-auto" data-testid="fiche-fil">
          {(fil.data ?? []).map((m, i) => (
            <li key={i} className={m.sens === "recu" ? "" : "text-muted-foreground"}>
              <span className="inline-flex items-center gap-1">
                <IconeCanal canal={m.canal} />
                <span className="tabular-nums">{date(m.at)}</span> · {t(`${p}.sens.${m.sens}`)}
                {m.lien && <a className="text-primary underline" href={m.lien} target="_blank" rel="noreferrer">{t("autoOnglets.decisions.liste.contexte.ouvrir")}</a>}
              </span>
              <span className="block whitespace-pre-wrap break-words">{m.texte}</span>
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
          {f.historique.comptes.filter((c) => c.actif).length >= 2 && <Badge variant="secondary" className="ml-2">Double</Badge>}
        </p>
        <p>{t(`${p}.pauses`, { n: f.historique.pauses.length })}</p>
        <p>{t(`${p}.recreations`, { n: f.historique.recreations ?? 0 })}</p>
        <p>{t(`${p}.killsAnnules`, { n: f.historique.kills_annules })}</p>
        <p className="pt-1 font-medium">{t(`${p}.autres`)}</p>
        <ul className="space-y-0.5" data-testid="fiche-autres">
          {(f.needs_you ?? []).map((n, i) => <li key={`ny${i}`}>Needs you · {t(`needsYou.types.${n.type}`, { defaultValue: n.type })} : {n.pense}</li>)}
          {(f.disputes ?? []).map((d, i) => <li key={`d${i}`}>Disputes · {d.type} : {d.texte}</li>)}
          {(f.to_read ?? []).map((r, i) => <li key={`r${i}`}>To read · {r.liste} : {r.texte}</li>)}
          {(f.needs_you?.length ?? 0) + (f.disputes?.length ?? 0) + (f.to_read?.length ?? 0) === 0 && (
            <li className="text-muted-foreground">{t(`${p}.rienDautre`)}</li>
          )}
        </ul>
      </section>
    </div>
  );
}
