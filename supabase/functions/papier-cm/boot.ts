/**
 * Boot loader live de papier-cm.
 * Le vrai code est `bundle.gz` (SHA GitHub). esbuild minify le binding
 * `createClient` sous un nom court qui CHANGE à chaque build — on le relit
 * dans l'import ESM, on ne suppose plus `Zt`.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const SHA = "ae6a9fb42594fc0d7cea0fa480a543909897c4e6";
const PATH = "supabase/functions/papier-cm/bundle.gz";
const SIZE = 34899;
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
  throw lastErr instanceof Error ? lastErr : new Error("[papier-cm] bundle fetch failed");
}
if (bytes.byteLength !== SIZE) {
  throw new Error(`[papier-cm] bundle size ${bytes.byteLength}`);
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
  console.error("[papier-cm] data-url import failed", e);
}
if (!loaded) {
  try {
    await Deno.writeTextFile(
      "/tmp/papier-cm-rt.js",
      `import { createClient as ${name} } from "jsr:@supabase/supabase-js@2";\n${code}`,
    );
    await import("file:///tmp/papier-cm-rt.js");
    loaded = true;
  } catch (e) {
    console.error("[papier-cm] file import failed", e);
  }
}
if (!loaded) {
  new Function(name, code)(createClient);
}
