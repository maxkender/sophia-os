-- 0860 : les modèles WhatsApp traduits (Max, 25/11). Additif.
-- whatsapp_modeles_soumissions : chaque soumission d'un modèle à Meta par l'action soumettre_traductions de la
-- fonction whatsapp (nom, langue Meta, catégorie, requête complète avec le texte traduit, réponse de Meta), pour
-- relire ce qui est parti. Le statut d'approbation reste dans whatsapp_modeles (action modeles_sync).

create table if not exists public.whatsapp_modeles_soumissions (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  langue text not null,
  categorie text,
  requete jsonb not null,
  ok boolean not null default false,
  meta_id text,
  statut text,
  erreur text,
  soumis_at timestamptz not null default now()
);
create index if not exists whatsapp_modeles_soumissions_nom_langue on public.whatsapp_modeles_soumissions (nom, langue, soumis_at desc);

alter table public.whatsapp_modeles_soumissions enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'whatsapp_modeles_soumissions' and policyname = 'whatsapp_modeles_soumissions_admin') then
    create policy whatsapp_modeles_soumissions_admin on public.whatsapp_modeles_soumissions for select to authenticated using (public.is_admin());
  end if;
end $$;

notify pgrst, 'reload schema';
