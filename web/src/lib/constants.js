/**
 * Shared vocabulary between the API and the UI.
 * Keeping labels/colours in one place means a new status only has to be added
 * once, and every badge, filter and legend picks it up automatically.
 */

export const STATUS_META = {
  NEW: { label: 'New', tone: 'info', description: 'Reported, awaiting triage' },
  TRIAGED: { label: 'Triaged', tone: 'info', description: 'Reviewed and categorised' },
  ASSIGNED: { label: 'Assigned', tone: 'brand', description: 'Technician allocated' },
  IN_PROGRESS: { label: 'In progress', tone: 'warn', description: 'Work underway on site' },
  ON_HOLD: { label: 'On hold', tone: 'neutral', description: 'Blocked — parts, access or approvals' },
  RESOLVED: { label: 'Resolved', tone: 'ok', description: 'Fix applied, awaiting confirmation' },
  CLOSED: { label: 'Closed', tone: 'ok', description: 'Confirmed complete' },
  CANCELLED: { label: 'Cancelled', tone: 'danger', description: 'Withdrawn' },
};

export const STATUS_ORDER = ['NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELLED'];
export const OPEN_STATUSES = ['NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'];

export const PRIORITY_META = {
  LOW: { label: 'Low', tone: 'neutral', rank: 1, slaMultiplier: 2 },
  MEDIUM: { label: 'Medium', tone: 'info', rank: 2, slaMultiplier: 1 },
  HIGH: { label: 'High', tone: 'warn', rank: 3, slaMultiplier: 0.5 },
  CRITICAL: { label: 'Critical', tone: 'danger', rank: 4, slaMultiplier: 0.25 },
};

export const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export const ROLE_META = {
  ADMIN: { label: 'Administrator', tone: 'danger', can: 'Everything, including staff accounts' },
  MANAGER: { label: 'Manager', tone: 'brand', can: 'Triage, assign, edit and close any ticket' },
  TECHNICIAN: { label: 'Technician', tone: 'info', can: 'Work assigned tickets, add notes and proof' },
  REQUESTER: { label: 'Reporter', tone: 'neutral', can: 'Raise tickets, track and confirm fixes' },
};

export const FLAG_META = {
  FIRE_RISK: { label: 'Fire / smoke', tone: 'danger' },
  GAS_LEAK: { label: 'Gas leak', tone: 'danger' },
  ELECTRICAL_HAZARD: { label: 'Electrical hazard', tone: 'danger' },
  CONFINED_TRAPPED: { label: 'Entrapment', tone: 'danger' },
  STRUCTURAL_RISK: { label: 'Structural risk', tone: 'danger' },
  WATER_INGRESS: { label: 'Water ingress', tone: 'warn' },
  MEDICAL: { label: 'Medical', tone: 'danger' },
  SECURITY_BREACH: { label: 'Security breach', tone: 'warn' },
  SANITATION: { label: 'Sanitation', tone: 'warn' },
  RECURRING: { label: 'Repeat failure', tone: 'warn' },
};

export const SENTIMENT_META = {
  neutral: { label: 'Neutral', tone: 'neutral' },
  concerned: { label: 'Concerned', tone: 'warn' },
  frustrated: { label: 'Frustrated', tone: 'danger' },
};

/** Fallback icons if the category list hasn't loaded yet. */
export const CATEGORY_ICONS = {
  electrical: '⚡',
  plumbing: '🚰',
  hvac: '❄️',
  elevator: '🛗',
  it_network: '📶',
  cleaning: '🧹',
  security: '🛡️',
  structural: '🏗️',
  appliance: '🔌',
  pest: '🐜',
  furniture: '🪑',
  other: '🔧',
};

export const TONE_CLASSES = {
  neutral: 'border-ink-500/30 bg-ink-500/10 text-ink-200',
  brand: 'border-brand-400/40 bg-brand-500/15 text-brand-300',
  info: 'border-info-400/35 bg-info-500/12 text-info-400',
  ok: 'border-ok-400/35 bg-ok-500/12 text-ok-400',
  warn: 'border-warn-400/40 bg-warn-500/14 text-warn-400',
  danger: 'border-danger-400/40 bg-danger-500/14 text-danger-400',
};

export const TONE_SOLID = {
  neutral: 'bg-ink-500',
  brand: 'bg-brand-500',
  info: 'bg-info-500',
  ok: 'bg-ok-500',
  warn: 'bg-warn-500',
  danger: 'bg-danger-500',
};

/** Hex equivalents — needed by chart libraries which can't read Tailwind classes. */
export const TONE_HEX = {
  neutral: '#6b76b8',
  brand: '#6366f1',
  info: '#0ea5e9',
  ok: '#22c55e',
  warn: '#f59e0b',
  danger: '#ef4444',
};

export const CHART_COLORS = ['#6366f1', '#22d3ee', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#0ea5e9', '#84cc16', '#ec4899', '#f97316', '#14b8a6', '#94a3b8'];
