import * as React from "react";
import { Play } from "lucide-react";

import type { ReviewVideo } from "./fileJour";

/** Lecteur des vidéos d'explication : enchaîne automatiquement s'il y en a plusieurs. */
export function LecteurVideosReview({
  videos,
  cle,
  progressLabel,
}: {
  videos: ReviewVideo[];
  /** Identifiant de la review : remet le lecteur à la première vidéo. */
  cle: string;
  progressLabel: (current: number, total: number) => string;
}) {
  const [index, setIndex] = React.useState(0);
  const [bloque, setBloque] = React.useState(false);
  const ref = React.useRef<HTMLVideoElement>(null);
  const video = videos[index];

  React.useEffect(() => {
    setIndex(0);
  }, [cle]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !video) return;
    setBloque(false);
    try {
      const p = el.play();
      if (p && typeof p.then === "function") void p.catch(() => setBloque(true));
    } catch {
      setBloque(true);
    }
  }, [index, video]);

  if (!video) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {progressLabel(index + 1, videos.length)}
        {video.titre ? ` · ${video.titre}` : ""}
      </p>
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={ref}
          key={video.url}
          src={video.url}
          className="max-h-[min(50vh,420px)] w-full"
          controls
          playsInline
          onEnded={() => {
            if (index < videos.length - 1) setIndex((i) => i + 1);
          }}
        />
        {bloque ? (
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"
            onClick={() => {
              setBloque(false);
              void ref.current?.play().catch(() => setBloque(true));
            }}
          >
            <Play className="size-12 fill-current" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
