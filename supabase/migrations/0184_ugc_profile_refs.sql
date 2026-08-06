-- Photos de profil de référence (import fichier ou scrape TikTok)
-- Servent de pose / cadrage pour générer la PDP d’un persona (face swap pose-only).

create table if not exists public.ugc_profile_refs (
  id uuid primary key default gen_random_uuid(),
  -- upload | tiktok
  source text not null check (source in ('upload', 'tiktok')),
  label text null,
  tiktok_handle text null,
  image_url text not null,
  storage_path text null,
  created_at timestamptz not null default now()
);

create index if not exists ugc_profile_refs_created_idx
  on public.ugc_profile_refs (created_at desc);

alter table public.ugc_profile_refs enable row level security;

drop policy if exists ugc_profile_refs_admin on public.ugc_profile_refs;
create policy ugc_profile_refs_admin on public.ugc_profile_refs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.ugc_profile_refs to authenticated;
grant all on public.ugc_profile_refs to service_role;

-- Face persona : hoodie/sweat gris → débardeur blanc
update public.prompts
set contenu = $p$Photorealistic head-and-shoulders portrait of a 20-year-old woman,

fair skin, slim build, dark blonde shoulder-length slightly wavy hair
with a side part, black eyes, oval face with defined cheekbones and
a soft jawline, a small beauty mark above the right side of her lip and
faint freckles across her cheeks, wearing a plain white tank top
with thin hoop earrings.

Soft even studio lighting, plain light-grey seamless background,
looking straight into the camera, neutral relaxed expression.

Natural realistic skin texture with visible pores, no heavy retouching.
Sharp focus, high resolution.$p$,
    updated_at = now()
where cle = 'ugc_persona_face';

-- Prompt PDP depuis une photo de référence (pose only, comme assignation)
insert into public.prompts (cle, contenu) values
(
  'ugc_persona_profile_from_ref',
  $p$Figure 1 is the base photo. Figures 2+ are reference photos of one same person.
Keep EVERYTHING in Figure 1 identical: exact body pose, hands, framing, camera
angle, background, lighting, color grade and clothing.
Replace ONLY the head and face with the person shown in the reference photos —
same facial features, same hairstyle, same skin tone as the references.
Blend the new head naturally onto the existing body and match the scene lighting.
Photorealistic, keep the amateur phone-photo look. Square 1:1 crop.$p$
)
on conflict (cle) do update set
  contenu = excluded.contenu,
  updated_at = now();
