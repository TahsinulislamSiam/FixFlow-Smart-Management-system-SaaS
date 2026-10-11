import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, assetUrl } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { useRealtime, useRefreshOn } from '../context/RealtimeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { cx, formatDateTime, formatDuration, formatFileSize, relativeTime, titleCase } from '../lib/format.js';
import { PRIORITY_META, STATUS_META } from '../lib/constants.js';
import { AiInsight } from '../components/AiInsight.jsx';
import { FlagChips, SlaPill } from '../components/TicketCard.jsx';
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Pill,
  PriorityPill,
  ProgressBar,
  Select,
  Skeleton,
  StatusPill,
  Textarea,
} from '../components/ui.jsx';
import {
  AlertIcon,
  CameraIcon,
  CheckIcon,
  ClockIcon,
  MapPinIcon,
  PlusIcon,
  RefreshIcon,
  SparkIcon,
  TicketIcon,
  WrenchIcon,
} from '../components/icons.jsx';

const EVENT_META = {
  CREATED: { icon: '📝', label: 'Reported' },
  AI_TRIAGE: { icon: '🤖', label: 'AI triage' },
  ASSIGNED: { icon: '🧰', label: 'Assignment' },
  ASSIGNMENT_DEFERRED: { icon: '⏳', label: 'Awaiting dispatch' },
  STATUS_CHANGED: { icon: '🔄', label: 'Status change' },
  PRIORITY_CHANGED: { icon: '⚡', label: 'Priority' },
  CATEGORY_CHANGED: { icon: '🏷️', label: 'Category' },
  COMMENTED: { icon: '💬', label: 'Comment' },
  ATTACHMENT: { icon: '📷', label: 'Photo' },
  SLA_BREACH: { icon: '⏰', label: 'SLA breach' },
  REOPENED: { icon: '↩️', label: 'Reopened' },
  SAFETY_FLAG: { icon: '⚠️', label: 'Safety flag' },
  UPDATED: { icon: '✏️', label: 'Updated' },
};

function EventIcon({ type }) {
  return <span aria-hidden>{EVENT_META[type]?.icon ?? '•'}</span>;
}

function Timeline({ events = [] }) {
  return (
    <ol className="relative space-y-4 pl-5">
      <span className="absolute top-2 bottom-2 left-[7px] w-px bg-gradient-to-b from-brand-400/40 via-ink-400/20 to-transparent" aria-hidden />
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute top-0.5 -left-5 flex h-4 w-4 items-center justify-center rounded-full border border-ink-400/30 bg-ink-900 text-[10px]">
            <EventIcon type={event.type} />
          </span>
          <div className="rounded-xl border border-ink-400/12 bg-white/[0.02] p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-ink-300 uppercase">
                {EVENT_META[event.type]?.label ?? titleCase(event.type)}
              </span>
              {event.from_value && event.to_value ? (
                <span className="flex items-center gap-1.5 text-[11px] text-ink-400">
                  <StatusPill status={event.from_value} className="!px-1.5 !py-0.5 !text-[10px]" />
                  →
                  <StatusPill status={event.to_value} className="!px-1.5 !py-0.5 !text-[10px]" />
                </span>
              ) : null}
              <span className="ml-auto text-[10px] text-ink-500">{relativeTime(event.created_at)}</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-200">{event.message}</p>
            <p className="mt-1 text-[10px] text-ink-500">{event.actor_name ?? 'FixFlow system'}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* Assignment panel                                                           */
/* -------------------------------------------------------------------------- */

function AssignmentPanel({ ticket, owner }) {
  const { user, isManager } = useAuth();
  const toast = useToast();
  const [suggestions, setSuggestions] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const loadSuggestions = useCallback(async () => {
    if (!isManager) return;
    setLoadingSuggestions(true);
    try {
      setSuggestions(await api.tickets.suggestions(ticket.id));
    } catch {
      setSuggestions(null);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [isManager, ticket.id]);

  useEffect(() => {
    if (isManager) loadSuggestions();
  }, [isManager, loadSuggestions]);

  const assign = async (assigneeId, mode = 'MANUAL') => {
    setAssigning(true);
    try {
      const updated = await api.tickets.assign(ticket.id, { assignee_id: assigneeId, mode });
      toast.success(mode === 'AUTO' ? 'Auto-assigned' : 'Assignment updated', assigneeId ? 'The technician has been notified.' : 'Ticket returned to the queue.');
      owner(updated);
      loadSuggestions();
    } catch (caught) {
      toast.error('Could not assign', caught?.message);
    } finally {
      setAssigning(false);
    }
  };

  if (!isManager && ticket.status === 'NEW') {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <span className="mt-0.5"><WrenchIcon size={18} className="text-accent-400" /></span>
          <div>
            <p className="text-sm font-semibold text-ink-100">Waiting for dispatch</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-400">
              A manager will route this to a technician. You will be notified the moment it happens.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Assignment</h2>
          <p className="mt-0.5 text-[11px] text-ink-400">Skill · workload · zone aware routing</p>
        </div>
        {ticket.assignee ? (
          <div className="flex items-center gap-2 rounded-xl border border-ink-400/18 bg-ink-925/50 p-2">
            <Avatar user={ticket.assignee} size={30} />
            <div>
              <p className="text-xs font-semibold text-ink-100">{ticket.assignee.name}</p>
              <p className="text-[10px] text-ink-400">{ticket.assignee.email}</p>
            </div>
          </div>
        ) : (
          <Pill tone="warn">Unassigned</Pill>
        )}
      </div>

      {isManager ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant={ticket.assignee ? 'outline' : 'success'} size="sm" icon={<PlusIcon size={15} />} loading={assigning} onClick={() => assign(ticket.assignee ? null : -1, ticket.assignee ? 'MANUAL' : 'AUTO')}>
              {ticket.assignee ? 'Return to queue' : 'Auto-assign best fit'}
            </Button>
            <Button variant="secondary" size="sm" icon={<RefreshIcon size={14} className={loadingSuggestions ? 'animate-spin' : undefined} />} onClick={loadSuggestions}>
              Refresh matches
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {loadingSuggestions ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              (suggestions ?? []).slice(0, 5).map((suggestion) => (
                <div
                  key={suggestion.technician.id}
                  className={cx(
                    'rounded-xl border p-3 transition',
                    suggestion.technician.id === ticket.assignee_id ? 'border-brand-400/50 bg-brand-500/10' : 'border-ink-400/14 bg-ink-925/40',
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar user={suggestion.technician} size={32} online={suggestion.available} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-ink-100">
                          {suggestion.technician.name}
                          <span className="ml-1.5 text-[10px] text-ink-400">
                            {suggestion.technician.level} · {suggestion.technician.zone ?? 'any zone'}
                          </span>
                        </p>
                        <span className={cx('text-xs font-bold', suggestion.score >= 70 ? 'text-ok-400' : suggestion.score >= 45 ? 'text-warn-400' : 'text-ink-400')}>
                          {Math.round(suggestion.score)}%
                        </span>
                      </div>
                      <ProgressBar value={suggestion.score} tone={suggestion.score >= 70 ? 'ok' : suggestion.score >= 45 ? 'warn' : 'neutral'} className="mt-1.5" />
                      <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
                        {`${suggestion.open_tickets} open · ${suggestion.reasons.slice(0, 2).join(' · ')}`}
                      </p>
                    </div>
                    <Button
                      variant={suggestion.technician.id === ticket.assignee_id ? 'success' : 'secondary'}
                      size="xs"
                      disabled={assigning}
                      onClick={() => assign(suggestion.technician.id, 'MANUAL')}
                    >
                      {suggestion.technician.id === ticket.assignee_id ? 'Assigned' : 'Assign'}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-ink-500">
            Scores blend exact trade match, urgency-sensitive seniority, spare capacity, zone proximity and on-time track record — every decision is logged.
          </p>
        </>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Status actions                                                             */
/* -------------------------------------------------------------------------- */

function StatusActions({ ticket, owner }) {
  const { user } = useAuth();
  const toast = useToast();
  const [pending, setPending] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const allowed = ticket.available_transitions ?? [];

  const canSelfPickup =
    user.role === 'TECHNICIAN' && !ticket.assignee_id && ['NEW', 'TRIAGED'].includes(ticket.status) && allowed.includes('ASSIGNED');

  const perform = async (status) => {
    setPending(status);
    setBusy(true);
    try {
      const updated = await api.tickets.setStatus(ticket.id, status, note.trim() || undefined);
      toast.success(`Ticket ${STATUS_META[status]?.label}`, note.trim() || (
        status === 'RESOLVED' ? 'The reporter will be asked to confirm the fix.' : undefined
      ));
      owner(updated);
      setNote('');
    } catch (caught) {
      toast.error('Status not changed', caught?.message ?? 'That transition is not allowed.');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const hasAny = allowed.length > 0;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Status</h2>
          <p className="mt-0.5 text-[11px] text-ink-400">Current: {STATUS_META[ticket.status]?.label}</p>
        </div>
        <StatusPill status={ticket.status} />
      </div>

      {canSelfPickup ? (
        <Button variant="success" size="md" className="w-full" icon={<WrenchIcon size={16} />} loading={busy && pending === 'ASSIGNED'} onClick={() => perform('ASSIGNED')}>
          Pick this up
        </Button>
      ) : null}

      {hasAny ? (
        <>
          <div className="flex flex-wrap gap-2">
            {allowed.map((status) => (
              <Button
                key={status}
                variant={status === 'RESOLVED' ? 'success' : status === 'CANCELLED' ? 'danger' : status === 'IN_PROGRESS' ? 'primary' : 'secondary'}
                size="sm"
                loading={busy && pending === status}
                disabled={busy || (user.role === 'REQUESTER' && !['CLOSED', 'CANCELLED', 'IN_PROGRESS'].includes(status))}
                onClick={() => perform(status)}
              >
                {status === 'RESOLVED' ? 'Mark resolved' : status === 'IN_PROGRESS' ? 'Start work' : STA_statusLabel(status)}
              </Button>
            ))}
          </div>

          {allowed.some((status) => ['RESOLVED', 'CLOSED', 'CANCELLED', 'ON_HOLD', 'IN_PROGRESS'].includes(status)) ? (
            <Field label="Note for the timeline (optional)" className="mt-3">
              <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Short summary of what was done, found or blocked…" />
            </Field>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-ink-400">No further transitions are available for this ticket.</p>
      )}
    </Card>
  );
}

/** Tiny helper to keep transition button labels readable. */
function STA_statusLabel(status) {
  const labels = {
    TRIAGED: 'Accept & triage',
    ASSIGNED: 'Assign',
    CLOSED: 'Confirm & close',
    IN_PROGRESS: 'Re-open work',
    ON_HOLD: 'Put on hold',
  };
  return labels[status] ?? titleCase(status);
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export function TicketDetailPage() {
  const { id } = useParams();
  const { user, isManager, isTechnician } = useAuth();
  const { categoryName, categoryIcon, categories } = useMeta();
  const navigate = useNavigate();
  const toast = useToast();
  const { joinTicket } = useRealtime();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Edit & comment state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', category: '', priority: '', location_text: '' });
  const [editErrors, setEditErrors] = useState({});
  const [editBusy, setEditBusy] = useState(false);

  const [commentText, setCommentText] = useState('');
  const [internalNote, setInternalNote] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentFiles, setCommentFiles] = useState([]);
  const [commentFilePreviews, setCommentFilePreviews] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const fileInputRef = useRef(null);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const result = await api.tickets.get(id);
        setTicket(result);
        setError(null);
      } catch (caught) {
        setError(caught?.message ?? 'Could not load this ticket.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    load();
  }, [load, id]);

  // Focused ticket room + auto-refresh on changes to this ticket.
  useEffect(() => joinTicket(Number(id)), [id, joinTicket]);
  useRefreshOn(['ticket:status', 'ticket:assigned', 'ticket:commented', 'ticket:attachment'], () => load({ silent: true }), [id]);

  const owner = (updated) => {
    setTicket(updated);
  };

  const openEdit = () => {
    if (!ticket) return;
    setEditForm({
      title: ticket.title,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      location_text: ticket.location_text ?? '',
    });
    setEditErrors({});
    setEditOpen(true);
  };

  const saveEdit = async () => {
    setEditBusy(true);
    setEditErrors({});
    try {
      const updated = await api.tickets.update(id, {
        title: editForm.title,
        description: editForm.description,
        category: editForm.category,
        priority: editForm.priority,
        location_text: editForm.location_text || null,
      });
      toast.success('Ticket updated', 'The changes are on the timeline for everyone involved.');
      owner(updated);
      setEditOpen(false);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setEditErrors(caught.details ?? {});
        toast.error('Could not save', caught.message);
      }
    } finally {
      setEditBusy(false);
    }
  };

  const sendComment = async () => {
    if (!commentText.trim() && !commentFiles.length) return;
    setCommentBusy(true);
    try {
      if (commentText.trim()) {
        const updated = await api.tickets.comment(id, commentText.trim(), internalNote);
        owner(updated);
        setCommentText('');
        setInternalNote(false);
      }
      if (commentFiles.length) {
        const form = new FormData();
        commentFiles.forEach((file) => form.append('photos', file));
        form.append('phase', commentFiles.some((file) => /image/.test(file.type)) ? 'REPORT' : 'REPORT');
        setUploading(true);
        const result = await api.tickets.upload(id, form);
        owner(result.ticket);
        setCommentFiles([]);
        setCommentFilePreviews([]);
        setUploading(false);
        toast.success('Photos attached', 'Added to the ticket so the team can see the current state.');
      }
    } catch (caught) {
      toast.error('Could not post', caught?.message);
    } finally {
      setCommentBusy(false);
      setUploading(false);
    }
  };

  const addCommentFiles = (incoming) => {
    const list = [...commentFiles];
    const previews = [...commentFilePreviews];
    for (const file of incoming) {
      if (list.length >= 6) break;
      list.push(file);
      previews.push(/^image\//.test(file.type) ? URL.createObjectURL(file) : null);
    }
    setCommentFiles(list);
    setCommentFilePreviews(previews);
  };

  const canEdit = isManager || ticket?.requester_id === user.id;

  if (loading && !ticket) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  if (error && !ticket) return <ErrorState message={error} onRetry={() => load()} />;
  if (!ticket) return <ErrorState message="This ticket no longer exists." onRetry={() => navigate('/tickets')} />;

  const canComment = true;
  const reportPhotos = ticket.attachments?.filter((attachment) => attachment.phase === 'REPORT') ?? [];
  const resolutionPhotos = ticket.attachments?.filter((attachment) => attachment.phase === 'RESOLUTION') ?? [];

  return (
    <div className="space-y-4">
      {/* Header ---------------------------------------------------------- */}
      <section className="surface surface-raised relative overflow-hidden p-5">
        <div className="absolute -top-20 -right-10 h-52 w-52 rounded-full bg-brand-500/10 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => navigate(-1)} className="rounded-lg px-2 py-1 text-xs text-ink-400 transition hover:bg-white/5 hover:text-ink-200">
              ← Back
            </button>
            <span className="font-mono text-xs text-ink-400">{ticket.code}</span>
            <StatusPill status={ticket.status} />
            <PriorityPill priority={ticket.priority} />
            <SlaPill ticket={ticket} />
            <FlagChips flags={ticket.ai?.flags} />
          </div>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <h1 className="max-w-3xl text-xl leading-snug font-bold tracking-tight text-white sm:text-2xl">{ticket.title}</h1>
            <div className="flex flex-wrap gap-2">
              {canEdit ? (
                <Button variant="secondary" size="sm" onClick={openEdit}>
                  ✏️ Edit
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" icon={<RefreshIcon size={14} className={refreshing ? 'animate-spin' : undefined} />} onClick={() => load({ silent: true })}>
                Refresh
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-base leading-none" aria-hidden>
                {categoryIcon(ticket.category)}
              </span>
              {categoryName(ticket.category)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPinIcon size={13} />
              {ticket.location_text ?? ticket.zone ?? 'No location recorded'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon size={13} />
              Raised {relativeTime(ticket.created_at)}
            </span>
            {ticket.ai?.estimated_hours ? (
              <span className="inline-flex items-center gap-1.5">
                <WrenchIcon size={13} />
                Est. {formatDuration(ticket.ai.estimated_hours * 60)} effort
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        {/* Main column ---------------------------------------------------- */}
        <div className="space-y-4">
          {/* People */}
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-xl border border-ink-400/14 p-3">
                <Avatar user={ticket.requester} size={38} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-ink-100">{ticket.requester?.name ?? 'Unknown'}</p>
                  <p className="text-[10px] text-ink-400">Reporter · {ticket.requester?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-ink-400/14 p-3">
                <Avatar user={ticket.assignee} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink-100">
                    {ticket.assignee ? ticket.assignee.name : 'No technician yet'}
                  </p>
                  <p className="text-[10px] text-ink-400">
                    {ticket.assignee ? `Technician · ${ticket.assignee.email}` : 'Waiting for dispatch'}
                  </p>
                </div>
                {ticket.assignee ? <Pill tone="ok">handling</Pill> : null}
              </div>
            </div>
          </Card>

          {/* Description */}
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-xs font-bold tracking-[0.14em] text-ink-300 uppercase">Problem description</h2>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink-200">{ticket.description}</p>

            {reportPhotos.length ? (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">Photos ({reportPhotos.length})</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {reportPhotos.map((photo, index) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setLightbox({ url: assetUrl(photo.url), title: photo.filename })}
                      className="group relative aspect-video overflow-hidden rounded-xl border border-ink-400/18 bg-ink-925/60"
                    >
                      <img src={assetUrl(photo.url)} alt={photo.filename} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                      <span className="absolute right-1.5 bottom-1.5 rounded-md bg-ink-950/70 px-1.5 py-0.5 text-[9px] text-ink-200 opacity-0 transition group-hover:opacity-100">
                        ⤢ View
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {resolutionPhotos.length ? (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">Proof of resolution ({resolutionPhotos.length})</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {resolutionPhotos.map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setLightbox({ url: assetUrl(photo.url), title: photo.filename })}
                      className="group relative aspect-video overflow-hidden rounded-xl border border-ok-400/25 bg-ink-925/60"
                    >
                      <img src={assetUrl(photo.url)} alt={photo.filename} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                      <span className="absolute top-1.5 left-1.5 rounded-md bg-ok-500/85 px-1.5 py-0.5 text-[9px] font-bold text-white">Fixed</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          {/* AI insight */}
          <AiInsight
            variant="full"
            analysis={{
              category_label: categoryName(ticket.category),
              category: ticket.category,
              priority: ticket.priority,
              urgency: ticket.ai?.urgency ?? 0,
              confidence: ticket.ai?.confidence ?? 0.5,
              sentiment: 'neutral',
              flags: ticket.ai?.flags ?? [],
              tags: ticket.ai?.tags ?? [],
              summary: ticket.ai?.summary,
              suggested_actions: [],
              drivers: [],
              estimated_hours: ticket.ai?.estimated_hours,
              source: ticket.ai?.source,
              model: ticket.ai?.model,
            }}
          />

          {/* Comments */}
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold tracking-[0.14em] text-ink-300 uppercase">
                Conversation ({ticket.comments?.length})
              </h2>
              <SlaPill ticket={ticket} />
            </div>

            {ticket.comments?.length ? (
              <div className="space-y-3">
                {ticket.comments.map((comment) => (
                  <div key={comment.id} className={cx('rounded-xl border p-3', comment.is_internal ? 'border-warn-400/25 bg-warn-500/6' : 'border-ink-400/14 bg-ink-925/40')}>
                    <div className="flex items-center gap-2">
                      <Avatar user={{ name: comment.author_name, avatar_color: comment.author_color }} size={26} />
                      <span className="text-xs font-semibold text-ink-100">{comment.author_name}</span>
                      {comment.is_internal ? <Pill tone="warn">Internal note</Pill> : null}
                      <span className="ml-auto text-[10px] text-ink-500">{relativeTime(comment.created_at)}</span>
                    </div>
                    <p className={cx('mt-2 text-sm leading-relaxed whitespace-pre-wrap', comment.is_internal ? 'text-warn-100/90 text-ink-200' : 'text-ink-200')}>
                      {comment.body}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon="💬"
                title="No comments yet"
                description={
                  user.role === 'REQUESTER'
                    ? 'The technician or dispatch team will reply here.'
                    : 'Add the first note — even internal-only ones stay in the audit trail.'
                }
              />
            )}

            {canComment ? (
              <div className="mt-4 border-t border-ink-400/12 pt-4">
                {isManager || isTechnician ? (
                  <Checkbox
                    label="Internal note (hidden from the reporter)"
                    checked={internalNote}
                    onChange={(event) => setInternalNote(event.target.checked)}
                    className="mb-2"
                  />
                ) : null}
                <Textarea
                  rows={3}
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder={internalNote ? 'Something only the team should see…' : 'Reply to this ticket…'}
                />

                {commentFiles.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {commentFiles.map((file, index) => (
                      <div key={index} className="relative">
                        {commentFilePreviews[index] ? (
                          <img src={commentFilePreviews[index]} alt={file.name} className="h-16 w-16 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-ink-400/20 text-xl">📄</div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setCommentFiles(commentFiles.filter((_, position) => position !== index));
                            setCommentFilePreviews(commentFilePreviews.filter((_, position) => position !== index));
                          }}
                          className="absolute -top-1 -right-1 rounded-full bg-ink-950 px-1 text-[10px] text-danger-400"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button variant="primary" size="sm" icon={<CheckIcon size={15} />} loading={commentBusy || uploading} onClick={sendComment} disabled={!commentText.trim() && !commentFiles.length}>
                    Send
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<CameraIcon size={15} />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={commentFiles.length >= 6}
                  >
                    Attach photo{commentFiles.length ? ` (${commentFiles.length})` : ''}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(event) => addCommentFiles(event.target.files)}
                  />
                  <span className="text-[10px] text-ink-400">First staff reply starts the response-time clock.</span>
                </div>
              </div>
            ) : null}
          </Card>

          {/* Timeline */}
          <Card>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold tracking-[0.14em] text-ink-300 uppercase">Timeline</h2>
              <span className="text-[10px] text-ink-500">{ticket.events?.length ?? 0} events · audit trail</span>
            </div>
            <Timeline events={ticket.events ?? []} />
          </Card>
        </div>

        {/* Right rail ------------------------------------------------------ */}
        <div className="space-y-4">
          <StatusActions ticket={ticket} owner={owner} />

          <AssignmentPanel ticket={ticket} owner={owner} />

          <Card>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-xs font-bold tracking-[0.14em] text-ink-300 uppercase">Service details</h2>
            </div>
            <dl className="space-y-2.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-400">Created</dt>
                <dd className="text-right text-ink-200">{formatDateTime(ticket.created_at)}</dd>
              </div>
              {ticket.first_response_at ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-400">First response</dt>
                  <dd className="text-right font-mono text-ink-200">
                    {formatDateTime(ticket.first_response_at)}
                    <span className="ml-1 text-[10px] text-accent-400">({formatDuration(ticket.time_to_first_response_minutes)})</span>
                  </dd>
                </div>
              ) : null}
              {ticket.resolved_at ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-400">Resolved</dt>
                  <dd className="text-right font-mono text-ink-200">
                    {formatDateTime(ticket.resolved_at)}
                    <span className="ml-1 text-[10px] text-ok-400">({formatDuration(ticket.time_to_resolve_minutes)})</span>
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-ink-400">SLA due</dt>
                <dd className="text-right text-ink-200">
                  {ticket.sla_due_at ? `${formatDateTime(ticket.sla_due_at)} · ${formatDuration(ticket.sla_due_in_minutes)}` : 'No SLA'}
                </dd>
              </div>
              {ticket.reopen_count > 0 ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-400">Reopen count</dt>
                  <dd className="text-right text-warn-400">{ticket.reopen_count}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-ink-400">Source</dt>
                <dd className="text-right text-ink-200">{ticket.source}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-400">Trade</dt>
                <dd className="text-right text-ink-200">
                  {categoryIcon(ticket.category)} {categoryName(ticket.category)}
                </dd>
              </div>
            </dl>

            {typeof ticket.ai?.urgency === 'number' ? (
              <div className="mt-4 border-t border-ink-400/12 pt-3">
                <div className="mb-1 flex items-center justify-between text-[11px] text-ink-400">
                  <span className="font-semibold tracking-wide uppercase">AI urgency</span>
                  <span className="text-ink-200">{ticket.ai.urgency}/100</span>
                </div>
                <ProgressBar value={ticket.ai.urgency} tone={ticket.ai.urgency >= 70 ? 'danger' : ticket.ai.urgency >= 45 ? 'warn' : 'ok'} />
                <p className="mt-2 text-[10px] leading-relaxed text-ink-500">
                  Triaged by {ticket.ai.source === 'llm' ? 'LLM + heuristic' : 'heuristic'} model · suggestion, overridable by managers.
                </p>
              </div>
            ) : null}

            {ticket.ai?.tags?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-ink-400/12 pt-3">
                {ticket.ai.tags.map((tag) => (
                  <Pill key={tag} tone="neutral">
                    #{tag}
                  </Pill>
                ))}
              </div>
            ) : null}
          </Card>

          <Card>
            <div className="flex items-start gap-3">
              <span className="mt-0.5"><SparkIcon size={17} className="text-accent-400" /></span>
              <p className="text-[11px] leading-relaxed text-ink-400">
                Every change — status, assignment, priority, photo and comment — is logged to this timeline and pushed
                to the people involved over a live websocket.
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* Edit modal ------------------------------------------------------ */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit ticket"
        subtitle="Changes are recorded to the audit trail with your name."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={editBusy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveEdit} loading={editBusy}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" required error={editErrors.title}>
            <Input value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} invalid={Boolean(editErrors.title)} />
          </Field>
          <Field label="Description" required error={editErrors.description}>
            <Textarea rows={5} value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} invalid={Boolean(editErrors.description)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Trade">
              <Select value={editForm.category} onChange={(event) => setEditForm({ ...editForm, category: event.target.value })}>
                {(categories ?? []).map((category) => (
                  <option key={category.key} value={category.key}>
                    {categoryIcon(category.key)} {categoryName(category.key)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" hint="Changing priority re-baselines the SLA clock.">
              <Select value={editForm.priority} onChange={(event) => setEditForm({ ...editForm, priority: event.target.value })}>
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_META[priority].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Exact location">
            <Input value={editForm.location_text} onChange={(event) => setEditForm({ ...editForm, location_text: event.target.value })} placeholder="Floor, room, asset…" />
          </Field>
          {!isManager && <p className="text-[11px] text-ink-400">Only the reporter and management can edit a ticket.</p>}
        </div>
      </Modal>

      {/* Lightbox -------------------------------------------------------- */}
      <Modal open={Boolean(lightbox)} onClose={() => setLightbox(null)} title={lightbox?.title ?? 'Photo'} size="lg" closeOnBackdrop>
        {lightbox ? (
          <div className="flex justify-center">
            <img src={lightbox.url} alt={lightbox.title} className="max-h-[68vh] rounded-xl object-contain" />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

// (category options are now read from MetaContext directly in TicketDetailPage)