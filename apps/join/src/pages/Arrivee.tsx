import type { PaysPaie } from "../api";
import { nomPays, type T } from "../i18n";
import Telephone from "../Telephone";

export default function Arrivee({ t, langue, pays, onPostuler }: {
  t: T;
  langue: string;
  pays: PaysPaie[];
  onPostuler: () => void;
}) {
  const zones = [...new Set(pays.map((p) => p.zone))].sort();
  return (
    <main className="page">
      <section className="hero">
        <div>
          <h1>{t("land.title")}</h1>
          <p className="sous-titre">{t("land.sub")}</p>
          <button type="button" className="bouton principal" onClick={onPostuler}>{t("land.cta")}</button>
        </div>
        <Telephone t={t} />
      </section>

      <section className="bloc">
        <h2>{t("land.how")}</h2>
        <ol className="etapes-liste">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => <li key={n}>{t(`anim.${n}`)}</li>)}
        </ol>
      </section>

      {zones.length > 0 && (
        <section className="bloc">
          <h2>{t("pay.title")}</h2>
          <div className="zones">
            {zones.map((z) => {
              const dz = pays.filter((p) => p.zone === z);
              return (
                <div key={z} className="zone">
                  <div className="zone-tarif">{t("pay.perWeek", { tarif: dz[0]?.tarif ?? "?" })}</div>
                  <div className="zone-nom">{t("pay.zone", { zone: z })}</div>
                  <p className="zone-pays">{dz.map((p) => nomPays(p.pays, langue)).sort().join(", ")}</p>
                </div>
              );
            })}
          </div>
          <p className="discret">{t("pay.note")}</p>
        </section>
      )}

      <section className="bloc">
        <h2>{t("cond.title")}</h2>
        <ul className="conditions">
          {[1, 2, 3, 4, 5].map((n) => <li key={n}>{t(`cond.${n}`)}</li>)}
        </ul>
        <button type="button" className="bouton principal" onClick={onPostuler}>{t("land.cta")}</button>
      </section>
    </main>
  );
}
