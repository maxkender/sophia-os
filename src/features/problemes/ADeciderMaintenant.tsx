import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { CarteUnique } from "./CarteUnique";
import { lireModeProblemes, lireProblemes, type Rituel } from "./api";

const P = "problemes.decisions";
const RITUELS: readonly Exclude<Rituel, "maintenant">[] = ["jeudi", "samedi", "dimanche"];

/**
 * 5/11 : en haut de Weekly decisions, « À décider maintenant » : les cartes de
 * Problèmes qui ne peuvent pas attendre le rituel (argent, offre HM à refaire,
 * question posée à Max), avec leurs boutons de décision. Les autres décisions
 * sont sur la ligne du posteur, au bon rituel (jeudi, samedi, dimanche).
 */
export function ADeciderMaintenant() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const carte = params.get("carte");
  const lu = useQuery({ queryKey: ["problemes", "ouverts"], queryFn: () => lireProblemes("ouverts"), refetchInterval: 60_000 });
  const mode = useQuery({ queryKey: ["problemes", "mode"], queryFn: lireModeProblemes });
  const liste = lu.data ?? [];
  const maintenant = liste.filter((p) => p.rituel === "maintenant");
  const parRituel = (r: Rituel) => liste.filter((p) => p.rituel === r).length;

  React.useEffect(() => {
    if (!carte || !(lu.data ?? []).some((p) => p.id === carte)) return;
    window.setTimeout(() => document.getElementById(`probleme-${carte}`)?.scrollIntoView({ block: "center" }), 50);
  }, [carte, lu.data]);

  if (lu.error) return <p className="text-sm text-destructive">{(lu.error as Error).message}</p>;
  return (
    <section className="space-y-3" data-testid="a-decider-maintenant">
      <details open={maintenant.length > 0 && maintenant.length <= 15} className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          ⚡ {t(`${P}.maintenant`, { count: maintenant.length })}
        </summary>
        <p className="mt-1 text-xs text-muted-foreground">{t(`${P}.aide`)}</p>
        <div className="mt-2 space-y-3">
          {lu.isLoading && <p className="text-sm text-muted-foreground">{t("problemes.chargement")}</p>}
          {!lu.isLoading && maintenant.length === 0 && <p className="text-sm text-muted-foreground">{t(`${P}.rien`)}</p>}
          {maintenant.map((p) => (
            <CarteUnique key={p.id} p={p} mode={mode.data ?? "test"} vue="decisions" surlignee={p.id === carte} />
          ))}
        </div>
      </details>
      <p className="flex flex-wrap gap-3 text-xs text-muted-foreground" data-testid="sujets-rituels">
        {RITUELS.map((r) => (
          <Link key={r} to={`/admin/auto/decisions?onglet=${r}`} className="underline">
            {t(`${P}.rituel.${r}`, { count: parRituel(r) })}
          </Link>
        ))}
      </p>
    </section>
  );
}
