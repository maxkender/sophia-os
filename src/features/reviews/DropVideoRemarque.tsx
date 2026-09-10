import * as React from "react";
import { Film, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { premierFichierVideo } from "./videoRemarque";

/** Zone de dépôt : glisser une courte vidéo, ou cliquer pour choisir. */
export function DropVideoRemarque({
  videoUrl,
  disabled,
  labelVide,
  labelRemplacer,
  onFichier,
  onRetirer,
}: {
  videoUrl: string | null;
  disabled?: boolean;
  labelVide: string;
  labelRemplacer: string;
  onFichier: (file: File) => void;
  onRetirer?: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = React.useState(false);

  const prendre = (files: FileList | null) => {
    const f = premierFichierVideo(files);
    if (f) onFichier(f);
  };

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-dashed p-2",
        survol && "border-ring bg-muted/50",
        disabled && "opacity-64",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setSurvol(true);
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSurvol(false);
        if (!disabled) prendre(e.dataTransfer.files);
      }}
    >
      {videoUrl ? (
        <>
          <video src={videoUrl} className="max-h-36 w-full rounded-md bg-black" controls playsInline />
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <Film className="size-3.5" />
              {labelRemplacer}
            </Button>
            {onRetirer ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                disabled={disabled}
                aria-label="delete"
                onClick={onRetirer}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-md px-2 py-4 text-center text-xs text-muted-foreground hover:bg-muted/40"
        >
          <Upload className="size-4" />
          {labelVide}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          prendre(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
