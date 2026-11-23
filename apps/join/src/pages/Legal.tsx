import type { T } from "../i18n";

export default function Legal({ t }: { t: T }) {
  return (
    <main className="page">
      <div className="wrap etroite" style={{ display: "grid", gap: 18 }}>
        <span className="label">{t("foot.legal")}</span>
        <h1 className="h2">{t("legal.title")}</h1>
        {[1, 2, 3, 4].map((n) => <p key={n}>{t(`legal.${n}`)}</p>)}
        <p><a href="mailto:support@vikstudios.com">support@vikstudios.com</a></p>
      </div>
    </main>
  );
}
