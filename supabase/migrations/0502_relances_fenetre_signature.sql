-- 0502 — Relances d'étapes (1/11) : envoyées entre 9 h et 21 h dans le fuseau
-- de la recrue (au lieu de 10 h–20 h), et signées « Vik Studios team »
-- (modifiable dans Settings ; aucune mention de bot). Additif : un réglage créé,
-- deux valeurs du réglage etapes_delais changées. Aucun interrupteur touché.

update public.reglages
   set valeur = coalesce(valeur, '{}'::jsonb) || jsonb_build_object('fenetre_debut', 9, 'fenetre_fin', 21),
       updated_at = now()
 where cle = 'etapes_delais';

insert into public.reglages (cle, valeur, updated_at)
values ('relance_signature', to_jsonb('Vik Studios team'::text), now())
on conflict (cle) do nothing;
