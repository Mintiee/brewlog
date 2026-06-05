"use client";

interface IconProps {
  name: string;
  size?: number;
  stroke?: number;
  style?: React.CSSProperties;
  className?: string;
}

// All SVG paths ported from ui.jsx
const PATHS: Record<string, React.ReactNode> = {};

function p(s = 1.7) {
  return { fill: "none", stroke: "currentColor", strokeWidth: s, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
}

// Defer to inline rendering to keep the component tree manageable
export function Icon({ name, size = 22, stroke = 1.7, style, className }: IconProps) {
  const ps = p(stroke);
  const paths: Record<string, React.ReactNode> = {
    // Brew nav — pour-over dripper (with handle) above a handled server
    brew: <g {...ps}><path d="M6 4.8H15l-3.3 4.6H9.3L6 4.8Z"/><path d="M15 4.8l1.6 1.3-1.9 1.4"/><path d="M7.5 9.9H13.5"/><path d="M7.7 11.3h5.6l.8 6.1a1.7 1.7 0 0 1-1.69 1.9H8.59A1.7 1.7 0 0 1 6.9 17.4L7.7 11.3Z"/><path d="M13.3 12.6c2 .2 2.1 3.4 0 3.8"/></g>,
    // Shelf nav — simple coffee bag with a folded top and seam
    shelf: <g {...ps}><path d="M7.7 4.8 H14.3 Q14.8 4.8 14.8 5.3 V7.4 H7.2 V5.3 Q7.2 4.8 7.7 4.8 Z"/><path d="M7.2 7.4 L6.6 18.4 Q6.6 19.2 7.4 19.2 H14.6 Q15.4 19.2 15.4 18.4 L14.8 7.4"/><path d="M9 11h4"/></g>,
    // Log nav — journal / notebook with ruled lines
    log: <g {...ps}><rect x="6" y="4.8" width="12" height="14.4" rx="1.8"/><path d="M9 4.8v14.4"/><path d="M11.4 9h4M11.4 12h4M11.4 15h2.6"/></g>,
    star: <path d="M12 3.6l2.45 5.18 5.55.7-4.1 3.85 1.06 5.57L12 16.9l-4.96 2.0 1.06-5.57-4.1-3.85 5.55-.7L12 3.6Z" fill="currentColor" stroke="none"/>,
    starO: <path d="M12 3.6l2.45 5.18 5.55.7-4.1 3.85 1.06 5.57L12 16.9l-4.96 2.0 1.06-5.57-4.1-3.85 5.55-.7L12 3.6Z" {...ps}/>,
    plus: <g {...ps}><path d="M12 5v14M5 12h14"/></g>,
    minus: <g {...ps}><path d="M5 12h14"/></g>,
    close: <g {...ps}><path d="M6 6l12 12M18 6L6 18"/></g>,
    check: <g {...ps}><path d="M5 12.5l4.5 4.5L19 6.5"/></g>,
    chev: <g {...ps}><path d="M9 6l6 6-6 6"/></g>,
    chevDown: <g {...ps}><path d="M6 9l6 6 6-6"/></g>,
    back: <g {...ps}><path d="M15 6l-6 6 6 6"/></g>,
    camera: <g {...ps}><path d="M4 8.5A2 2 0 0 1 6 6.5h1.2l.9-1.5A1.6 1.6 0 0 1 9.46 4h5.08c.56 0 1.08.3 1.36.9l.9 1.6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8Z"/><circle cx="12" cy="12.5" r="3.2"/></g>,
    thermo: <g {...ps}><path d="M10 13.5V6a2 2 0 1 1 4 0v7.5a3.5 3.5 0 1 1-4 0Z"/><path d="M12 14.4v-5"/></g>,
    drop: <g {...ps}><path d="M12 3.5s5.5 6 5.5 9.8A5.5 5.5 0 0 1 6.5 13.3C6.5 9.5 12 3.5 12 3.5Z"/></g>,
    grind: <g {...ps}><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></g>,
    timer: <g {...ps}><circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5"/></g>,
    edit: <g {...ps}><path d="M5 19h14M15.5 5.5l3 3L9 18l-4 1 1-4 9.5-9.5Z"/></g>,
    spark: <g {...ps}><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4Z"/></g>,
    scale: <g {...ps}><rect x="4" y="6" width="16" height="14" rx="2.4"/><path d="M9 6V5a3 3 0 0 1 6 0v1"/><circle cx="12" cy="13" r="2.4"/></g>,
    bean: <g {...ps}><ellipse cx="12" cy="12" rx="6.5" ry="8.2" transform="rotate(38 12 12)"/><path d="M8.6 7.2c2.5 2 3.8 5.7 1.8 9.6" transform="rotate(38 12 12)"/></g>,
    flower: <g {...ps}><circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="6.6" r="2.6"/><circle cx="17" cy="10.2" r="2.6"/><circle cx="15.1" cy="16.4" r="2.6"/><circle cx="8.9" cy="16.4" r="2.6"/><circle cx="7" cy="10.2" r="2.6"/></g>,
    citrus: <g {...ps}><circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7"/></g>,
    yellowfruit: <g {...ps}><path d="M12 4.5c4 0 7.5 3.4 7.5 7.5s-3.5 7.5-7.5 7.5S4.5 16 4.5 12 8 4.5 12 4.5Z"/><path d="M9 8.5c1 1.5 1.5 3.5 1 6"/><path d="M14.5 8c-.5 2-1.5 3.5-1 6.5"/></g>,
    redfruit: <g {...ps}><circle cx="8.5" cy="15.5" r="3.5"/><circle cx="15.5" cy="15.5" r="3.5"/><path d="M8.5 12c0-4 2-6.5 3.5-7.5 1.5 1 3.5 3.5 3.5 7.5"/></g>,
    berry: <g {...ps}><circle cx="8.8" cy="13.4" r="3.4"/><circle cx="15.2" cy="13.4" r="3.4"/><circle cx="12" cy="8" r="3.1"/></g>,
    cherry: <g {...ps}><circle cx="7.6" cy="16.6" r="3"/><circle cx="15.4" cy="15.6" r="3"/><path d="M7.6 13.6C8.6 8.5 12 6.5 14.2 6M15.4 12.6C15 9.5 14.6 7.2 14.2 6"/><path d="M12.6 5.6c1.4-1 2.9-.8 3.7.3"/></g>,
    choco: <g {...ps}><rect x="5" y="6" width="14" height="12" rx="1.6"/><path d="M12 6v12M5 12h14"/></g>,
    roast: <g {...ps}><path d="M12 19c-3.5 0-6-2-6-5 0-2.5 1.5-4.5 3.5-6.5 0 2 1 3 2.5 3.5C11 9 12 7 12 4.5c2 2 5 4.5 5 9.5 0 3-2.5 5-5 5Z"/></g>,
    spice: <g {...ps}><path d="M12 5v14M8 9l4-4 4 4M7 13h10"/><path d="M9 17h6"/></g>,
    nut: <g {...ps}><path d="M12 4.2c4 2 6 5 6 8 0 4-3 7.6-6 7.6S6 16.2 6 12.2c0-3 2-6 6-8Z"/><path d="M12 5.4v13.2"/></g>,
    sugar: <g {...ps}><rect x="6" y="6" width="12" height="12" rx="2.2"/><path d="M9.4 9.6h.01M14.6 14.4h.01M14.4 9.6h.01M9.6 14.4h.01"/></g>,
    wine: <g {...ps}><path d="M7.8 4h8.4l-1.1 6.2a3.2 3.2 0 0 1-6.2 0L7.8 4Z"/><path d="M12 13.4v5M9 18.4h6"/></g>,
    leaf: <g {...ps}><path d="M5 19c0-7.2 5-13 14-14 0 9.2-6 14-14 14Z"/><path d="M9 15c2-3 4.4-5 7-6"/></g>,
    gear: <g {...ps}><path d="M4 8h7M15 8h5"/><circle cx="13" cy="8" r="2.1"/><path d="M4 16h5M13 16h7"/><circle cx="11" cy="16" r="2.1"/></g>,
    snow: <g {...ps}><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="M12 6.6 9.9 4.9M12 6.6l2.1-1.7M12 17.4l-2.1 1.7M12 17.4l2.1 1.7M5.8 9.3 5 6.9M5.8 9.3 3.4 9.7M18.2 14.7l.8 2.4M18.2 14.7l2.4-.4M18.2 9.3l2.4.4M18.2 9.3 19 6.9M5.8 14.7l-2.4.4M5.8 14.7 5 17.1"/></g>,
    link: <g {...ps}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></g>,
    key: <g {...ps}><circle cx="7.5" cy="15.5" r="4.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3"/></g>,
    // ---- Brewer silhouettes (selectable method tiles) ----
    // V60 — steep open cone with ridge lines on a small base
    dripperV60: <g {...ps}><path d="M5.5 7h13l-6.5 10.5L5.5 7Z"/><path d="M9 7l1.4 8.6M15 7l-1.4 8.6"/><path d="M9.6 17.5h4.8"/></g>,
    // Gabi Master — handled funnel necking into a lower cone cup on a flat base
    dripperGabi: <g {...ps}><path d="M7 5.8h10l-3 5.2h-4L7 5.8Z"/><path d="M7.2 6.6c-2.2.6-2.2 3 .2 3.7"/><path d="M8 12.4h8"/><path d="M9 12.4h6l-1.6 5h-2.8L9 12.4Z"/><path d="M7 18.4h10"/></g>,
    // OXO — plunger brewer: wide flat press cap on a stem over a stacked-chamber body
    dripperOxo: <g {...ps}><path d="M9 4h6"/><path d="M12 4v2"/><rect x="9" y="6" width="6" height="13.4" rx="1.6"/><path d="M9 10.6h6M9 14.6h6"/></g>,
    // Generic cone fallback for any unmatched brewer
    dripper: <g {...ps}><path d="M6 8h12l-3 6h-6L6 8Z"/><path d="M12 14v2"/><path d="M9.6 16h4.8"/></g>,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {paths[name] ?? null}
    </svg>
  );
}
