import { useSearchParams } from "react-router-dom";

/**
 * Prompt 22, parties 5 à 9 : les onglets des pages de « Recruitment
 * Automation ». L'onglet vit dans l'adresse (`?onglet=`), pour qu'un compteur
 * d'Overview ou un bouton « Fix » mène au bon onglet, déjà ouvert.
 */
export function useOnglet<O extends string>(
  onglets: readonly O[],
  defaut: O,
  anciens: Readonly<Record<string, O>> = {},
): [O, (o: O) => void] {
  const [params, setParams] = useSearchParams();
  const brut = params.get("onglet") ?? params.get("vue") ?? "";
  const actif: O = (onglets as readonly string[]).includes(brut) ? (brut as O) : (anciens[brut] ?? defaut);
  const choisir = (o: O) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete("vue");
        if (o === defaut) n.delete("onglet");
        else n.set("onglet", o);
        return n;
      },
      { replace: true },
    );
  return [actif, choisir];
}
