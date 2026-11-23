-- 0838 : WhatsApp (API Cloud de Meta) — le socle (22/11, Max). Additif.
-- Les secrets (WHATSAPP_*) restent dans les secrets des fonctions Edge : jamais dans la base ni les journaux.
--  1. whatsapp_mode : 'test' (envois aux seuls numéros autorisés) ou 'live' (avec l'OK de Max). On démarre en test.
--  2. posteur_contacts : le numéro WhatsApp et le consentement (posteur ou candidat du site).
--  3. whatsapp_envois : chaque envoi, son statut Meta (envoyé, livré, lu, échec) et son coût estimé.
--  4. whatsapp_recus : chaque message reçu (une fois par wamid), son traitement, ses médias.
--  5. whatsapp_modeles : les modèles et leur statut d'approbation chez Meta.
--  6. support_demandes.source accepte 'whatsapp'.

insert into public.reglages (cle, valeur)
values ('whatsapp_mode', jsonb_build_object('mode', 'test', 'numeros_autorises', jsonb_build_array('+33664273264')))
on conflict (cle) do nothing;

create table if not exists public.posteur_contacts (
  id uuid primary key default gen_random_uuid(),
  poster_id uuid unique references public.profiles(id),
  site_id uuid unique,
  whatsapp_e164 text check (whatsapp_e164 is null or whatsapp_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  whatsapp_optin_at timestamptz,
  whatsapp_optout_at timestamptz,
  source text,
  cree_at timestamptz not null default now(),
  maj_at timestamptz not null default now(),
  check (poster_id is not null or site_id is not null)
);
create index if not exists posteur_contacts_e164 on public.posteur_contacts (whatsapp_e164);

create table if not exists public.whatsapp_envois (
  id uuid primary key default gen_random_uuid(),
  cle text unique,
  poster_id uuid references public.profiles(id),
  e164 text not null,
  type text not null check (type in ('modele', 'texte')),
  modele text,
  langue text,
  variables jsonb,
  texte text,
  motif text,
  demande_id uuid,
  wamid text unique,
  statut text not null default 'a_envoyer' check (statut in ('a_envoyer', 'envoye', 'livre', 'lu', 'echec', 'bloque')),
  erreur text,
  cout_estime numeric,
  categorie_meta text,
  test boolean not null default false,
  cree_at timestamptz not null default now(),
  envoye_at timestamptz,
  livre_at timestamptz,
  lu_at timestamptz,
  echec_at timestamptz
);
create index if not exists whatsapp_envois_poster on public.whatsapp_envois (poster_id, cree_at desc);
create index if not exists whatsapp_envois_e164 on public.whatsapp_envois (e164, cree_at desc);

create table if not exists public.whatsapp_recus (
  wamid text primary key,
  de text not null,
  poster_id uuid references public.profiles(id),
  type text,
  texte text,
  media jsonb,
  transcription text,
  contexte_wamid text,
  recu_at timestamptz not null default now(),
  traite_at timestamptz,
  demande_id uuid,
  stop_at timestamptz,
  stop_simule boolean,
  resultat text,
  erreur text
);
create index if not exists whatsapp_recus_de on public.whatsapp_recus (de, recu_at desc);

create table if not exists public.whatsapp_modeles (
  nom text not null,
  langue text not null,
  statut text,
  categorie text,
  meta_id text,
  composants jsonb,
  raison text,
  maj_at timestamptz not null default now(),
  primary key (nom, langue)
);

alter table public.posteur_contacts enable row level security;
alter table public.whatsapp_envois enable row level security;
alter table public.whatsapp_recus enable row level security;
alter table public.whatsapp_modeles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'posteur_contacts' and policyname = 'posteur_contacts_admin') then
    create policy posteur_contacts_admin on public.posteur_contacts for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'posteur_contacts' and policyname = 'posteur_contacts_soi') then
    create policy posteur_contacts_soi on public.posteur_contacts for select to authenticated using (poster_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'whatsapp_envois' and policyname = 'whatsapp_envois_admin') then
    create policy whatsapp_envois_admin on public.whatsapp_envois for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'whatsapp_recus' and policyname = 'whatsapp_recus_admin') then
    create policy whatsapp_recus_admin on public.whatsapp_recus for select to authenticated using (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'whatsapp_modeles' and policyname = 'whatsapp_modeles_admin') then
    create policy whatsapp_modeles_admin on public.whatsapp_modeles for select to authenticated using (public.is_admin());
  end if;
end $$;

-- Le posteur donne (ou retire) son accord et son numéro depuis son dashboard.
create or replace function public.whatsapp_mon_numero(p_e164 text, p_accord boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_e164 text := nullif(regexp_replace(coalesce(p_e164, ''), '[\s().-]', '', 'g'), '');
begin
  if auth.uid() is null then raise exception 'non connecté' using errcode = '42501'; end if;
  if v_e164 is not null and v_e164 !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'numéro invalide (format international, ex. +33612345678)' using errcode = '22023';
  end if;
  insert into public.posteur_contacts (poster_id, whatsapp_e164, whatsapp_optin_at, whatsapp_optout_at, source)
  values (auth.uid(), v_e164, case when p_accord and v_e164 is not null then now() end,
          case when not p_accord then now() end, 'dashboard')
  on conflict (poster_id) do update set
    whatsapp_e164 = excluded.whatsapp_e164,
    whatsapp_optin_at = case when p_accord and excluded.whatsapp_e164 is not null
                             then coalesce(case when posteur_contacts.whatsapp_optout_at is null then posteur_contacts.whatsapp_optin_at end, now()) end,
    whatsapp_optout_at = case when p_accord then null else now() end,
    source = 'dashboard', maj_at = now();
  return (select jsonb_build_object('whatsapp_e164', whatsapp_e164, 'whatsapp_optin_at', whatsapp_optin_at, 'whatsapp_optout_at', whatsapp_optout_at)
            from public.posteur_contacts where poster_id = auth.uid());
end;
$$;
revoke execute on function public.whatsapp_mon_numero(text, boolean) from public, anon;
grant execute on function public.whatsapp_mon_numero(text, boolean) to authenticated;

-- La source 'whatsapp' pour les demandes de support (contrainte élargie, rien de retiré).
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'support_demandes_source_check'
              and pg_get_constraintdef(oid) not like '%whatsapp%') then
    alter table public.support_demandes drop constraint support_demandes_source_check;
    alter table public.support_demandes add constraint support_demandes_source_check
      check (source = any (array['help', 'slack_salon', 'slack_aide', 'email', 'upwork', 'slack', 'whatsapp']));
  end if;
end $$;
