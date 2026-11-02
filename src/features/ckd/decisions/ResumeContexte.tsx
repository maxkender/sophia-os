import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { localeDate } from "@/locales/localeDate";

import { datesCourtes, type ResumeContexte as Resume, extrait } from "./resumeContexte";

const P = "contexteResume";

const VARIANTE: Record<Resume["verdict"], "error" | "warning" | "success" | "secondary" | "info"> = {
  stop: "error",
  absent: "info",
  silence: "warning",
  repondu: "success",
  rien: "secondary",
};

/**
 * Le petit menu « Context » : une ligne (verdict, dernière réponse, nos
 * messages sans réponse avec leurs dates au jour près), et le fil en dépliant.
 * `onOuvrir` : charger le fil à la première ouverture (jeudi).
 */
export function ResumeContexte({
  r,
  derniereConnexion,
  dernierPost,
  onOuvrir,
  chargement,
}: {
  r: Resume | null;
  derniereConnexion?: string | null;
  dernierPost?: string | null;
  onOuvrir?: () => void;
  chargement?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const langue = localeDate(i18n.resolvedLanguage ?? "en");
  const jour = (iso: string | null | undefined) => (iso ? datesCourtes([iso], langue) : t(`${P}.jamais`));
  const ligne = !r
    ? t(`${P}.chargement`)
    : r.verdict === "stop"
    ? t(`${P}.stop`, { date: jour(r.dernierRecu?.at), texte: r.dernierRecu?.extrait ?? "" })
    : r.verdict === "silence"
    ? t(`${P}.silence`, { count: r.sansReponse.n, dates: datesCourtes(r.sansReponse.dates, langue), derniere: jour(r.dernierRecu?.at) })
    : r.verdict === "repondu"
    ? t(`${P}.repondu`, { date: jour(r.dernierRecu?.at), canal: r.dernierRecu?.canal ?? "?", texte: r.dernierRecu?.extrait ?? "" })
    : r.verdict === "absent"
    ? t(`${P}.absent`)
    : t(`${P}.rien`);
  return (
    <details
      className="group rounded-md border px-2 py-1 text-xs"
      data-testid="resume-contexte"
      onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onOuvrir?.()}
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-1.5">
        <span className="font-medium">{t(`${P}.titre`)}</span>
        {r && <Badge variant={VARIANTE[r.verdict]} data-verdict={r.verdict}>{t(`${P}.verdicts.${r.verdict}`)}</Badge>}
        <span className="text-muted-foreground">{ligne}</span>
      </summary>
      <div className="mt-1 space-y-1">
        {(derniereConnexion !== undefined || dernierPost !== undefined) && (
          <p className="text-muted-foreground">{t(`${P}.activite`, { connexion: jour(derniereConnexion), post: jour(dernierPost) })}</p>
        )}
        {chargement && <p className="text-muted-foreground">{t(`${P}.chargement`)}</p>}
        {r && r.fil.length > 0 && (
          <ul className="divide-y rounded border">
            {r.fil.map((e, i) => (
              <li key={`${e.at}-${i}`} className="px-1.5 py-1">
                <span className="tabular-nums text-muted-foreground">{jour(e.at)} · {e.canal ?? "—"} · </span>
                <span className="font-medium">{t(e.sens === "recu" ? `${P}.recu` : `${P}.envoye`)}</span> {extrait(e.texte, 140)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
