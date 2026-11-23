/**
 * 23/11 : la mise en page commune des onglets de la Bible. Une app = un titre qui se replie ; un label = UNE ligne
 * (chevron, nom, statut, nombre, actions), séparée des autres par un filet, qui se déplie sur sa description et ses
 * tuiles. Plus de cadre gris ni de carte autour de chaque label.
 */
import type * as React from "react";

import { cn } from "@/lib/utils";

import { BoutonPli } from "./Pli";

export function TitreApp({ libelle, sous, detail, teinte, plie, onBasculer, section, children }: {
  libelle: string; sous?: string; detail: string; teinte: string; plie?: boolean; onBasculer?: () => void;
  section?: string; children: React.ReactNode;
}) {
  const titre = (
    <>
      <span className={cn("size-2 translate-y-[-1px] rounded-full", teinte)} aria-hidden />
      <span className="text-base font-semibold tracking-tight text-stone-900 dark:text-white">{libelle}</span>
      {sous && <span className="text-xs text-stone-400">{sous}</span>}
      <span className="text-xs tabular-nums text-stone-400">{detail}</span>
    </>
  );
  return (
    <section data-section={section} data-plie={plie || undefined}>
      <h2 className="flex items-center gap-1.5 pb-1.5">
        {onBasculer && <BoutonPli plie={Boolean(plie)} onClick={onBasculer} nom={libelle} className="-ml-1.5" />}
        {onBasculer
          ? <button type="button" onClick={onBasculer} className="flex items-baseline gap-2 text-left">{titre}</button>
          : <span className="flex items-baseline gap-2">{titre}</span>}
      </h2>
      {!plie && <div className="divide-y divide-stone-200/80 border-t border-stone-200/80 dark:divide-stone-800 dark:border-stone-800">{children}</div>}
    </section>
  );
}

export function LigneLabel({ nom, cle, plie, onBasculer, statuts, nb, actions, description, children }: {
  /** Le nom du label ; `null` : les comptes sans label (pas d'en-tête, jamais repliés). */
  nom: string | null; cle: string; plie?: boolean; onBasculer?: () => void;
  statuts?: React.ReactNode; nb?: number; actions?: React.ReactNode; description?: string | null; children: React.ReactNode;
}) {
  if (nom === null) return <div className="py-3" data-carte={cle}><div className="flex flex-wrap gap-2.5">{children}</div></div>;
  return (
    <div data-carte={cle}>
      <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 py-1">
        {onBasculer && <BoutonPli plie={Boolean(plie)} onClick={onBasculer} nom={nom} className="-ml-1.5" />}
        {onBasculer
          ? <button type="button" onClick={onBasculer} className="min-w-0 text-left"><code className="text-[13px] font-semibold text-stone-900 dark:text-white">{nom}</code></button>
          : <code className="text-[13px] font-semibold text-stone-900 dark:text-white">{nom}</code>}
        {statuts}
        {nb != null && <span className="text-xs tabular-nums text-stone-400">{nb}</span>}
        {actions && <span className="ml-auto flex items-center gap-1">{actions}</span>}
      </div>
      {!plie && (
        <div className="space-y-2.5 pb-4 pl-[26px] pt-0.5 max-sm:pl-0">
          {description && <p className="line-clamp-2 max-w-3xl text-xs leading-snug text-stone-500" title={description}>{description}</p>}
          <div className="flex flex-wrap gap-2.5">{children}</div>
        </div>
      )}
    </div>
  );
}
