import type { T } from "../i18n";

/** La FAQ publique (questions d'avant la candidature). Les points pas encore tranchés n'y sont pas. */
export default function Faq({ t, onContrat, onPrivacy }: { t: T; onContrat: () => void; onPrivacy: () => void }) {
  return (
    <section className="section section--tight" id="faq">
      <div className="wrap etroite">
        <div className="section__head">
          <span className="label">{t("faq.label")}</span>
          <h2 className="h2">{t("faq.title")}</h2>
        </div>
        <div className="faq">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <details key={n} className="carte faq__item">
              <summary className="h3">{t(`faq.${n}.q`)}</summary>
              <p>{t(`faq.${n}.a`)}</p>
              {n === 2 && <button type="button" className="lien" onClick={onPrivacy}>{t("faq.privacy")}</button>}
              {n === 3 && <button type="button" className="lien" onClick={onContrat}>{t("faq.contract")}</button>}
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
