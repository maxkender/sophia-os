/**
 * 23/11 : le menu « ⋯ » de la Bible (actions d'un label, d'un compte, onglets de sortie). Il s'ouvre sur place, sous
 * son bouton, et se ferme au clic ailleurs, à Échap, ou quand on choisit.
 */
import * as React from "react";
import { MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

export interface EntreeMenu {
  libelle: string;
  icone?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Ce que fait l'action, en bulle. */
  titre?: string;
  danger?: boolean;
  /** L'entrée en cours (un onglet choisi). */
  actif?: boolean;
  compte?: number;
}

export function MenuActions({ nom, entrees, declencheur, classeBouton, className, classePanneau, aGauche }: {
  /** Le nom lu du bouton (« Actions du label smart_girl »). */
  nom: string;
  entrees: (EntreeMenu | null | false | undefined)[];
  /** Le contenu du bouton ; sans lui, « ⋯ ». */
  declencheur?: React.ReactNode;
  classeBouton?: string;
  className?: string;
  /** Où poser le panneau, quand ce n'est pas sous le bouton (une tuile étroite : sur toute sa largeur). */
  classePanneau?: string;
  /** Le panneau s'aligne sur le bord gauche du bouton (par défaut : le droit). */
  aGauche?: boolean;
}) {
  const [ouvert, setOuvert] = React.useState(false);
  const racine = React.useRef<HTMLSpanElement>(null);
  const liste = entrees.filter((e): e is EntreeMenu => Boolean(e));

  React.useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => { if (!racine.current?.contains(e.target as Node)) setOuvert(false); };
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", touche);
    return () => { document.removeEventListener("mousedown", dehors); document.removeEventListener("keydown", touche); };
  }, [ouvert]);

  if (liste.length === 0) return null;
  return (
    <span ref={racine} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={declencheur ? undefined : nom}
        title={declencheur ? undefined : nom}
        onClick={() => setOuvert((x) => !x)}
        className={classeBouton ?? "inline-flex size-7 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-900 aria-expanded:bg-stone-100 aria-expanded:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-white dark:aria-expanded:bg-stone-800 dark:aria-expanded:text-white"}
      >
        {declencheur ?? <MoreHorizontal className="size-4" aria-hidden />}
      </button>
      {ouvert && (
        <span role="menu" aria-label={nom} className={cn("absolute z-10 flex min-w-52 flex-col rounded-xl border border-stone-200 bg-white p-1 shadow-lg dark:border-stone-700 dark:bg-stone-900", classePanneau ?? cn("top-full mt-1", aGauche ? "left-0" : "right-0"))}>
          {liste.map((e) => (
            <button
              key={e.libelle}
              type="button"
              role="menuitem"
              title={e.titre}
              onClick={() => { setOuvert(false); e.onClick(); }}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[13px] text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800",
                e.danger && "text-red-600 hover:bg-red-50 dark:text-red-400",
                e.actif && "bg-stone-100 font-semibold text-stone-900 dark:bg-stone-800 dark:text-white",
              )}
            >
              {e.icone && <e.icone className="size-3.5 shrink-0" />}
              {e.libelle}
              {e.compte != null && <span className="ml-auto pl-3 tabular-nums text-stone-400">{e.compte}</span>}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
