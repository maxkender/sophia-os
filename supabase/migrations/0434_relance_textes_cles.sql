-- 0434 — Prompt 25 : les textes « compte TikTok » et « Start warmup » de la
-- relance du jour ont leur propre clé. relance_texte_tiktok et
-- relance_texte_warmup existent déjà (anciennes relances du prompt 17, des
-- messages entiers) : 0433 ne les a pas changés (on conflict do nothing) et la
-- relance du jour ne les lit pas. Additive : 2 réglages, rien de modifié.

insert into public.reglages (cle, valeur) values
  ('relance_texte_compte_tiktok', to_jsonb(
    'create your TikTok account @{handle} (how-to: {lien_etapes}), then click Start warmup on your dashboard and follow 5 accounts'::text)),
  ('relance_texte_start_warmup', to_jsonb(
    'click Start warmup on your dashboard ({url}), then follow 5 accounts with @{handle}'::text))
on conflict (cle) do nothing;
