#!/usr/bin/env bash
# Rebuild the gzip used by the live papier-cm boot loader.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/supabase/functions/papier-cm/bundle.gz"
tmp="$(mktemp)"
# minify renomme `createClient` (Zt, er, …). Le boot loader (boot.ts) relit
# l'alias dans l'import ESM — ne plus le durcir (sinon JWT → 500).
npx esbuild "$root/supabase/functions/papier-cm/index.ts" \
  --bundle --format=esm --minify --platform=neutral --target=esnext \
  --external:jsr:@supabase/supabase-js@2 \
  --outfile="$tmp"
gzip -nc "$tmp" > "$out"
rm -f "$tmp"
ls -l "$out"
