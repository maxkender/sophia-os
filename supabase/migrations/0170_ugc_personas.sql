-- UGC AI : personas (4 images — face + 3 angles)
-- Section admin /admin/ugc/personas

create table if not exists public.ugc_personas (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  prompt_base text not null default '',
  prompt_left text null,
  prompt_right text null,
  prompt_down text null,
  image_face_url text not null,
  image_left_url text not null,
  image_right_url text not null,
  image_down_url text not null,
  storage_prefix text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ugc_personas_created_idx on public.ugc_personas (created_at desc);

alter table public.ugc_personas enable row level security;

drop policy if exists ugc_personas_admin on public.ugc_personas;
create policy ugc_personas_admin on public.ugc_personas
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.ugc_personas to authenticated;
grant all on public.ugc_personas to service_role;

-- Prompts éditables (défauts UGC persona)
insert into public.prompts (cle, contenu) values
(
  'ugc_persona_face',
  $p$Photorealistic head-and-shoulders portrait of a 20-year-old woman,

fair skin, slim build, dark blonde shoulder-length slightly wavy hair
with a side part, black eyes, oval face with defined cheekbones and
a soft jawline, a small beauty mark above the right side of her lip and
faint freckles across her cheeks, wearing a heather-grey oversized
sweatshirt with thin hoop earrings.

Soft even studio lighting, plain light-grey seamless background,
looking straight into the camera, neutral relaxed expression.

Natural realistic skin texture with visible pores, no heavy retouching.
Sharp focus, high resolution.$p$
),
(
  'ugc_persona_edit_left',
  $p$Same exact person as the reference image — identical face, hairstyle,
hair color, skin tone, eye color and outfit. Keep the same soft studio
lighting and plain light-grey background.

Change ONLY the head/camera orientation to: three-quarter view facing left

Photorealistic, head-and-shoulders, natural skin texture, sharp focus.$p$
),
(
  'ugc_persona_edit_right',
  $p$Same exact person as the reference image — identical face, hairstyle,
hair color, skin tone, eye color and outfit. Keep the same soft studio
lighting and plain light-grey background.

Change ONLY the head/camera orientation to: three-quarter view facing right

Photorealistic, head-and-shoulders, natural skin texture, sharp focus.$p$
),
(
  'ugc_persona_edit_down',
  $p$Same exact person as the reference image — identical face, hairstyle,
hair color, skin tone, eye color and outfit. Keep the same soft studio
lighting and plain light-grey background.

Change ONLY the head/camera orientation to: head slightly tilted down, looking down

Photorealistic, head-and-shoulders, natural skin texture, sharp focus.$p$
)
on conflict (cle) do nothing;
