export function GymBoot() {
  return (
    <div className="gym-boot">
      <div className="gym-boot-spot" aria-hidden />
      <div className="gym-boot-grid" aria-hidden />
      <div className="gym-boot-stage">
        <svg className="gym-boot-bell" viewBox="0 0 280 100" aria-hidden>
          <g className="gym-boot-plates-left">
            <rect className="gym-boot-plate gym-boot-plate-outer" x="16" y="16" width="22" height="68" rx="5" />
            <rect className="gym-boot-plate gym-boot-plate-mid" x="38" y="24" width="16" height="52" rx="4" />
            <rect className="gym-boot-collar" x="54" y="42" width="10" height="16" rx="2" />
          </g>
          <rect className="gym-boot-bar" x="62" y="45" width="156" height="10" rx="3" />
          <g className="gym-boot-plates-right">
            <rect className="gym-boot-collar" x="216" y="42" width="10" height="16" rx="2" />
            <rect className="gym-boot-plate gym-boot-plate-mid" x="226" y="24" width="16" height="52" rx="4" />
            <rect className="gym-boot-plate gym-boot-plate-outer" x="242" y="16" width="22" height="68" rx="5" />
          </g>
        </svg>
        <svg className="gym-boot-ecg" viewBox="0 0 220 36" aria-hidden>
          <path
            className="gym-boot-ecg-line"
            d="M0 18 H52 L60 18 L68 6 L76 30 L84 18 H220"
          />
        </svg>
        <div className="gym-boot-word font-brand">
          Tekkzy <span>Fit</span>
        </div>
        <div className="gym-boot-kicker">Warming up the floor</div>
        <div className="gym-boot-rail" aria-hidden>
          <span />
        </div>
      </div>
    </div>
  );
}
