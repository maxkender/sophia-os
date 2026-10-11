/**
 * Mico, la mascotte, en UN seul dessin.
 *
 * Les quatre fichiers livrés (idle, happy, celebrate, sad) étaient le même
 * SVG au mot près : seules la classe racine et le préfixe des dégradés
 * changeaient. Les embarquer tous les quatre coûtait 94 Ko pour quatre des
 * HUIT états que la feuille de style sait déjà jouer. On garde donc le dessin
 * une fois, et l'état se pose à l'exécution.
 *
 * NE PAS ÉDITER À LA MAIN : régénéré depuis le SVG d'origine.
 * Les dégradés portent le même identifiant d'une instance à l'autre, et c'est
 * sans conséquence : les définitions sont identiques.
 */
export const MICO_SVG = `<svg class="mico __ETAT__" viewBox="-10 -24 220 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="__LABEL__">
<style>
.mico{display:block;overflow:visible}
.mico:not(.static){width:100%;height:auto}
.mico *{transform-box:view-box}
.mico .wing,.mico .eye,.mico .hf,.mico .zz,.mico .spark,.mico .bang,.mico .cf,.mico .dot,.mico .brow,.mico .mouth-open,.mico .mouth-o{transform-box:fill-box}

/* visibilité par défaut */
.mico .eyes-happy,.mico .eyes-sleep,.mico .mouth-open,.mico .mouth-o,.mico .tear,.mico .fx{opacity:0}
.mico .eyes-happy,.mico .eyes-sleep,.mico .mouth-open,.mico .mouth-o,.mico .tear,.mico .fx,.mico .eyes-open{transition:opacity .18s}

/* ---------- IDLE (base) ---------- */
.mico .squash{transform-origin:100px 177px;animation:mc-breathe 3.2s ease-in-out infinite}
.mico .shadow{transform-origin:100px 184px;animation:mc-shadow 3.2s ease-in-out infinite}
.mico .face{animation:mc-look 9s ease-in-out infinite}
.mico .eye{transform-origin:50% 50%;animation:mc-blink 6s infinite}
.mico .curl{transform-origin:100px 52px;animation:mc-curl 3.2s ease-in-out infinite}
.mico .tail{transform-origin:150px 138px;animation:mc-tail 3.2s ease-in-out infinite}
.mico .wing{transform-origin:85% 8%;animation:mc-wing-idle 3.2s ease-in-out infinite}
.mico .brow{transform-origin:50% 50%}

@keyframes mc-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(.988,1.03)}}
@keyframes mc-shadow{0%,100%{transform:scale(1)}50%{transform:scale(.96)}}
@keyframes mc-look{0%,18%{transform:translate(0,0)}25%,42%{transform:translate(-4px,-.5px)}50%,68%{transform:translate(4px,.5px)}76%,100%{transform:translate(0,0)}}
@keyframes mc-blink{0%,40%,44%,86%,90.5%,95%,100%{transform:scaleY(1)}42%,88.5%,92.8%{transform:scaleY(.08)}}
@keyframes mc-curl{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(6deg)}}
@keyframes mc-tail{0%,100%{transform:rotate(0)}50%{transform:rotate(-9deg)}}
@keyframes mc-wing-idle{0%,100%{transform:rotate(0)}50%{transform:rotate(7deg)}}

/* ---------- COUCOU ---------- */
.mico.s-wave .mouth-open{opacity:1;transform:scale(.8);transform-origin:50% 0}
.mico.s-wave .wing-r{animation:mc-wave 1.1s ease-in-out infinite}
.mico.s-wave .char{transform-origin:100px 184px;animation:mc-sway 2.2s ease-in-out infinite}
.mico.s-wave .face{animation:mc-face-wave 2.2s ease-in-out infinite}
@keyframes mc-wave{0%,100%{transform:rotate(112deg)}50%{transform:rotate(146deg)}}
@keyframes mc-sway{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}
@keyframes mc-face-wave{0%,100%{transform:translate(2px,0)}50%{transform:translate(4px,-1px)}}

/* ---------- JOIE ---------- */
.mico.s-happy .eyes-open{opacity:0}
.mico.s-happy .eyes-happy,.mico.s-happy .mouth-open,.mico.s-happy .fx-hearts{opacity:1}
.mico.s-happy .char{animation:mc-jump 1.15s cubic-bezier(.4,0,.3,1) infinite}
.mico.s-happy .squash{animation:mc-jump-squash 1.15s ease-in-out infinite}
.mico.s-happy .shadow{animation:mc-jump-shadow 1.15s cubic-bezier(.4,0,.3,1) infinite}
.mico.s-happy .wing{animation:mc-flap 1.15s ease-in-out infinite}
.mico.s-happy .curl{animation:mc-curl-jump 1.15s ease-in-out infinite}
.mico.s-happy .face{animation:none}
.mico.s-happy .cheeks{animation:mc-blush 1.15s ease-in-out infinite}
.mico .hf{transform-origin:50% 50%;animation:mc-heart 1.8s ease-out infinite}
@keyframes mc-jump{0%,14%{transform:translateY(0)}44%{transform:translateY(-30px)}70%,100%{transform:translateY(0)}}
@keyframes mc-jump-squash{0%{transform:scale(1,1)}12%{transform:scale(1.12,.86)}22%{transform:scale(.92,1.1)}44%{transform:scale(1,1)}64%{transform:scale(.95,1.06)}72%{transform:scale(1.14,.85)}84%{transform:scale(.97,1.03)}100%{transform:scale(1,1)}}
@keyframes mc-jump-shadow{0%,14%{transform:scale(1);opacity:.13}44%{transform:scale(.62);opacity:.06}70%,100%{transform:scale(1);opacity:.13}}
@keyframes mc-flap{0%,14%{transform:rotate(0)}24%{transform:rotate(55deg)}34%{transform:rotate(20deg)}44%{transform:rotate(60deg)}56%{transform:rotate(25deg)}70%,100%{transform:rotate(0)}}
@keyframes mc-curl-jump{0%,14%{transform:rotate(-4deg)}30%{transform:rotate(14deg)}50%{transform:rotate(-12deg)}72%{transform:rotate(10deg)}100%{transform:rotate(-4deg)}}
@keyframes mc-blush{0%,100%{opacity:.8}50%{opacity:1}}
@keyframes mc-heart{0%{transform:translateY(6px) scale(.2);opacity:0}20%{transform:translateY(0) scale(1.15);opacity:1}35%{transform:scale(1)}100%{transform:translateY(-34px) scale(.9);opacity:0}}

/* ---------- DODO ---------- */
.mico.s-sleep .eyes-open{opacity:0}
.mico.s-sleep .eyes-sleep,.mico.s-sleep .fx-zzz{opacity:1}
.mico.s-sleep .brows{opacity:.35}
.mico.s-sleep .char{transform-origin:100px 184px;transform:rotate(-5deg)}
.mico.s-sleep .squash{animation:mc-sleep-breathe 4.2s ease-in-out infinite}
.mico.s-sleep .shadow{animation:mc-shadow 4.2s ease-in-out infinite}
.mico.s-sleep .face{animation:none;transform:translate(-2px,4px)}
.mico.s-sleep .curl{animation:mc-curl-sleep 4.2s ease-in-out infinite}
.mico.s-sleep .wing{animation:none;transform:rotate(-4deg)}
.mico.s-sleep .tail{animation:mc-tail 4.2s ease-in-out infinite}
.mico .zz{transform-origin:50% 50%;animation:mc-z 3s ease-in-out infinite}
@keyframes mc-sleep-breathe{0%,100%{transform:scale(1,.985)}50%{transform:scale(1.03,1.035)}}
@keyframes mc-curl-sleep{0%,100%{transform:rotate(28deg)}50%{transform:rotate(36deg)}}
@keyframes mc-z{0%{transform:translate(-6px,10px) scale(.4) rotate(-10deg);opacity:0}25%{opacity:1}100%{transform:translate(8px,-16px) scale(1) rotate(8deg);opacity:0}}

/* ---------- RÉFLEXION / CHARGEMENT ---------- */
.mico.s-think .fx-think{opacity:1}
.mico.s-think .face{animation:mc-think-face 3.6s ease-in-out infinite}
.mico.s-think .pupil{animation:mc-think-look 3.6s ease-in-out infinite}
.mico.s-think .brow-r{animation:mc-brow-up 3.6s ease-in-out infinite}
.mico.s-think .char{transform-origin:100px 184px;animation:mc-think-tilt 3.6s ease-in-out infinite}
.mico.s-think .wing-l{animation:mc-chin 1.8s ease-in-out infinite}
.mico.s-think .curl{animation:mc-curl-think 1.8s ease-in-out infinite}
.mico .dot{transform-origin:50% 50%;animation:mc-dot 1.1s ease-in-out infinite}
@keyframes mc-think-face{0%,100%{transform:translate(3px,-2px)}50%{transform:translate(4px,-3px)}}
@keyframes mc-think-look{0%,40%{transform:translate(3px,-4px)}55%,85%{transform:translate(-2px,-5px)}100%{transform:translate(3px,-4px)}}
@keyframes mc-brow-up{0%,100%{transform:translateY(-3px) rotate(6deg)}50%{transform:translateY(-4px) rotate(8deg)}}
@keyframes mc-think-tilt{0%,100%{transform:rotate(3deg)}50%{transform:rotate(5deg)}}
@keyframes mc-chin{0%,100%{transform:rotate(-62deg)}50%{transform:rotate(-68deg)}}
@keyframes mc-curl-think{0%,100%{transform:rotate(-2deg)}25%{transform:rotate(8deg)}75%{transform:rotate(-8deg)}}
@keyframes mc-dot{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-4px);opacity:1}}

/* ---------- SURPRISE ---------- */
.mico.s-surprise .char{animation:mc-pop 2.8s cubic-bezier(.3,1.6,.5,1) infinite}
.mico.s-surprise .squash{animation:mc-pop-squash 2.8s ease-out infinite}
.mico.s-surprise .eye{animation:mc-eye-pop 2.8s cubic-bezier(.3,1.6,.5,1) infinite}
.mico.s-surprise .brows{animation:mc-brows-pop 2.8s cubic-bezier(.3,1.6,.5,1) infinite}
.mico.s-surprise .curl{animation:mc-curl-pop 2.8s cubic-bezier(.3,1.8,.5,1) infinite}
.mico.s-surprise .wing{animation:mc-wing-pop 2.8s cubic-bezier(.3,1.6,.5,1) infinite}
.mico.s-surprise .mouth-o{animation:mc-show-pop 2.8s ease infinite}
.mico.s-surprise .fx-bang{opacity:1}
.mico.s-surprise .bang{transform-origin:50% 100%;animation:mc-bang 2.8s cubic-bezier(.3,1.8,.5,1) infinite}
.mico.s-surprise .fx-bang .spark{transform-origin:50% 50%;animation:mc-bang 2.8s cubic-bezier(.3,1.8,.5,1) infinite}
.mico.s-surprise .face{animation:none}
@keyframes mc-pop{0%,8%{transform:translateY(0)}16%{transform:translateY(-14px)}30%,64%{transform:translateY(0)}100%{transform:translateY(0)}}
@keyframes mc-pop-squash{0%,6%{transform:scale(1,1)}9%{transform:scale(1.08,.9)}16%{transform:scale(.93,1.1)}30%,64%{transform:scale(1,1)}100%{transform:scale(1,1)}}
@keyframes mc-eye-pop{0%,8%{transform:scale(1)}16%,62%{transform:scale(1.16)}74%,100%{transform:scale(1)}}
@keyframes mc-brows-pop{0%,8%{transform:translateY(0)}16%,62%{transform:translateY(-7px)}74%,100%{transform:translateY(0)}}
@keyframes mc-curl-pop{0%,8%{transform:rotate(-4deg) scale(1)}16%,60%{transform:rotate(-12deg) scale(1.18)}74%,100%{transform:rotate(-4deg) scale(1)}}
@keyframes mc-wing-pop{0%,8%{transform:rotate(0)}16%,58%{transform:rotate(48deg)}74%,100%{transform:rotate(0)}}
@keyframes mc-show-pop{0%,8%{opacity:0}13%,62%{opacity:1}70%,100%{opacity:0}}
@keyframes mc-bang{0%,9%{transform:scale(0) rotate(0);opacity:0}18%{transform:scale(1.15) rotate(-6deg);opacity:1}26%,58%{transform:scale(1) rotate(0);opacity:1}68%,100%{transform:scale(0);opacity:0}}

/* ---------- FÊTE ---------- */
.mico.s-celebrate .eyes-open{opacity:0}
.mico.s-celebrate .eyes-happy,.mico.s-celebrate .mouth-open,.mico.s-celebrate .fx-confetti,.mico.s-celebrate .fx-sparkles{opacity:1}
.mico.s-celebrate .char{animation:mc-jump .9s cubic-bezier(.4,0,.3,1) infinite}
.mico.s-celebrate .squash{animation:mc-jump-squash .9s ease-in-out infinite}
.mico.s-celebrate .shadow{animation:mc-jump-shadow .9s cubic-bezier(.4,0,.3,1) infinite}
.mico.s-celebrate .wing{animation:mc-cheer .45s ease-in-out infinite alternate}
.mico.s-celebrate .curl{animation:mc-curl-jump .9s ease-in-out infinite}
.mico.s-celebrate .face{animation:none}
.mico .cf{animation:mc-confetti 2.4s linear infinite}
.mico .fx-sparkles .spark{transform-origin:50% 50%;animation:mc-twinkle 1.6s ease-in-out infinite}
@keyframes mc-cheer{from{transform:rotate(118deg)}to{transform:rotate(150deg)}}
@keyframes mc-confetti{0%{transform:translate(0,0) rotate(0);opacity:0}8%{opacity:1}100%{transform:translate(8px,200px) rotate(540deg);opacity:0}}
@keyframes mc-twinkle{0%,100%{transform:scale(.2) rotate(0);opacity:0}50%{transform:scale(1) rotate(45deg);opacity:1}}

/* ---------- OUPS (triste / erreur) ---------- */
.mico.s-sad .tear{animation:mc-tear 2.6s ease-in infinite}
.mico.s-sad .pupil{transform:translate(0,4px)}
.mico.s-sad .eye{animation:mc-blink 6s infinite}
.mico.s-sad .brow-l{transform:translateY(-1px) rotate(-16deg)}
.mico.s-sad .brow-r{transform:translateY(-1px) rotate(16deg)}
.mico.s-sad .face{animation:none;transform:translate(0,3px)}
.mico.s-sad .curl{animation:mc-curl-sad 3.6s ease-in-out infinite}
.mico.s-sad .char{transform-origin:100px 184px;animation:mc-sad-sway 3.6s ease-in-out infinite}
.mico.s-sad .squash{animation:mc-sad-breathe 3.6s ease-in-out infinite}
.mico.s-sad .wing{animation:none;transform:rotate(-8deg)}
.mico.s-sad .tail{animation:none;transform:rotate(10deg)}
@keyframes mc-tear{0%{transform:translateY(-2px) scale(.4);opacity:0}15%{transform:translateY(0) scale(1);opacity:1}70%{transform:translateY(16px);opacity:1}100%{transform:translateY(22px);opacity:0}}
@keyframes mc-curl-sad{0%,100%{transform:rotate(38deg)}50%{transform:rotate(44deg)}}
@keyframes mc-sad-sway{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(1.5deg)}}
@keyframes mc-sad-breathe{0%,100%{transform:scale(1.02,.97)}50%{transform:scale(1,.99)}}

@media (prefers-reduced-motion:reduce){.mico *{animation:none!important}}
</style><defs>
  <radialGradient id="mico-body" cx="36%" cy="26%" r="82%">
    <stop offset="0" stop-color="#8CE0FF"/><stop offset=".5" stop-color="#3FA2F6"/><stop offset="1" stop-color="#2867D6"/>
  </radialGradient>
  <radialGradient id="mico-belly" cx="45%" cy="30%" r="75%">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#FFF7EA"/><stop offset="1" stop-color="#F0D9BA"/>
  </radialGradient>
  <linearGradient id="mico-wing" x1="0" y1="0" x2=".3" y2="1">
    <stop offset="0" stop-color="#3FA2F6"/><stop offset="1" stop-color="#2867D6"/>
  </linearGradient>
  <linearGradient id="mico-beak" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFD960"/><stop offset="1" stop-color="#FF962E"/>
  </linearGradient>
  <linearGradient id="mico-curl" x1="100" y1="52" x2="128" y2="20" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#2867D6"/><stop offset="1" stop-color="#6AD2FF"/>
  </linearGradient>
  <linearGradient id="mico-pupil" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#141433"/><stop offset=".55" stop-color="#1B1D4A"/><stop offset="1" stop-color="#3550C8"/>
  </linearGradient>
  <radialGradient id="mico-eyew" cx="50%" cy="40%" r="60%">
    <stop offset=".7" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E6EEFB"/>
  </radialGradient>
  <linearGradient id="mico-feet" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFB54A"/><stop offset="1" stop-color="#FF8A2A"/>
  </linearGradient>
  <radialGradient id="mico-cheek" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#FF7EA6" stop-opacity=".95"/><stop offset=".55" stop-color="#FF7EA6" stop-opacity=".75"/><stop offset="1" stop-color="#FF7EA6" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="mico-gloss" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity=".55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
  </radialGradient>
</defs>

<ellipse class="shadow" cx="100" cy="184" rx="46" ry="6.5" fill="#1B1B3A" opacity=".13"/>

<g class="char">
  <!-- pattes -->
  <g class="feet" fill="url(#mico-feet)">
    <path d="M77 181 C76 176 96 176 95 181 C96 186 92 188 89 185.5 C88 188.5 84 188.5 83 185.5 C80 188 76 186 77 181 Z"/>
    <path d="M105 181 C104 176 124 176 123 181 C124 186 120 188 117 185.5 C116 188.5 112 188.5 111 185.5 C108 188 104 186 105 181 Z"/>
  </g>

  <g class="squash">
    <!-- queue -->
    <g class="tail">
      <path d="M146 146 C166 140 180 128 186 110 C176 120 164 124 150 126 Z" fill="#2A6ED8"/>
      <path d="M148 156 C168 158 184 148 192 134 C180 140 166 142 150 140 Z" fill="#FF8AA0"/>
      <path d="M150 150 C168 148 182 138 190 122 C178 130 166 133 151 133 Z" fill="#3FA2F6"/>
    </g>

    <!-- houppette -->
    <g class="curl">
      <path d="M96 54 C85 46 80 33 84 23 C93 29 99 40 99 52 Z" fill="#2867D6"/>
      <path d="M100 54 C97 38 104 25 117 23 C129 21.5 133 35 124.5 39 C118 42 113 35.5 117.5 31.5"
            fill="none" stroke="url(#mico-curl)" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <!-- corps -->
    <path class="body" d="M100 46 C136 46 160 74 162 112 C164 150 138 177 100 177 C62 177 36 150 38 112 C40 74 64 46 100 46 Z" fill="url(#mico-body)"/>
    <ellipse cx="74" cy="72" rx="22" ry="14" fill="url(#mico-gloss)" transform="rotate(-28 74 72)"/>
    <path d="M58 76 C64 62 78 54 92 52" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".45"/>

    <!-- ventre -->
    <path d="M61 151 C60 139 65 129 73 123 Q80 127 86.5 121.5 Q93 126 100 120.5 Q107 126 113.5 121.5 Q120 127 127 123 C135 129 140 139 139 151 C137 167 121 175.5 100 175.5 C79 175.5 63 167 61 151 Z" fill="url(#mico-belly)"/>

    <!-- visage -->
    <g class="face">
      <g class="brows" fill="none" stroke="#1C3A86" stroke-width="3.4" stroke-linecap="round" opacity=".85">
        <path class="brow brow-l" d="M67 76 q9 -5 18 -1"/>
        <path class="brow brow-r" d="M115 75 q9 -4 18 1"/>
      </g>

      <g class="eyes-open">
        <g class="eye eye-l">
          <ellipse cx="78" cy="99" rx="16" ry="18" fill="url(#mico-eyew)"/>
          <g class="look"><g class="pupil">
            <ellipse cx="80" cy="102" rx="11" ry="13" fill="url(#mico-pupil)"/>
            <circle cx="75.5" cy="96" r="4.6" fill="#fff"/>
            <circle cx="84.5" cy="107.5" r="2.1" fill="#fff" opacity=".9"/>
          </g></g>
        </g>
        <g class="eye eye-r">
          <ellipse cx="122" cy="99" rx="16" ry="18" fill="url(#mico-eyew)"/>
          <g class="look"><g class="pupil">
            <ellipse cx="120" cy="102" rx="11" ry="13" fill="url(#mico-pupil)"/>
            <circle cx="115.5" cy="96" r="4.6" fill="#fff"/>
            <circle cx="124.5" cy="107.5" r="2.1" fill="#fff" opacity=".9"/>
          </g></g>
        </g>
      </g>
      <g class="eyes-happy" fill="none" stroke="#1B1D4A" stroke-width="5" stroke-linecap="round">
        <path d="M66 103 Q78 88 90 103"/><path d="M110 103 Q122 88 134 103"/>
      </g>
      <g class="eyes-sleep" fill="none" stroke="#1B1D4A" stroke-width="4.2" stroke-linecap="round">
        <path d="M66 100 Q78 110 90 100"/><path d="M110 100 Q122 110 134 100"/>
        <path d="M66 100 l-3 -2.5" stroke-width="3"/><path d="M134 100 l3 -2.5" stroke-width="3"/>
      </g>

      <g class="cheeks" fill="url(#mico-cheek)">
        <ellipse cx="63" cy="123" rx="11" ry="7"/>
        <ellipse cx="137" cy="123" rx="11" ry="7"/>
      </g>

      <!-- bec + bouches -->
      <g class="mouth-open">
        <path d="M91 118 C93 132 107 132 109 118 Z" fill="#7A2238"/>
        <path d="M94.5 126.5 C97 130.5 103 130.5 105.5 126.5 C103 124 97 124 94.5 126.5 Z" fill="#FF7F96"/>
      </g>
      <ellipse class="mouth-o" cx="100" cy="127" rx="5.2" ry="6.5" fill="#7A2238"/>
      <path class="beak" d="M89.5 111.5 C94 107 106 107 110.5 111.5 C108.5 119.5 104.5 124.5 100 125.5 C95.5 124.5 91.5 119.5 89.5 111.5 Z" fill="url(#mico-beak)"/>
      <ellipse cx="96" cy="111.5" rx="3.6" ry="1.8" fill="#fff" opacity=".55"/>

      <path class="tear" d="M70 118 C70 118 65.5 124 65.5 127 a4.5 4.5 0 0 0 9 0 C74.5 124 70 118 70 118 Z" fill="#8FD8FF" stroke="#fff" stroke-width="1"/>
    </g>

    <!-- ailes -->
    <g class="wing wing-l">
      <path d="M48 117 C33 119 23 135 25 152 C26 160 34 162 40 156 C49 147 54 133 54 121 Z" fill="url(#mico-wing)"/>
      <path d="M42 129 C36 137 33 145 33 151" fill="none" stroke="#8CE0FF" stroke-width="2.2" stroke-linecap="round" opacity=".7"/>
    </g>
    <g transform="translate(200 0) scale(-1 1)">
      <g class="wing wing-r">
        <path d="M48 117 C33 119 23 135 25 152 C26 160 34 162 40 156 C49 147 54 133 54 121 Z" fill="url(#mico-wing)"/>
        <path d="M42 129 C36 137 33 145 33 151" fill="none" stroke="#8CE0FF" stroke-width="2.2" stroke-linecap="round" opacity=".7"/>
      </g>
    </g>
  </g>
</g>

<!-- effets -->
<g class="fx fx-hearts" fill="#FF7EA6">
  <g transform="translate(160 64)"><path class="hf" d="M0 5 C-7 -1 -11 -6 -7 -10 C-4 -12.5 -1 -11 0 -7.5 C1 -11 4 -12.5 7 -10 C11 -6 7 -1 0 5 Z"/></g>
  <g transform="translate(36 78) scale(.75)"><path class="hf" style="animation-delay:.55s" d="M0 5 C-7 -1 -11 -6 -7 -10 C-4 -12.5 -1 -11 0 -7.5 C1 -11 4 -12.5 7 -10 C11 -6 7 -1 0 5 Z"/></g>
  <g transform="translate(146 30) scale(.6)"><path class="hf" style="animation-delay:1.1s" d="M0 5 C-7 -1 -11 -6 -7 -10 C-4 -12.5 -1 -11 0 -7.5 C1 -11 4 -12.5 7 -10 C11 -6 7 -1 0 5 Z"/></g>
</g>
<g class="fx fx-zzz" fill="none" stroke="#2867D6" stroke-linecap="round" stroke-linejoin="round">
  <g transform="translate(140 40)"><path class="zz" stroke-width="3.2" d="M0 0 h11 l-11 13 h11"/></g>
  <g transform="translate(156 18) scale(.75)"><path class="zz" style="animation-delay:1s" stroke-width="3.6" d="M0 0 h11 l-11 13 h11"/></g>
  <g transform="translate(170 0) scale(.55)"><path class="zz" style="animation-delay:2s" stroke-width="4.4" d="M0 0 h11 l-11 13 h11"/></g>
</g>
<g class="fx fx-think">
  <circle cx="146" cy="44" r="3.5" fill="#fff" stroke="#2867D6" stroke-width="1.6" opacity=".9"/>
  <circle cx="156" cy="32" r="5" fill="#fff" stroke="#2867D6" stroke-width="1.6" opacity=".9"/>
  <rect x="158" y="-6" width="46" height="28" rx="14" fill="#fff" stroke="#2867D6" stroke-width="1.8"/>
  <circle class="dot" cx="170" cy="8" r="3.6" fill="#3FA2F6"/>
  <circle class="dot" style="animation-delay:.18s" cx="181" cy="8" r="3.6" fill="#3FA2F6"/>
  <circle class="dot" style="animation-delay:.36s" cx="192" cy="8" r="3.6" fill="#3FA2F6"/>
</g>
<g class="fx fx-bang">
  <g transform="translate(150 22)"><g class="bang">
    <path d="M0 -14 C3 -14 4 -12 3.6 -9 L1.6 6 C1.4 7.5 -1.4 7.5 -1.6 6 L-3.6 -9 C-4 -12 -3 -14 0 -14 Z" fill="#FF962E"/>
    <circle cy="13" r="3.4" fill="#FF962E"/>
  </g></g>
  <g transform="translate(46 30) rotate(-20)"><path class="spark" d="M0 -9 L2 -2 L9 0 L2 2 L0 9 L-2 2 L-9 0 L-2 -2 Z" fill="#FFD960"/></g>
</g>
<g class="fx fx-sparkles" fill="#FFD960">
  <g transform="translate(24 40)"><path class="spark" d="M0 -9 C1 -2.5 2.5 -1 9 0 C2.5 1 1 2.5 0 9 C-1 2.5 -2.5 1 -9 0 C-2.5 -1 -1 -2.5 0 -9 Z"/></g>
  <g transform="translate(178 70) scale(.8)"><path class="spark" style="animation-delay:.4s" d="M0 -9 C1 -2.5 2.5 -1 9 0 C2.5 1 1 2.5 0 9 C-1 2.5 -2.5 1 -9 0 C-2.5 -1 -1 -2.5 0 -9 Z"/></g>
  <g transform="translate(170 6) scale(.6)"><path class="spark" style="animation-delay:.8s" fill="#FF7EA6" d="M0 -9 C1 -2.5 2.5 -1 9 0 C2.5 1 1 2.5 0 9 C-1 2.5 -2.5 1 -9 0 C-2.5 -1 -1 -2.5 0 -9 Z"/></g>
  <g transform="translate(14 110) scale(.55)"><path class="spark" style="animation-delay:1.2s" fill="#3FA2F6" d="M0 -9 C1 -2.5 2.5 -1 9 0 C2.5 1 1 2.5 0 9 C-1 2.5 -2.5 1 -9 0 C-2.5 -1 -1 -2.5 0 -9 Z"/></g>
</g>
<g class="fx fx-confetti"><g transform="translate(-2 -14)"><g class="cf" style="animation-delay:0.0s;animation-duration:2.4s"><rect x="-3" y="-1.6" width="6" height="3.2" rx="1" fill="#FF7EA6" transform="rotate(20)"/></g></g><g transform="translate(18 -6)"><g class="cf" style="animation-delay:0.6s;animation-duration:2.1s"><circle r="2.4" fill="#FFD960"/></g></g><g transform="translate(40 -18)"><g class="cf" style="animation-delay:1.1s;animation-duration:2.6s"><rect x="-3" y="-1.6" width="6" height="3.2" rx="1" fill="#5FE0C8" transform="rotate(-30)"/></g></g><g transform="translate(62 -8)"><g class="cf" style="animation-delay:0.3s;animation-duration:2.2s"><rect x="-3" y="-1.6" width="6" height="3.2" rx="1" fill="#9C82FF" transform="rotate(45)"/></g></g><g transform="translate(84 -20)"><g class="cf" style="animation-delay:1.5s;animation-duration:2.5s"><circle r="2.4" fill="#FF962E"/></g></g><g transform="translate(124 -12)"><g class="cf" style="animation-delay:0.9s;animation-duration:2.3s"><rect x="-3" y="-1.6" width="6" height="3.2" rx="1" fill="#3FA2F6" transform="rotate(15)"/></g></g><g transform="translate(146 -20)"><g class="cf" style="animation-delay:0.2s;animation-duration:2.7s"><circle r="2.4" fill="#FF7EA6"/></g></g><g transform="translate(166 -6)"><g class="cf" style="animation-delay:1.3s;animation-duration:2.2s"><rect x="-3" y="-1.6" width="6" height="3.2" rx="1" fill="#FFD960" transform="rotate(-20)"/></g></g><g transform="translate(188 -16)"><g class="cf" style="animation-delay:0.5s;animation-duration:2.5s"><rect x="-3" y="-1.6" width="6" height="3.2" rx="1" fill="#5FE0C8" transform="rotate(60)"/></g></g><g transform="translate(204 -8)"><g class="cf" style="animation-delay:1.8s;animation-duration:2.3s"><circle r="2.4" fill="#FF962E"/></g></g><g transform="translate(28 -22)"><g class="cf" style="animation-delay:2.0s;animation-duration:2.6s"><circle r="2.4" fill="#3FA2F6"/></g></g><g transform="translate(106 -24)"><g class="cf" style="animation-delay:1.7s;animation-duration:2.4s"><rect x="-3" y="-1.6" width="6" height="3.2" rx="1" fill="#FF4F86" transform="rotate(35)"/></g></g><g transform="translate(176 -24)"><g class="cf" style="animation-delay:0.8s;animation-duration:2.6s"><circle r="2.4" fill="#9C82FF"/></g></g><g transform="translate(8 -2)"><g class="cf" style="animation-delay:2.2s;animation-duration:2.2s"><rect x="-3" y="-1.6" width="6" height="3.2" rx="1" fill="#FFD960" transform="rotate(-45)"/></g></g></g>
</svg>`;
