import { BookOpen, ExternalLink } from "lucide-react";

/**
 * Les guides vivent sur Notion (16/10/2026) : ils remplacent les anciennes
 * pages Guide / Onboard creators / FAQ de l'OS, qui se contredisaient.
 * Notion refuse l'iframe (`X-Frame-Options: SAMEORIGIN`) : on ouvre un onglet.
 */
export const GUIDE_NOTION_HM =
  "https://app.notion.com/p/Vik-Studios-Hiring-Manager-Guide-3f4241308d66818c84f3c3eb514f140c?source=copy_link";
/** Le Poster Guide : le lien public (les posteurs n'ont pas accès à app.notion.com). */
export const GUIDE_NOTION_POSTER = "https://star-water-a0e.notion.site/Vik-Studios-TikTok-Poster-Guide-3f4241308d6681f8ad41dc507f2c8505";

/** Le bouton du bas de la barre latérale qui ouvre le guide Notion. */
export function BoutonGuideNotion({ url, titre, sousTitre }: { url: string; titre: string; sousTitre: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-3 rounded-xl bg-gradient-to-br from-primary to-primary/70 px-3 py-2.5 text-primary-foreground shadow-sm ring-1 ring-primary/20 transition hover:shadow-md hover:brightness-110"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
        <BookOpen className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight">{titre}</span>
        <span className="block truncate text-[11px] opacity-80">{sousTitre}</span>
      </span>
      <ExternalLink className="size-3.5 shrink-0 opacity-70 transition group-hover:translate-x-0.5" />
    </a>
  );
}
