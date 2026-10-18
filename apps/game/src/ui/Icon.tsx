/** Small line icons drawn in SVG (no image files, works offline). */
const PATHS = {
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  street: 'M4 20V9l4-3 4 3v11M12 20V5l4-2 4 2v15M2 20h20M7 12h2M7 16h2M15 9h2M15 13h2M15 17h2',
  map: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  decisions: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  assets: 'M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  pause: 'M8 5v14M16 5v14',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  check: 'M5 12.5l4.5 4.5L19 7',
  key: 'M14.5 9.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zM13 13l8 8M17 17l2-2M19 19l2-2',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  bank: 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18',
  chart: 'M4 20V4M4 20h16M7 15l4-4 3 3 5-6',
  euro: 'M17 6.5A6.5 6.5 0 1 0 17 17.5M4 10h9M4 14h9',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .2-1.4-1.4.2-2-3-1-1 2h-2l-1-2-3 1 .2 2-1.4 1.4-2-.2-1 3 2 1v2l-2 1 1 3 2-.2 1.4 1.4-.2 2 3 1 1-2h2l1 2 3-1-.2-2 1.4-1.4 2 .2 1-3-2-1z',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  exit: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10',
  globe:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
} as const;

export type IconName = keyof typeof PATHS;

interface Props {
  name: IconName;
  size?: number;
  filled?: boolean;
  label?: string;
}

export function Icon({ name, size = 22, filled = false, label }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
