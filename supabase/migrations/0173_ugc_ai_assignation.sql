-- UGC AI assignation : créateur ↔ persona, flag regen visage, prompt éditable

alter table public.comptes
  add column if not exists ugc_ai boolean not null default false;

alter table public.comptes
  add column if not exists ugc_persona_id uuid null
    references public.ugc_personas (id) on delete set null;

comment on column public.comptes.ugc_ai is
  'Créateur UGC AI — reçoit uniquement des slideshows ugc_compatible ; swap visage via persona.';
comment on column public.comptes.ugc_persona_id is
  'Persona UGC unique associé à ce créateur (4 angles).';

create index if not exists comptes_ugc_ai_idx
  on public.comptes (ugc_ai)
  where ugc_ai;

create index if not exists comptes_ugc_persona_idx
  on public.comptes (ugc_persona_id)
  where ugc_persona_id is not null;

alter table public.media_library
  add column if not exists ugc_face_regen boolean not null default false;

comment on column public.media_library.ugc_face_regen is
  'Image régénérée Nano Banana (swap visage UGC) — exclue de l''upscale SeedVR minuit.';

create index if not exists media_library_ugc_face_regen_idx
  on public.media_library (ugc_face_regen)
  where ugc_face_regen;

insert into public.prompts (cle, contenu) values
(
  'ugc_face_swap',
  $p$Keep this scene identical (Figure 1): pose, hands, framing, background
and lighting. Render the subject as the character shown in the reference
images (Figures 2+), keeping the character visually consistent with them.
Photorealistic, casual phone-photo style.$p$
)
on conflict (cle) do nothing;
