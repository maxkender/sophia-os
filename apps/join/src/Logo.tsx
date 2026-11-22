// La marque Vik Studios (le losange du site vikstudios.com).
export function Marque({ titre }: { titre?: string }) {
  return (
    <svg viewBox="-21.213 -21.213 42.426 42.426" fill="none" role={titre ? "img" : undefined} aria-hidden={titre ? undefined : true}
      aria-label={titre}>
      <g transform="rotate(45) translate(-15 -15)">
        <rect x="9.95" y="0" width="10.1" height="10" fill="#21AFFF" />
        <rect x="20" y="9.95" width="10" height="10.1" fill="#FFBB45" />
        <path d="M2.2 0H10V10H0V2.2A2.2 2.2 0 0 1 2.2 0Z" fill="#8B45FF" />
        <path d="M20 0H27.8A2.2 2.2 0 0 1 30 2.2V10H20Z" fill="#004DFF" />
        <path d="M20 20H30V27.8A2.2 2.2 0 0 1 27.8 30H20Z" fill="#FF5050" />
        <path d="M0 20H10V30H2.2A2.2 2.2 0 0 1 0 27.8Z" fill="#8B45FF" />
      </g>
    </svg>
  );
}

export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" className="logo" onClick={onClick} aria-label="Vik Studios">
      <Marque />
      <span>Vik Studios</span>
    </button>
  );
}
