// Le détourage commun aux images du podz : BiRefNet v2 sur fal (le fond et
// son ombre partent), recadrage sur le sujet, réduction, et au besoin le noir
// et blanc de ses images (« GLOW UP HACKS FOR MEN. » : tout en gris, un peu
// contrasté). La clé (FAL_API) vient de l'environnement et ne s'affiche jamais.
// PNG en sortie : la transparence garde le blanc de la slide autour du sujet.

import { createCanvas, loadImage } from "@napi-rs/canvas";

export async function detourer(urlImage: string, options: { nb: boolean; max: number }): Promise<Buffer> {
  const cle = process.env.FAL_API;
  if (!cle) throw new Error("FAL_API manquant dans l'environnement");
  const h = { Authorization: `Key ${cle}`, "content-type": "application/json" };
  const d = await fetch("https://queue.fal.run/fal-ai/birefnet/v2", { method: "POST", headers: h, body: JSON.stringify({ image_url: urlImage }) });
  if (!d.ok) throw new Error(`fal (détourage) : HTTP ${d.status} ${(await d.text()).slice(0, 200)}`);
  const qd = (await d.json()) as { status_url: string; response_url: string };
  for (let k = 0; k < 90; k++) {
    await new Promise((s) => setTimeout(s, 2000));
    const st = (await (await fetch(qd.status_url, { headers: h })).json()) as { status: string };
    if (st.status === "COMPLETED") break;
  }
  const rd = (await (await fetch(qd.response_url, { headers: h })).json()) as { image?: { url: string } };
  if (!rd.image?.url) throw new Error(`fal (détourage) : pas d'image (${JSON.stringify(rd).slice(0, 200)})`);
  const det = await loadImage(Buffer.from(await (await fetch(rd.image.url)).arrayBuffer()));
  const W = det.width;
  const Hh = det.height;
  const c = createCanvas(W, Hh);
  const g = c.getContext("2d");
  g.drawImage(det, 0, 0);
  const px = g.getImageData(0, 0, W, Hh).data;
  let x0 = W;
  let x1 = 0;
  let y0 = Hh;
  let y1 = 0;
  for (let p = 0; p < W * Hh; p++) {
    if (px[p * 4 + 3] < 24) continue;
    const x = p % W;
    const y = (p - x) / W;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (x1 <= x0 || y1 <= y0) throw new Error("rien à détourer");
  const k = Math.min(1, options.max / Math.max(x1 - x0 + 1, y1 - y0 + 1));
  const out = createCanvas(Math.round((x1 - x0 + 1) * k), Math.round((y1 - y0 + 1) * k));
  const o = out.getContext("2d");
  o.drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, out.width, out.height);
  if (options.nb) {
    const im = o.getImageData(0, 0, out.width, out.height);
    const t = im.data;
    for (let i = 0; i < t.length; i += 4) {
      const y = 0.299 * t[i] + 0.587 * t[i + 1] + 0.114 * t[i + 2];
      const v = Math.max(0, Math.min(255, (y - 128) * 1.12 + 128));
      t[i] = t[i + 1] = t[i + 2] = v;
    }
    o.putImageData(im, 0, 0);
  }
  return out.toBuffer("image/png");
}
