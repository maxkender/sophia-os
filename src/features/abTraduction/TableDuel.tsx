import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";

import type { SlideDuel } from "./api";

/**
 * Le tableau d'un duel à l'aveugle : la source, puis les deux versions dans
 * l'ordre tiré. Partagé par la page Tests (admin) et l'espace relecteur
 * (OS posteur, 0626), qui ne nomment pas les colonnes de la même façon.
 */
export function TableDuel({
  source,
  gauche,
  droite,
  titreGauche,
  titreDroite,
}: {
  source: SlideDuel[];
  gauche: SlideDuel[];
  droite: SlideDuel[];
  titreGauche: string;
  titreDroite: string;
}) {
  const { t } = useTranslation();
  const positions = source.map((s) => s.position);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="w-8 py-1 pr-2 font-medium">#</th>
            <th className="py-1 pr-3 font-medium">{t("abTraduction.duels.source")}</th>
            <th className="py-1 pr-3 font-medium">{titreGauche}</th>
            <th className="py-1 font-medium">{titreDroite}</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p} className="border-t align-top">
              <td className="py-1.5 pr-2 text-xs text-muted-foreground">{p}</td>
              <td className="py-1.5 pr-3 text-muted-foreground">{texteSlide(source, p)}</td>
              <CelluleSlide slides={gauche} position={p} />
              <CelluleSlide slides={droite} position={p} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function texteSlide(slides: SlideDuel[], position: number): string {
  return slides.find((s) => s.position === position)?.texte_overlay ?? "";
}

function CelluleSlide({ slides, position }: { slides: SlideDuel[]; position: number }) {
  const { t } = useTranslation();
  const slide = slides.find((s) => s.position === position);
  return (
    <td className="py-1.5 pr-3">
      {slide?.position_sophia && (
        <Badge variant="info" className="mb-1">
          {t("abTraduction.duels.slideAppli")}
        </Badge>
      )}
      <p className="whitespace-pre-line">{slide?.texte_overlay ?? ""}</p>
    </td>
  );
}
