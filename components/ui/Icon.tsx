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
    brew: <g {...ps}><path d="M5.5 6.5h13l-3.1 6a2.2 2.2 0 0 1-1.95 1.2h-2.9a2.2 2.2 0 0 1-1.95-1.2L5.5 6.5Z"/><path d="M12 13.7v2.3"/><path d="M8.7 16h6.6l-.7 3.1a1.6 1.6 0 0 1-1.56 1.24h-2.5A1.6 1.6 0 0 1 9.4 19.1L8.7 16Z"/></g>,
    shelf: <g {...ps}><path d="M7.2 9 8.5 6.1A1.6 1.6 0 0 1 9.96 5.2h4.08A1.6 1.6 0 0 1 15.5 6.1L16.8 9"/><rect x="6.4" y="9" width="11.2" height="11.4" rx="2.2"/><path d="M10 13.4h4"/></g>,
    log: <g {...ps}><path d="M5 19V5"/><path d="M9 19v-6"/><path d="M13 19v-9"/><path d="M17 19V8"/><path d="M5 19h14"/></g>,
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
    berry: <g {...ps}><circle cx="8.8" cy="13.4" r="3.4"/><circle cx="15.2" cy="13.4" r="3.4"/><circle cx="12" cy="8" r="3.1"/></g>,
    cherry: <g {...ps}><circle cx="7.6" cy="16.6" r="3"/><circle cx="15.4" cy="15.6" r="3"/><path d="M7.6 13.6C8.6 8.5 12 6.5 14.2 6M15.4 12.6C15 9.5 14.6 7.2 14.2 6"/><path d="M12.6 5.6c1.4-1 2.9-.8 3.7.3"/></g>,
    choco: <g {...ps}><rect x="5" y="6" width="14" height="12" rx="1.6"/><path d="M12 6v12M5 12h14"/></g>,
    nut: <g {...ps}><path d="M12 4.2c4 2 6 5 6 8 0 4-3 7.6-6 7.6S6 16.2 6 12.2c0-3 2-6 6-8Z"/><path d="M12 5.4v13.2"/></g>,
    sugar: <g {...ps}><rect x="6" y="6" width="12" height="12" rx="2.2"/><path d="M9.4 9.6h.01M14.6 14.4h.01M14.4 9.6h.01M9.6 14.4h.01"/></g>,
    wine: <g {...ps}><path d="M7.8 4h8.4l-1.1 6.2a3.2 3.2 0 0 1-6.2 0L7.8 4Z"/><path d="M12 13.4v5M9 18.4h6"/></g>,
    leaf: <g {...ps}><path d="M5 19c0-7.2 5-13 14-14 0 9.2-6 14-14 14Z"/><path d="M9 15c2-3 4.4-5 7-6"/></g>,
    gear: <g {...ps}><path d="M4 8h7M15 8h5"/><circle cx="13" cy="8" r="2.1"/><path d="M4 16h5M13 16h7"/><circle cx="11" cy="16" r="2.1"/></g>,
    snow: <g {...ps}><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="M12 6.6 9.9 4.9M12 6.6l2.1-1.7M12 17.4l-2.1 1.7M12 17.4l2.1 1.7M5.8 9.3 5 6.9M5.8 9.3 3.4 9.7M18.2 14.7l.8 2.4M18.2 14.7l2.4-.4M18.2 9.3l2.4.4M18.2 9.3 19 6.9M5.8 14.7l-2.4.4M5.8 14.7 5 17.1"/></g>,
    link: <g {...ps}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></g>,
    key: <g {...ps}><circle cx="7.5" cy="15.5" r="4.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3"/></g>,
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
