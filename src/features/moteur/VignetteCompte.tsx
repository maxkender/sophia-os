import * as React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { estCompteCm } from "@/features/moteur/comptesCm";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { drapeauPays, nomPaysIso } from "@/features/moteur/pays";
import {
  applicationsAfficheesCompte,
  type ApplicationAffichee,
} from "@/features/moteur/repartition/logique";

export type CompteVignette = {
  id: string;
  type_compte?: string | null;
  langue: string;
  /** Marché du compte (ISO-3166-1 alpha-2), migration 0278. */
  pays?: string | null;
  application_id?: string | null;
  application_slug?: string | null;
  /** Répartition explicite ; `application_id` vaut Sophia pour tous les comptes. */
  parts_applications?: unknown;
  handle_tiktok?: string | null;
  persona_nom?: string | null;
  avatar_url?: string | null;
  score?: number | null;
};

/**
 * Drapeau du PAYS du compte, pas de sa langue. Cinq marchés anglophones
 * partageaient `en` et donc le même 🇬🇧 : impossible de voir où était un
 * posteur. Tant que le pays n'est pas renseigné on garde le drapeau de la
 * langue, mais estompé et dit comme tel, pour que le trou se voie au lieu de
 * passer pour une réponse.
 */
export function DrapeauPaysCompte({
  compte,
}: {
  compte: { langue: string; pays?: string | null };
}) {
  const { t } = useTranslation();
  const pays = compte.pays ?? null;
  if (pays) {
    return (
      <span className="text-sm leading-none" title={`${nomPaysIso(pays)} · ${nomLangue(compte.langue)}`}>
        {drapeauPays(pays)}
      </span>
    );
  }
  return (
    <span
      className="text-sm leading-none opacity-40"
      title={`${t("posters.paysNonRenseigne")} · ${nomLangue(compte.langue)}`}
    >
      {drapeauLangue(compte.langue)}
    </span>
  );
}

export function BadgeTypeCompte({ compte }: { compte: { type_compte?: string | null } }) {
  const { t } = useTranslation();
  return (
    <Badge variant={estCompteCm(compte) ? "default" : "outline"}>
      {estCompteCm(compte) ? t("cm.badge") : t("cm.perso")}
    </Badge>
  );
}

export function AvatarCompte({
  url,
  taille = "md",
}: {
  url?: string | null;
  taille?: "sm" | "md";
}) {
  const cls = taille === "sm" ? "size-8" : "size-11";
  if (url) {
    return <img src={url} alt="" className={`${cls} shrink-0 rounded-full border object-cover`} />;
  }
  return <div className={`${cls} shrink-0 rounded-full border bg-muted`} />;
}

export function HandleCompte({ handle }: { handle?: string | null }) {
  const raw = (handle ?? "").trim().replace(/^@+/, "");
  if (!raw) return null;
  return (
    <a
      href={`https://www.tiktok.com/@${raw}`}
      target="_blank"
      rel="noreferrer"
      className="truncate font-medium underline underline-offset-2"
      onClick={(e) => e.stopPropagation()}
    >
      @{raw}
    </a>
  );
}

/** En-tête d'un compte TikTok : avatar + type + langue + @. */
export function EnteteCompte({
  compte,
  compact,
  extra,
  applications,
}: {
  compte: CompteVignette;
  compact?: boolean;
  extra?: React.ReactNode;
  /**
   * Applications promues (`applicationsAfficheesCompte` avec ses labels). Sans
   * elles : sa répartition explicite, sinon Sophia.
   */
  applications?: ApplicationAffichee[];
}) {
  const { t } = useTranslation();
  const handle = (compte.handle_tiktok ?? "").trim().replace(/^@+/, "");
  const apps = applications ?? applicationsAfficheesCompte({ parts: compte.parts_applications });

  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <AvatarCompte url={compte.avatar_url} taille={compact ? "sm" : "md"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <BadgeTypeCompte compte={compte} />
          {apps.map((a) => (
            <Badge key={a.slug} variant="secondary">
              {a.part === null ? a.slug : `${a.slug} ${a.part} %`}
            </Badge>
          ))}
          <DrapeauPaysCompte compte={compte} />
          {handle ? (
            <HandleCompte handle={handle} />
          ) : (
            <span className="text-xs text-muted-foreground">{t("posters.compteSansHandle")}</span>
          )}
        </div>
        {compte.persona_nom && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{compte.persona_nom}</p>
        )}
        {extra}
      </div>
    </div>
  );
}
