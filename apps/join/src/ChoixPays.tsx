import { useId, useMemo, useState } from "react";

import type { PaysPaie } from "./api";
import { nomPays, type T } from "./i18n";
import { INDICATIFS } from "./indicatifs";

/**
 * Une liste de pays cherchable (au clavier et au doigt). Les pays ouverts en premier avec leur tarif ;
 * les autres (connus des indicatifs) restent choisissables : la candidature est alors gardée pour plus tard.
 */
export default function ChoixPays({ t, langue, pays, valeur, onChoix, invalide, id }: {
  t: T;
  langue: string;
  pays: PaysPaie[];
  valeur: string;
  onChoix: (code: string) => void;
  invalide?: boolean;
  id?: string;
}) {
  const [texte, setTexte] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const idListe = useId();

  const tous = useMemo(() => {
    const ouverts = new Map(pays.map((p) => [p.pays, p.tarif]));
    const codes = [...new Set([...pays.map((p) => p.pays), ...Object.keys(INDICATIFS)])];
    return codes.map((c) => ({ c, n: nomPays(c, langue), tarif: ouverts.get(c), ouvert: ouverts.has(c) }))
      .sort((a, b) => Number(b.ouvert) - Number(a.ouvert) || a.n.localeCompare(b.n, langue));
  }, [pays, langue]);

  const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const filtres = texte ? tous.filter((p) => normal(p.n).includes(normal(texte)) || p.c.toLowerCase() === normal(texte)) : tous;
  const choisi = tous.find((p) => p.c === valeur);

  const choisir = (c: string) => {
    onChoix(c);
    setTexte("");
    setOuvert(false);
  };

  return (
    <div className="recherche">
      <input
        id={id}
        role="combobox"
        aria-expanded={ouvert}
        aria-controls={idListe}
        aria-autocomplete="list"
        aria-invalid={invalide || undefined}
        autoComplete="off"
        placeholder={choisi ? choisi.n : t("pay.search")}
        value={ouvert ? texte : choisi?.n ?? ""}
        onFocus={() => setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
        onChange={(e) => {
          setTexte(e.target.value);
          setActif(0);
          setOuvert(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActif((a) => Math.min(a + 1, filtres.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActif((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && ouvert && filtres[actif]) {
            e.preventDefault();
            choisir(filtres[actif].c);
          } else if (e.key === "Escape") setOuvert(false);
        }}
      />
      {ouvert && (
        <ul className="recherche__liste" id={idListe} role="listbox">
          {filtres.length === 0 && <li className="discret" style={{ padding: "10px 12px" }}>{t("pay.none")}</li>}
          {filtres.map((p, i) => (
            <li key={p.c} role="presentation">
              <button type="button" role="option" aria-selected={i === actif || p.c === valeur}
                onMouseDown={(e) => e.preventDefault()} onClick={() => choisir(p.c)}>
                <span>{p.n}</span>
                {p.ouvert && p.tarif != null && <small>{t("pay.short", { tarif: p.tarif })}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
