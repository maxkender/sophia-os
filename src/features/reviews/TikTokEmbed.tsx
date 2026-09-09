import { ExternalLink } from "lucide-react";

import { urlEmbedTiktok } from "./tiktokEmbed";

/** Lecteur TikTok officiel (iframe embed v2), avec lien de repli. */
export function TikTokEmbed({
  url,
  titre,
  videLabel,
}: {
  url: string | null;
  titre: string;
  videLabel: string;
}) {
  const embed = urlEmbedTiktok(url);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{titre}</p>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            <ExternalLink className="size-3" />
            TikTok
          </a>
        ) : null}
      </div>
      {embed ? (
        <iframe
          title={titre}
          src={embed}
          className="mx-auto h-[680px] w-full max-w-[325px] rounded-xl border bg-muted"
          allow="encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed bg-muted/40 px-4 text-center text-sm text-muted-foreground">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {url}
            </a>
          ) : (
            videLabel
          )}
        </div>
      )}
    </div>
  );
}
