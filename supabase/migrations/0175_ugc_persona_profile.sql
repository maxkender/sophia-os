-- Persona UGC : photo de profil carrée (1:1) avant save
-- Générée via fal-ai/nano-banana-pro/edit (4 angles en refs)

alter table public.ugc_personas
  add column if not exists image_profile_url text null,
  add column if not exists prompt_profile text null;

insert into public.prompts (cle, contenu) values
(
  'ugc_persona_profile',
  $p$Same exact person as the reference images (Figures 1–4) — identical face, hairstyle, hair color, skin tone, eye color and overall look.

Photorealistic casual iPhone mirror selfie, square 1:1 crop. She is standing in front of a bathroom or bedroom mirror, holding a white iPhone up to take the photo. Natural soft daylight, candid Gen-Z vibe, slightly imperfect real-phone look. Looking toward the phone screen / her reflection. Soft natural skin texture with visible pores, no heavy retouching. Authentic bathroom/bedroom mirror selfie aesthetic, head-and-shoulders filling the square frame. Sharp focus, high resolution.$p$
)
on conflict (cle) do nothing;
