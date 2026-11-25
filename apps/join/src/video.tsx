// 23/11 (Max) : la vidéo guide. La même URL vit côté Edge (supabase/functions/_shared/join.ts, VIDEO_GUIDE_URL) pour
// la bienvenue, et servira aux messages WhatsApp et aux emails de l'OS.
import { type MouseEvent, useState } from "react";

import type { T } from "./i18n";
import { Marque } from "./Logo";

export const VIDEO_GUIDE_ID = "10SuGjYGgOtLuW8WkOht1XPbyiM2z9fQi";
export const VIDEO_GUIDE_URL = `https://drive.google.com/file/d/${VIDEO_GUIDE_ID}/view?usp=sharing`;
export const VIDEO_GUIDE_PREVIEW = `https://drive.google.com/file/d/${VIDEO_GUIDE_ID}/preview`;
/** Format de la vidéo (vertical, filmée au téléphone). Mettre "16 / 9" si elle est horizontale. */
export const VIDEO_GUIDE_FORMAT = "9 / 16";

/**
 * 25/11 (test persona) : la vidéo guide derrière une image d'aperçu (plus de rectangle sombre). Le lecteur de Google
 * Drive n'est chargé qu'au clic (rien n'est demandé à Google avant). L'aperçu est dessiné ici (aucune image externe) :
 * un téléphone qui montre un slideshow, le bouton lecture et le titre de la vidéo dans la langue du site.
 */
export function VideoGuide({ t }: { t: T }) {
  const [lancee, setLancee] = useState(false);
  const lancer = (e: MouseEvent) => {
    e.stopPropagation();
    setLancee(true);
  };
  return (
    <>
      <div className="video__cadre" style={{ aspectRatio: VIDEO_GUIDE_FORMAT }}>
        {lancee ? (
          <iframe src={VIDEO_GUIDE_PREVIEW} title={t("video.title")} allow="autoplay; fullscreen" allowFullScreen />
        ) : (
          <button type="button" className="video__apercu" onClick={lancer} aria-label={`${t("video.watch")} · ${t("video.title")}`}>
            <span className="video__marque" aria-hidden="true"><Marque /></span>
            <span className="video__ecran" aria-hidden="true">
              <span className="video__slide video__slide--1"><i /><i /><i /></span>
              <span className="video__slide video__slide--2"><i /><i /></span>
              <span className="video__points"><i /><i /><i /><i /></span>
            </span>
            <span className="video__lecture" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
            </span>
            <span className="video__legende" aria-hidden="true">{t("video.title")}</span>
          </button>
        )}
      </div>
      <a href={VIDEO_GUIDE_URL} target="_blank" rel="noopener noreferrer">{t("video.watch")}</a>
    </>
  );
}
