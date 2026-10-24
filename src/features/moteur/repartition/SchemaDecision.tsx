import * as React from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowRight, Globe, ListOrdered, Scale, Tag } from "lucide-react";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { cn } from "@/lib/utils";

/**
 * Le chemin d'un nouveau compte, en quatre cases : c'est la même règle que
 * celle du moteur (`choisirApplicationPourCompte` puis `choisirLabel`, dans
 * manage-users), dans le même ordre. Chaque case porte le chiffre du jour
 * qui la concerne, pour qu'on voie aussi QUI passe par où.
 */
export interface EtapeSchema {
  cle: string;
  icone: "site" | "file" | "app" | "label";
  titre: string;
  regle: string;
  /** Le chiffre du jour, ou un mini-graphe. */
  mesure?: React.ReactNode;
  /** Les applications concernées, en logos. */
  applications?: string[];
}

const ICONES = { site: Globe, file: ListOrdered, app: Scale, label: Tag } as const;

export function SchemaDecision({ etapes }: { etapes: EtapeSchema[] }) {
  const { t } = useTranslation();
  return (
    <ol
      aria-label={t("repartition.schemaTitre")}
      className="grid gap-2 lg:grid-cols-[repeat(4,minmax(0,1fr))] lg:gap-0"
    >
      {etapes.map((e, i) => {
        const Icone = ICONES[e.icone];
        const dernier = i === etapes.length - 1;
        return (
          <li key={e.cle} className="flex flex-col items-stretch lg:flex-row lg:items-stretch">
            <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border bg-card p-3">
              <div className="flex items-start gap-2">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icone className="size-3.5" aria-hidden />
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 break-words text-sm font-medium">{e.titre}</span>
              </div>
              <p className="text-xs leading-snug text-muted-foreground">{e.regle}</p>
              {(e.mesure || (e.applications && e.applications.length > 0)) && (
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs">
                  {e.applications?.map((slug) => (
                    <LogoApplication key={slug} slug={slug} taille="xs" />
                  ))}
                  {e.mesure}
                </div>
              )}
            </div>
            {!dernier && (
              <span
                className={cn(
                  "flex items-center justify-center text-muted-foreground/60",
                  "h-4 lg:h-auto lg:w-5",
                )}
                aria-hidden
              >
                <ArrowDown className="size-3.5 lg:hidden" />
                <ArrowRight className="hidden size-3.5 lg:block" />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
