-- Contrat Instagram Paper CM : signature créateur + comptes Gmail/IG assignés.
-- Remappe aussi l'ancien défaut voix « George » / locuteur-cm.

update public.reglages
set valeur = jsonb_set(valeur, '{voix}', '"5hg8RfXWJPAYypnW7dXa"', true)
where cle = 'papier'
  and lower(coalesce(valeur->>'voix', '')) in ('george', 'locuteur-cm', 'daniel', 'alice', 'giovanni', '');

create table if not exists public.papier_cm_contrats (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  compte_id uuid references public.comptes (id) on delete set null,
  langue text not null,
  statut text not null default 'envoye'
    check (statut in ('envoye', 'signe', 'annule')),
  contrat_version text not null,
  gmail_adresse text not null,
  gmail_password text not null,
  instagram_handle text not null,
  instagram_password text not null,
  nom_legal text,
  pays_residence text,
  signature_texte text,
  signe_at timestamptz,
  signature_ip text,
  signature_user_agent text,
  envoye_par uuid references auth.users (id) on delete set null,
  envoye_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint papier_cm_contrats_langue_chk check (length(btrim(langue)) >= 2),
  constraint papier_cm_contrats_signe_chk check (
    (statut <> 'signe')
    or (
      signe_at is not null
      and length(btrim(coalesce(nom_legal, ''))) >= 3
      and length(btrim(coalesce(signature_texte, ''))) >= 3
    )
  )
);

create unique index if not exists papier_cm_contrats_actif_idx
  on public.papier_cm_contrats (profile_id, langue)
  where statut <> 'annule';

create unique index if not exists papier_cm_contrats_gmail_idx
  on public.papier_cm_contrats (gmail_adresse)
  where statut <> 'annule';

create unique index if not exists papier_cm_contrats_ig_idx
  on public.papier_cm_contrats (instagram_handle)
  where statut <> 'annule';

create index if not exists papier_cm_contrats_profile_idx
  on public.papier_cm_contrats (profile_id, statut);

comment on table public.papier_cm_contrats is
  'Contrat Instagram Paper CM : admin envoie, créateur signe, puis voit Gmail + @ + mots de passe.';

alter table public.papier_cm_contrats enable row level security;

drop policy if exists papier_cm_contrats_select on public.papier_cm_contrats;
create policy papier_cm_contrats_select on public.papier_cm_contrats
  for select using (
    profile_id = auth.uid()
    or public.is_admin()
    or public.peut_voir_identifiants_compte(profile_id)
  );

drop policy if exists papier_cm_contrats_write on public.papier_cm_contrats;
create policy papier_cm_contrats_write on public.papier_cm_contrats
  for all using (
    public.is_admin()
    or public.peut_ecrire_identifiants_compte(profile_id)
  )
  with check (
    public.is_admin()
    or public.peut_ecrire_identifiants_compte(profile_id)
  );

grant select, insert, update on public.papier_cm_contrats to authenticated;

create or replace function public.ip_requete_client()
returns text
language plpgsql
stable
as $$
declare
  headers jsonb;
  raw text;
begin
  begin
    headers := current_setting('request.headers', true)::jsonb;
  exception when others then
    return null;
  end;
  raw := coalesce(headers->>'x-forwarded-for', headers->>'x-real-ip', '');
  raw := trim(split_part(raw, ',', 1));
  if raw = '' then return null; end if;
  return raw;
end;
$$;

create or replace function public.signer_papier_cm_contrat(
  p_id uuid,
  p_nom_legal text,
  p_pays text,
  p_signature text,
  p_user_agent text default null
)
returns public.papier_cm_contrats
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.papier_cm_contrats;
  nom text := trim(both from regexp_replace(coalesce(p_nom_legal, ''), '\s+', ' ', 'g'));
  sig text := trim(both from regexp_replace(coalesce(p_signature, ''), '\s+', ' ', 'g'));
  pays text := trim(both from coalesce(p_pays, ''));
begin
  if auth.uid() is null then
    raise exception 'NON_AUTHENTIFIE';
  end if;
  if length(nom) < 3 or length(sig) < 3 or lower(nom) <> lower(sig) then
    raise exception 'SIGNATURE_INVALIDE';
  end if;
  if length(pays) < 2 then
    raise exception 'PAYS_INVALIDE';
  end if;

  update public.papier_cm_contrats
     set statut = 'signe',
         nom_legal = nom,
         pays_residence = pays,
         signature_texte = sig,
         signe_at = now(),
         signature_ip = public.ip_requete_client(),
         signature_user_agent = nullif(trim(both from coalesce(p_user_agent, '')), ''),
         updated_at = now()
   where id = p_id
     and profile_id = auth.uid()
     and statut = 'envoye'
  returning * into row;

  if row.id is null then
    raise exception 'CONTRAT_INTROUVABLE';
  end if;
  return row;
end;
$$;

grant execute on function public.signer_papier_cm_contrat(uuid, text, text, text, text) to authenticated;
