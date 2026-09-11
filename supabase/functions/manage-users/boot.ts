/**
 * Boot loader live de manage-users.
 * Le vrai code est `bundle.gz` (SHA GitHub). esbuild minify `createClient`
 * sous un alias — on le relit, on ne le durcit pas.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const SHA = "d4bf2daba31a7f41bccc4ed69a2592cb6ccef62d";
const PATH = "supabase/functions/manage-users/bundle.gz";
const SIZE = 16502;
const URLS = [
  `https://cdn.jsdelivr.net/gh/maxkender/sophia-os@${SHA}/${PATH}`,
  `https://raw.githubusercontent.com/maxkender/sophia-os/${SHA}/${PATH}`,
];

function aliasCreateClient(code: string): { name: string; code: string } {
  const re = /import\s*\{([^}]+)\}\s*from\s*["']jsr:@supabase\/supabase-js@2["'];?/;
  const m = code.match(re);
  let name = "createClient";
  if (m) {
    const inner = m[1].replace(/\s+/g, " ").trim();
    const as = inner.match(/createClient\s+as\s+(\w+)/);
    name = as?.[1] ?? "createClient";
    code = code.replace(m[0], "");
  }
  return { name, code };
}

let lastErr: unknown;
let bytes: Uint8Array | null = null;
for (const url of URLS) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
    break;
  } catch (e) {
    lastErr = e;
  }
}
if (!bytes) {
  throw lastErr instanceof Error ? lastErr : new Error("[manage-users] bundle fetch failed");
}
if (bytes.byteLength !== SIZE) {
  throw new Error(`[manage-users] bundle size ${bytes.byteLength}`);
}

const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
let source = await new Response(stream).text();
const { name, code } = aliasCreateClient(source);

let loaded = false;
try {
  const wrapped = `import { createClient as ${name} } from "jsr:@supabase/supabase-js@2";\n${code}`;
  await import(`data:application/javascript;charset=utf-8,${encodeURIComponent(wrapped)}`);
  loaded = true;
} catch (e) {
  console.error("[manage-users] data-url import failed", e);
}
if (!loaded) {
  try {
    await Deno.writeTextFile(
      "/tmp/manage-users-rt.js",
      `import { createClient as ${name} } from "jsr:@supabase/supabase-js@2";\n${code}`,
    );
    await import("file:///tmp/manage-users-rt.js");
    loaded = true;
  } catch (e) {
    console.error("[manage-users] file import failed", e);
  }
}
if (!loaded) {
  new Function(name, code)(createClient);
}
