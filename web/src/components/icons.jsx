/** Minimal inline icon set (stroke-based) — avoids an icon dependency. */

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Svg({ children, size = 18, className, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...base}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const GridIcon = (props) => (
  <Svg {...props}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
  </Svg>
);

export const TicketIcon = (props) => (
  <Svg {...props}>
    <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.5a2.5 2.5 0 0 0 0-5z" />
    <path d="M12 7.5v9" strokeDasharray="2 3" />
  </Svg>
);

export const PlusIcon = (props) => (
  <Svg {...props}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const UsersIcon = (props) => (
  <Svg {...props}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5a5.8 5.8 0 0 1 11 0" />
    <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19.5a5.5 5.5 0 0 0-2-4.3" />
  </Svg>
);

export const ChartIcon = (props) => (
  <Svg {...props}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <rect x="7.5" y="12" width="3" height="5" rx="1" />
    <rect x="12.5" y="8" width="3" height="9" rx="1" />
    <rect x="17" y="10" width="3" height="7" rx="1" />
  </Svg>
);

export const CogIcon = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2M12 18.5v2M4.9 7.6l1.7 1M17.4 15.4l1.7 1M4.9 16.4l1.7-1M17.4 8.6l1.7-1" />
  </Svg>
);

export const BellIcon = (props) => (
  <Svg {...props}>
    <path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15z" />
    <path d="M9.8 21a2.4 2.4 0 0 0 4.4 0" />
  </Svg>
);

export const SearchIcon = (props) => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Svg>
);

export const LogOutIcon = (props) => (
  <Svg {...props}>
    <path d="M15 4h2.5A2.5 2.5 0 0 1 20 6.5v11A2.5 2.5 0 0 1 17.5 20H15" />
    <path d="M11 8l-4 4 4 4M7 12h9" />
  </Svg>
);

export const SparkIcon = (props) => (
  <Svg {...props}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    <path d="M18.5 16.5l.7 1.9 1.8.7-1.8.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
  </Svg>
);

export const MapPinIcon = (props) => (
  <Svg {...props}>
    <path d="M12 21s6.5-5.4 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.6 12 21 12 21z" />
    <circle cx="12" cy="10.5" r="2.4" />
  </Svg>
);

export const ClockIcon = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const CameraIcon = (props) => (
  <Svg {...props}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1-1.8h6.6L16.3 6h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
    <circle cx="12" cy="12.5" r="3.2" />
  </Svg>
);

export const CheckIcon = (props) => (
  <Svg {...props}>
    <path d="m5 13 4.2 4.2L19 7.5" />
  </Svg>
);

export const AlertIcon = (props) => (
  <Svg {...props}>
    <path d="M12 4.5 3.5 19.5h17z" />
    <path d="M12 10v4M12 16.8v.4" />
  </Svg>
);

export const RefreshIcon = (props) => (
  <Svg {...props}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4.5V10h-5.5" />
  </Svg>
);

export const FilterIcon = (props) => (
  <Svg {...props}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Svg>
);

export const MenuIcon = (props) => (
  <Svg {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const ShieldIcon = (props) => (
  <Svg {...props}>
    <path d="M12 3.5 5.5 6v5.5c0 4.2 2.7 7.4 6.5 9 3.8-1.6 6.5-4.8 6.5-9V6z" />
    <path d="m9.2 12.2 2 2 3.6-4" />
  </Svg>
);

export const WrenchIcon = (props) => (
  <Svg {...props}>
    <path d="M14.7 6.3a3.9 3.9 0 0 1 5.2 5.1l-1.5-1.5-2.2 2.2 1.5 1.5a3.9 3.9 0 0 1-5.1-5.2l-6 6a2 2 0 1 0 2.8 2.8l6-6" />
  </Svg>
);
