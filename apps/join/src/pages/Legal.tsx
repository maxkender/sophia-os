import { useEffect } from "react";

import type { T } from "../i18n";

/** Les paragraphes d'une section (clés `<prefixe>.1`, `.2`… dans les locales). */
function Paragraphes({ t, prefixe, n }: { t: T; prefixe: string; n: number }) {
  return <>{Array.from({ length: n }, (_, i) => <p key={i}>{t(`${prefixe}.${i + 1}`)}</p>)}</>;
}

const SOUS_TRAITANTS = ["supabase", "vercel", "ruul", "slack", "brevo", "whatsapp", "google"] as const;

/** Mentions légales et politique de confidentialité (RGPD). `section` : l'ancre à afficher en premier. */
export default function Legal({ t, section }: { t: T; section?: "legal" | "privacy" }) {
  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView();
  }, [section]);

  return (
    <main className="page">
      <div className="wrap etroite legal">
        <span className="label">{t("foot.legal")}</span>
        <h1 className="h2">{t("legal.title")}</h1>

        <section id="legal" className="carte legal__bloc">
          <h2 className="h3">{t("legal.notice.title")}</h2>
          <h3 className="legal__st">{t("legal.notice.publisher")}</h3>
          <p>{t("legal.notice.company")}</p>
          <p>{t("legal.notice.office")}</p>
          <p>{t("legal.notice.ids")}</p>
          <p>{t("legal.notice.director")}</p>
          <p>{t("legal.notice.contact")}</p>
          <h3 className="legal__st">{t("legal.notice.hostTitle")}</h3>
          <p>{t("legal.notice.host")}</p>
          <p className="discret">{t("legal.notice.official")}</p>
        </section>

        <section id="privacy" className="carte legal__bloc">
          <h2 className="h3">{t("privacy.title")}</h2>
          <p className="discret">{t("privacy.updated")}</p>
          <p>{t("privacy.intro")}</p>

          <h3 className="legal__st">{t("privacy.controller.title")}</h3>
          <Paragraphes t={t} prefixe="privacy.controller" n={2} />

          <h3 className="legal__st">{t("privacy.data.title")}</h3>
          <Paragraphes t={t} prefixe="privacy.data" n={4} />

          <h3 className="legal__st">{t("privacy.purposes.title")}</h3>
          <ul className="legal__liste">
            {[1, 2, 3, 4, 5].map((n) => <li key={n}>{t(`privacy.purposes.${n}`)}</li>)}
          </ul>
          <p>{t("privacy.purposes.6")}</p>

          <h3 className="legal__st">{t("privacy.retention.title")}</h3>
          <ul className="legal__liste">
            {[1, 2, 3].map((n) => <li key={n}>{t(`privacy.retention.${n}`)}</li>)}
          </ul>

          <h3 className="legal__st">{t("privacy.processors.title")}</h3>
          <p>{t("privacy.processors.intro")}</p>
          <ul className="legal__liste">
            {SOUS_TRAITANTS.map((k) => <li key={k}>{t(`privacy.processors.${k}`)}</li>)}
          </ul>

          <h3 className="legal__st">{t("privacy.transfers.title")}</h3>
          <Paragraphes t={t} prefixe="privacy.transfers" n={1} />

          <h3 className="legal__st">{t("privacy.cookies.title")}</h3>
          <Paragraphes t={t} prefixe="privacy.cookies" n={1} />

          <h3 className="legal__st">{t("privacy.rights.title")}</h3>
          <Paragraphes t={t} prefixe="privacy.rights" n={2} />

          <h3 className="legal__st">{t("privacy.contact.title")}</h3>
          <Paragraphes t={t} prefixe="privacy.contact" n={1} />
          <p><a href="mailto:support@vikstudios.com">support@vikstudios.com</a></p>
        </section>
      </div>
    </main>
  );
}
