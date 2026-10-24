import type React from "react";

/**
 * En-tête de page, sur le modèle de la page Allocation : un titre, une ligne
 * de contexte au plus, et les actions à droite. Le « comment ça marche » va
 * dans une infobulle ou dans la carte concernée, pas ici.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 space-y-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? <p className="max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
