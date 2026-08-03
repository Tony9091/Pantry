/** Inline stroke icons. Bundling them avoids a webfont request, which keeps
 *  the app fully functional offline. */

type Props = React.SVGProps<SVGSVGElement>

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const IconHome = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
  </svg>
)

export const IconBox = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
    <path d="m3 8 9 5 9-5" />
    <path d="M12 13v8" />
  </svg>
)

export const IconCart = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M2.5 4h2.2l2.3 11.2a1.5 1.5 0 0 0 1.5 1.2h8.9a1.5 1.5 0 0 0 1.5-1.2L21 7H6" />
    <circle cx="9.5" cy="20" r="1.4" />
    <circle cx="17.5" cy="20" r="1.4" />
  </svg>
)

export const IconBook = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 0 4 20.5V4.5Z" />
    <path d="M4 17.5A1.5 1.5 0 0 1 5.5 16H20" />
    <path d="M8.5 7.5h7" />
  </svg>
)

export const IconCalendar = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
)

export const IconCheckCircle = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.2 2.4 2.4 4.6-4.8" />
  </svg>
)

export const IconSettings = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0V21a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z" />
  </svg>
)

export const IconPlus = (p: Props) => (
  <svg {...base} strokeWidth={2.1} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconMinus = (p: Props) => (
  <svg {...base} strokeWidth={2.1} {...p}>
    <path d="M5 12h14" />
  </svg>
)

export const IconClose = (p: Props) => (
  <svg {...base} strokeWidth={2} {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

export const IconCheck = (p: Props) => (
  <svg {...base} strokeWidth={2.6} {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
)

export const IconSearch = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

export const IconAlert = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M10.3 3.8 2.4 17.2A1.9 1.9 0 0 0 4 20h16a1.9 1.9 0 0 0 1.6-2.8L13.7 3.8a1.9 1.9 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
)

export const IconClock = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.2 1.9" />
  </svg>
)

export const IconTrash = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M3.5 6h17M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" />
    <path d="M18.5 6 18 19.6a1.5 1.5 0 0 1-1.5 1.4h-9A1.5 1.5 0 0 1 6 19.6L5.5 6" />
    <path d="M10 10.5v6M14 10.5v6" />
  </svg>
)

export const IconEdit = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M4 20h4.2l10-10a2.1 2.1 0 0 0-3-3l-10 10V20Z" />
    <path d="m14.5 6.5 3 3" />
  </svg>
)

export const IconBarcode = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    <path d="M7 8v8M10.5 8v8M14 8v8M17 8v8" />
  </svg>
)

export const IconChevronRight = (p: Props) => (
  <svg {...base} {...p}>
    <path d="m9 5 7 7-7 7" />
  </svg>
)

export const IconChevronLeft = (p: Props) => (
  <svg {...base} {...p}>
    <path d="m15 5-7 7 7 7" />
  </svg>
)

export const IconSnow = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
    <path d="M12 6.5 9.8 4.4M12 6.5l2.2-2.1M12 17.5l-2.2 2.1M12 17.5l2.2 2.1" />
  </svg>
)

export const IconChef = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M6 16.5V20h12v-3.5" />
    <path d="M6.5 16.5a4 4 0 0 1-1.3-7.6 4 4 0 0 1 6.8-3.2 4 4 0 0 1 6.8 3.2 4 4 0 0 1-1.3 7.6" />
  </svg>
)

export const IconDownload = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 19h16" />
  </svg>
)

export const IconUpload = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" />
    <path d="M4 19h16" />
  </svg>
)

export const IconInbox = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M3 13h4l1.5 3h7L17 13h4" />
    <path d="M5.5 5h13l2.5 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6l2.5-8Z" />
  </svg>
)

export const IconList = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </svg>
)

export const IconSun = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)
