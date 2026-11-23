// 23/11 (Max) : la vidéo guide. La même URL vit côté Edge (supabase/functions/_shared/join.ts, VIDEO_GUIDE_URL) pour
// la bienvenue, et servira aux messages WhatsApp et aux emails de l'OS.
export const VIDEO_GUIDE_ID = "10SuGjYGgOtLuW8WkOht1XPbyiM2z9fQi";
export const VIDEO_GUIDE_URL = `https://drive.google.com/file/d/${VIDEO_GUIDE_ID}/view?usp=sharing`;
export const VIDEO_GUIDE_PREVIEW = `https://drive.google.com/file/d/${VIDEO_GUIDE_ID}/preview`;
/** Format de la vidéo (vertical, filmée au téléphone). Mettre "16 / 9" si elle est horizontale. */
export const VIDEO_GUIDE_FORMAT = "9 / 16";
