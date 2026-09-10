import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { resoudreTiktok } from "@/features/moteur/api";
import {
  besoinResoudreTiktok,
  idTiktokDepuisUrl,
  urlEmbedTiktok,
  urlEmbedTiktokDepuisId,
} from "./tiktokEmbed";

/** Lecteur TikTok officiel. Résout les liens courts (vm/vt/t) pour embarquer le post publié. */
export function TikTokEmbed({
  url,
  titre,
  videLabel,
  chargementLabel,
}: {
  url: string | null;
  titre: string;
  videLabel: string;
  chargementLabel: string;
}) {
  const aResoudre = besoinResoudreTiktok(url);
  const apercu = useQuery({
    queryKey: ["tiktok-apercu", url],
    queryFn: () => resoudreTiktok(url!),
    enabled: aResoudre,
    staleTime: 10 * 60_000,
  });

  const canon = apercu.data?.url ?? url;
  const id = idTiktokDepuisUrl(url) ?? apercu.data?.id ?? idTiktokDepuisUrl(canon);
  const embed = urlEmbedTiktokDepuisId(id) ?? urlEmbedTiktok(canon);
  const thumbnail = apercu.data?.thumbnail ?? null;
  const lien = canon || url;
  const attendApercu = aResoudre && apercu.isPending && !embed;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{titre}</p>
        {lien ? (
          <a
            href={lien}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            <ExternalLink className="size-3" />
            TikTok
          </a>
        ) : null}
      </div>
      {attendApercu ? (
        <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed bg-muted/40 px-4 text-center text-sm text-muted-foreground">
          {chargementLabel}
        </div>
      ) : embed ? (
        <iframe
          title={titre}
          src={embed}
          className="mx-auto h-[680px] w-full max-w-[325px] rounded-xl border bg-muted"
          allow="encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : thumbnail ? (
        <a href={lien ?? undefined} target="_blank" rel="noreferrer" className="mx-auto block w-full max-w-[325px]">
          <img
            src={thumbnail}
            alt={titre}
            className="h-[580px] w-full rounded-xl border object-cover object-top"
          />
        </a>
      ) : (
        <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed bg-muted/40 px-4 text-center text-sm text-muted-foreground">
          {lien ? (
            <a href={lien} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {lien}
            </a>
          ) : (
            videLabel
          )}
        </div>
      )}
    </div>
  );
}
