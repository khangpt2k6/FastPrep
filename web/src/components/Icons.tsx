import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4l-9 9" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Svg>
);

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 5.5v13l11-6.5z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconRadar = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 12l6-6" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" />
  </Svg>
);

export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
    <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
  </Svg>
);

export const IconSound = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
    <path d="M18 6.5a7.8 7.8 0 0 1 0 11" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4.5M12 17.2v.3" />
  </Svg>
);

export const IconBriefcase = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="7" width="17" height="12.5" rx="2.5" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
    <path d="M3.5 12.5h17" />
  </Svg>
);

export const IconSend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.5 3.5L10 14" />
    <path d="M20.5 3.5l-6.5 17-4-6.5-6.5-4z" />
  </Svg>
);

export const IconBot = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.5" y="8" width="15" height="11" rx="3" />
    <path d="M12 4.5V8" />
    <circle cx="12" cy="4" r="0.8" fill="currentColor" />
    <circle cx="9.3" cy="13.2" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="14.7" cy="13.2" r="1.1" fill="currentColor" stroke="none" />
    <path d="M2.5 12.5v2.5M21.5 12.5v2.5" />
  </Svg>
);

export const IconSliders = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 6h9M18 6h1M5 12h3M12 12h7M5 18h11M20 18h-1" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Svg>
);

export const IconMemory = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9.5A1.5 1.5 0 0 1 19 17h-7l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5z" />
    <path d="M8 9h8M8 12.5h5" />
  </Svg>
);

export const IconPencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
);

export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4h6l-1 6 3.5 3.5h-11L10 10z" />
    <path d="M12 13.5V20" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 7h15" />
    <path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
    <path d="M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12" />
  </Svg>
);

export const IconMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="M4 7l8 6 8-6" />
  </Svg>
);

export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 6a2 2 0 0 1 2-2z" />
  </Svg>
);

export const IconMapPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Svg>
);

export const IconGlobe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5z" />
  </Svg>
);

export const IconGithub = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 19c-4 1.3-4-2-5.5-2.5M14.5 21v-3.2c0-1 .1-1.4-.5-2 2.6-.3 5.5-1.3 5.5-5.8a4.5 4.5 0 0 0-1.2-3.1 4.2 4.2 0 0 0-.1-3.1s-1-.3-3.3 1.2a11.4 11.4 0 0 0-6 0C6.6 3.5 5.6 3.8 5.6 3.8a4.2 4.2 0 0 0-.1 3.1A4.5 4.5 0 0 0 4.3 10c0 4.5 2.9 5.5 5.5 5.8-.6.6-.6 1.2-.5 2V21" />
  </Svg>
);

export const IconLinkedin = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <path d="M8 10.5V16M8 7.8v.2M11.5 16v-5.5M11.5 13c0-1.6 1-2.6 2.4-2.6s2.1.9 2.1 2.6V16" />
  </Svg>
);

export const IconSpark = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1L5 10.5l5.1-1.9z" />
    <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="9.5" r="1.6" />
    <path d="M20.5 15.5l-5-5-9.5 9" />
  </Svg>
);

export const IconImageOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 4.5h10a2 2 0 0 1 2 2v10M17.5 19.5H5.5a2 2 0 0 1-2-2v-11" />
    <path d="M20.5 15.5l-3.2-3.2M14 13l-8 6.5" />
    <path d="M3.5 3.5l17 17" />
  </Svg>
);

export const IconLetter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 3.5h7.5l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z" />
    <path d="M14 3.5V8h4.5" />
    <path d="M8.5 12.5h7M8.5 16h4.5" />
  </Svg>
);

export const IconRepeat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19.5 9" />
    <path d="M19.5 4.5V9H15" />
    <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4.5 15" />
    <path d="M4.5 19.5V15H9" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 9.5l5.5 5.5 5.5-5.5" />
  </Svg>
);

export const IconExpand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" />
  </Svg>
);

export const IconActivity = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 12h4l2.5-6 4 12 2.5-6h4" />
  </Svg>
);

export const IconFile = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 3.5h7l4.5 4.5v11.5a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
    <path d="M13.5 3.5V8H18" />
  </Svg>
);

export const IconHash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 4l-2 16M16.5 4l-2 16M4.5 9h16M3.5 15h16" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.8v.2" />
  </Svg>
);

export const IconTerminal = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M7.5 10l3 2.5-3 2.5M12.5 15.5h4" />
  </Svg>
);

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15.5V4.5M7.5 9l4.5-4.5L16.5 9" />
    <path d="M4.5 14.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
  </Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5" />
    <path d="M4.5 15.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 6.5l5.5 5.5-5.5 5.5" />
  </Svg>
);

export const IconFilter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5.5h16l-6.2 7.3v5.4l-3.6 1.8v-7.2z" />
  </Svg>
);

export const IconCheckCircle = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.3 12.3l2.6 2.6 4.9-5.2" />
  </Svg>
);

export const IconFlag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 20.5V4.5" />
    <path d="M5.5 5h11l-2.2 3.6 2.2 3.6h-11" />
  </Svg>
);

/** A page with a small portrait and lines: a resume. */
export const IconResume = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 3.5h7l4.5 4.5v11.5a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
    <path d="M13.5 3.5V8H18" />
    <circle cx="9.5" cy="10.5" r="1.6" />
    <path d="M7.7 14.2c.4-1 1-1.5 1.8-1.5s1.4.5 1.8 1.5M8 17h8" />
  </Svg>
);

export const IconGrad = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 9.5L12 5l9.5 4.5L12 14z" />
    <path d="M6.5 11.5v4c1.4 1.4 3.3 2 5.5 2s4.1-.6 5.5-2v-4M21.5 9.5v5" />
  </Svg>
);

export const IconBuilding = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="3.5" width="10" height="17" rx="1.5" />
    <path d="M15 9.5h3.5a1 1 0 0 1 1 1v10H15M8 7.5h1.5M10.5 7.5H12M8 11h1.5M10.5 11H12M8 14.5h1.5M10.5 14.5H12M9 20.5v-2.5h2v2.5" />
  </Svg>
);

/** A dial: the Overview. */
export const IconGauge = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.2 17.5a8.5 8.5 0 1 1 15.6 0" />
    <path d="M12 13.5l3.6-4.1" />
    <circle cx="12" cy="13.8" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconPause = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6v12M15 6v12" />
  </Svg>
);

export const IconStar = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.8l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z" />
  </Svg>
);

/** A small arrow for a change: up by default, rotate it for down. */
export const IconTrend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 18.5V6M6.5 11.5L12 6l5.5 5.5" />
  </Svg>
);

export const IconSort = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 18V6M4.5 9l3-3 3 3M16.5 6v12M13.5 15l3 3 3-3" />
  </Svg>
);

/** A list with ticks: the agent's rules. */
export const IconRules = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 6.5l1.5 1.5 3-3M4.5 12.5l1.5 1.5 3-3M4.5 18.5l1.5 1.5 3-3" />
    <path d="M12 6.5h7.5M12 12.5h7.5M12 18.5h5" />
  </Svg>
);

/** Four tiles: the phone's More sheet. */
export const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.5" y="4.5" width="6" height="6" rx="1.6" />
    <rect x="13.5" y="4.5" width="6" height="6" rx="1.6" />
    <rect x="4.5" y="13.5" width="6" height="6" rx="1.6" />
    <rect x="13.5" y="13.5" width="6" height="6" rx="1.6" />
  </Svg>
);

/** A door with an arrow: sign out. */
export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14" />
    <path d="M10.5 8l-4 4 4 4M6.5 12H15" />
  </Svg>
);

/** The mark: a rounded tile with a cursor and a small ember spark. `light` is for the granite sidebar. */
export function Logo({ size = 36, light = false }: { size?: number; light?: boolean }) {
  const tile = light ? '#F5F6F7' : '#15181C';
  const cursor = light ? '#15181C' : '#FFFFFF';
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <rect width="40" height="40" rx="10" fill={tile} />
      <path d="M13 11.5l14.5 7.2-6.3 1.9-2.6 6.2z" fill={cursor} stroke={cursor} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M27.5 25.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="#F07B1F" />
    </svg>
  );
}
