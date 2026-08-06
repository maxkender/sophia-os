-- UGC identity transfer : pas un head-swap.
-- Figure 1 = pose / scène ; Figures 2+ = persona entier (peau, corps, visage, cheveux).
-- Corrige les décalages de teint cou/bras quand seul le visage était remplacé.

update public.prompts
set contenu = $p$Figure 1 is the base photo (scene + pose). Figures 2+ are reference photos of ONE same person — the persona.

Transfer the FULL identity of the persona onto Figure 1 — this is NOT a head swap / face paste:
- Face, facial features, hairstyle, hair color, eye color
- Skin tone and skin texture on ALL visible skin: face, neck, décolleté, arms, hands, shoulders, legs — zero mismatch between head and body
- Body type / build consistent with the persona references

KEEP from Figure 1 exactly:
- Body pose, hand positions, gesture
- Facial expression and gaze direction
- Clothing and accessories worn in the scene
- Framing, camera angle, background
- Lighting, color grade, image grain / phone-photo noise and overall quality

Do NOT leave the original person's skin tone on neck, arms, hands or chest.
Do NOT only replace the head. The whole visible person must look like the persona.
Photorealistic, casual amateur phone-photo look.$p$,
    updated_at = now()
where cle = 'ugc_face_swap';

update public.prompts
set contenu = $p$Figure 1 is the base photo (scene + pose). Figures 2+ are reference photos of ONE same person — the persona.

Transfer the FULL identity of the persona onto Figure 1 — this is NOT a head swap / face paste:
- Face, facial features, hairstyle, hair color, eye color
- Skin tone and skin texture on ALL visible skin: face, neck, décolleté, arms, hands, shoulders, legs — zero mismatch between head and body
- Body type / build consistent with the persona references

KEEP from Figure 1 exactly:
- Body pose, hand positions, gesture
- Facial expression and gaze direction
- Clothing and accessories worn in the scene
- Framing, camera angle, background
- Lighting, color grade, image grain / phone-photo noise and overall quality

Do NOT leave the original person's skin tone on neck, arms, hands or chest.
Do NOT only replace the head. The whole visible person must look like the persona.
Photorealistic, casual amateur phone-photo look.$p$,
    updated_at = now()
where cle = 'ugc_video_face_ref';

update public.prompts
set contenu = $p$Figure 1 is the base photo (scene + pose). Figures 2+ are reference photos of ONE same person — the persona.

Transfer the FULL identity of the persona onto Figure 1 — this is NOT a head swap / face paste:
- Face, facial features, hairstyle, hair color, eye color
- Skin tone and skin texture on ALL visible skin: face, neck, décolleté, arms, hands, shoulders, legs — zero mismatch between head and body
- Body type / build consistent with the persona references

KEEP from Figure 1 exactly:
- Body pose, hand positions, gesture
- Facial expression and gaze direction
- Clothing and accessories worn in the scene
- Framing, camera angle, background
- Lighting, color grade, image grain / phone-photo noise and overall quality
- Square 1:1 crop

Do NOT leave the original person's skin tone on neck, arms, hands or chest.
Do NOT only replace the head. The whole visible person must look like the persona.
Photorealistic, casual amateur phone-photo look.$p$,
    updated_at = now()
where cle = 'ugc_persona_profile_from_ref';
