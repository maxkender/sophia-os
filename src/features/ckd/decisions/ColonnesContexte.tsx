import * as React from "react";
import { useTranslation } from "react-i18next";
import { Briefcase, Forward, Hash, LayoutDashboard, MousePointerClick } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { type ContextePosteur, joursDepuis, type MessageContexte } from "./contexte";
import { TD } from "./TableauComptes";

const P = "autoOnglets.decisions.liste.contexte";

const ICONES: Record<string, typeof Hash> = {
  upwork: Briefcase,
  slack: Hash,
  send_to_os: Forward,
  bouton: MousePointerClick,
  dashboard: LayoutDashboard,
};

export function IconeCanal({ canal }: { canal: string }) {
  const { t } = useTranslation();
  // « slack+upwork » : les deux.
  const canaux = canal.split("+");
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground" title={canaux.map((c) => t(`${P}.canaux.${c}`, { defaultValue: c })).join(" + ")}>
      {canaux.map((c) => {
        const I = ICONES[c] ?? Hash;
        return <I key={c} className="size-3" aria-hidden />;
      })}
      <span className="sr-only">{canaux.map((c) => t(`${P}.canaux.${c}`, { defaultValue: c })).join(" + ")}</span>
    </span>
  );
}

/** « 29 Oct 14:05 » à l'heure de Paris. */
function dateParis(iso: string, langue: string): string {
  return new Intl.DateTimeFormat(langue, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(iso));
}

function jourParis(iso: string, langue: string): string {
  return new Intl.DateTimeFormat(langue, { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(new Date(iso));
}

function Message({ m, maintenant }: { m: MessageContexte; maintenant: Date }) {
  const { t, i18n } = useTranslation();
  const [plein, setPlein] = React.useState(false);
  const n = joursDepuis(m.at, maintenant);
  return (
    <div className="space-y-0.5" data-testid="dernier-recu">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <IconeCanal canal={m.canal} />
        <span className="tabular-nums">{dateParis(m.at, i18n.resolvedLanguage ?? "en")}</span>
        <span>· {n === 0 ? t(`${P}.aujourdhui`) : t(`${P}.ilYa`, { n })}</span>
        {m.lien && (
          <a className="ml-auto text-primary underline" href={m.lien} target="_blank" rel="noreferrer">
            {t(`${P}.ouvrir`)}
          </a>
        )}
      </p>
      {m.texte && (
        <button
          type="button"
          className={cn("block w-full whitespace-pre-wrap break-words text-left text-xs", !plein && "line-clamp-3")}
          onClick={() => setPlein((v) => !v)}
          title={plein ? undefined : t(`${P}.toutLire`)}
        >
          {m.texte}
        </button>
      )}
    </div>
  );
}

/**
 * Prompt 27 : la colonne Context. Son dernier message (le plus récent, tous
 * canaux), le nôtre (« Replied » ou « No reply »), en gris sa dernière
 * connexion au dashboard et son dernier post avec lien ; les cas déjà classés
 * par l'OS cette semaine, en badge.
 */
export function CelluleContexte({ c, maintenant }: { c?: ContextePosteur; maintenant: Date }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "en";
  if (!c) return <td className={cn(TD, "w-64 text-xs text-muted-foreground")}>—</td>;
  return (
    <td className={cn(TD, "w-64 min-w-56 max-w-72 space-y-1 text-xs")} data-testid="cellule-contexte">
      {(c.badges ?? []).length > 0 && (
        <span className="flex flex-wrap gap-1">
          {(c.badges ?? []).map((b) => (
            <Badge key={b} variant={b === "stop" ? "error" : "warning"}>{t(`${P}.badges.${b}`)}</Badge>
          ))}
        </span>
      )}
      {c.dernier_recu ? (
        <Message m={c.dernier_recu} maintenant={maintenant} />
      ) : (
        <p className="text-muted-foreground" data-testid="aucun-message">
          {t(`${P}.aucunMessage`, { date: c.arrivee ? jourParis(c.arrivee, langue) : "—" })}
        </p>
      )}
      {c.dernier_envoye && (
        <p className="flex items-center gap-1 text-[11px]" data-testid="dernier-envoye">
          <span className="text-muted-foreground">{t(`${P}.nous`)}</span>
          <IconeCanal canal={c.dernier_envoye.canal} />
          <span className="tabular-nums text-muted-foreground">{dateParis(c.dernier_envoye.at, langue)}</span>
          <Badge variant={c.repondu ? "success" : "secondary"}>{t(c.repondu ? `${P}.repondu` : `${P}.pasDeReponse`)}</Badge>
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {t(`${P}.connexion`, { quand: c.derniere_connexion ? jourParis(c.derniere_connexion, langue) : t(`${P}.jamais`) })}
        {" · "}
        {t(`${P}.post`, { quand: c.dernier_post_at ? jourParis(c.dernier_post_at, langue) : t(`${P}.aucun`) })}
      </p>
    </td>
  );
}

/** Prompt 27 : la colonne Away, remplie seulement si une absence déclarée touche la semaine affichée. */
export function CelluleAway({ c }: { c?: ContextePosteur }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "en";
  const a = c?.absence;
  const jour = (d: string) => jourParis(`${d}T12:00:00Z`, langue);
  return (
    <td className={cn(TD, "w-36 max-w-40 text-xs")} data-testid="cellule-away">
      {a && (
        <p data-testid="absence">
          {t(`${P}.away`, { du: jour(a.debut), au: jour(a.fin) })}
          {a.raison && <> · {a.raison}</>}
          {" · "}
          <span className="text-muted-foreground">{t(`${P}.declare`, { date: jourParis(a.declare_at, langue) })}</span>
        </p>
      )}
      {(c?.absences_30j ?? 0) > 1 && <p className="text-[11px] text-muted-foreground">{t(`${P}.absences30`, { n: c!.absences_30j })}</p>}
    </td>
  );
}
