import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { cx, debounce, formatFileSize } from '../lib/format.js';
import { PRIORITY_META, PRIORITY_ORDER } from '../lib/constants.js';
import { AiInsight } from '../components/AiInsight.jsx';
import { Button, Card, CardHeader, Field, Input, Pill, Select, Textarea } from '../components/ui.jsx';
import { CameraIcon, MapPinIcon, SparkIcon } from '../components/icons.jsx';

const MAX_FILES = 6;

export function NewTicketPage() {
  const { user } = useAuth();
  const { categories, locations, zones } = useMeta();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'auto',
    priority: 'auto',
    location_id: '',
    location_text: '',
    latitude: null,
    longitude: null,
  });
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [analysing, setAnalysing] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  /* --- live AI preview (debounced, abortable) ------------------------- */
  const runPreview = useMemo(
    () =>
      debounce(async (payload) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setAnalysing(true);
        try {
          const result = await api.tickets.preview(payload, controller.signal);
          setAnalysis(result);
        } catch (error) {
          if (error?.name !== 'AbortError') setAnalysis(null);
        } finally {
          setAnalysing(false);
        }
      }, 650),
    [],
  );

  useEffect(() => {
    const text = `${form.title} ${form.description}`.trim();
    if (text.length < 12) {
      setAnalysis(null);
      return undefined;
    }
    runPreview({ title: form.title, description: form.description, location_text: form.location_text });
    return () => runPreview.cancel();
  }, [form.title, form.description, form.location_text, runPreview]);

  /* --- photo handling ------------------------------------------------- */
  const addFiles = useCallback(
    (incoming) => {
      const list = [...files];
      for (const file of incoming) {
        if (list.length >= MAX_FILES) break;
        if (!/^image\//.test(file.type) && file.type !== 'application/pdf') {
          toast.warn('Unsupported file', `${file.name} is not an image or PDF.`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.warn('File too large', `${file.name} is over 10 MB.`);
          continue;
        }
        list.push(file);
      }
      setFiles(list);
      setPreviews(list.map((file) => (file.type === 'application/pdf' ? null : URL.createObjectURL(file))));
    },
    [files, toast],
  );

  const removeFile = (index) => {
    const list = files.filter((_, position) => position !== index);
    setFiles(list);
    setPreviews(list.map((file) => (file.type === 'application/pdf' ? null : URL.createObjectURL(file))));
  };

  useEffect(() => () => previews.forEach((url) => url && URL.revokeObjectURL(url)), [previews]);

  /* --- geolocation ---------------------------------------------------- */
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.warn('Not supported', 'This browser cannot share a location.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setForm((current) => ({
          ...current,
          latitude,
          longitude,
          location_text: current.location_text || `Shared GPS ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        }));
        setLocating(false);
        toast.success('Location captured', 'GPS coordinates attached to the report.');
      },
      () => {
        setLocating(false);
        toast.warn('Location unavailable', 'Permission was denied or the position could not be resolved.');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  /* --- submit --------------------------------------------------------- */
  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setMessage(null);

    try {
      const payload = new FormData();
      payload.append('title', form.title.trim());
      payload.append('description', form.description.trim());
      payload.append('category', form.category);
      payload.append('priority', form.priority);
      if (form.location_id) payload.append('location_id', form.location_id);
      if (form.location_text) payload.append('location_text', form.location_text.trim());
      if (form.latitude != null) payload.append('latitude', form.latitude);
      if (form.longitude != null) payload.append('longitude', form.longitude);
      for (const file of files) payload.append('photos', file);

      const ticket = await api.tickets.create(payload);
      toast.success(`Ticket ${ticket.code} created`, ticket.assignee ? `Routed to ${ticket.assignee.name}.` : 'Queued for dispatch.');
      navigate(`/tickets/${ticket.id}`, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.details ?? {});
        setMessage(caught.message);
      } else {
        setMessage('Could not submit your report.');
      }
      toast.error('Submission failed', caught?.message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedLocation = locations.find((location) => String(location.id) === String(form.location_id));

  return (
    <div className="space-y-4">
      <header>
        <Pill tone="brand">
          <SparkIcon size={13} /> AI-assisted intake
        </Pill>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-white sm:text-2xl">Report a maintenance issue</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-300">
          Describe the problem in your own words. FixFlow classifies it, scores the urgency, checks for safety hazards
          and routes it to the best-matched technician — usually before you finish reading this sentence.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* Form -------------------------------------------------------- */}
        <form onSubmit={submit} className="space-y-4">
          <Card>
            <CardHeader title="What is the problem?" subtitle="Plain language is fine — the AI handles the rest" icon="📝" />

            <div className="space-y-4">
              <Field label="Short title" required error={errors.title}>
                <Input
                  value={form.title}
                  onChange={set('title')}
                  placeholder="e.g. Water leaking from the bathroom ceiling"
                  maxLength={160}
                  required
                  invalid={Boolean(errors.title)}
                />
              </Field>

              <Field
                label="Description"
                required
                error={errors.description}
                hint="Include what you saw, when it started and anything that makes it urgent."
              >
                <Textarea
                  rows={6}
                  value={form.description}
                  onChange={set('description')}
                  placeholder="Describe the fault, any noise or smell, how long it has been happening, and whether it is blocking anyone…"
                  maxLength={4000}
                  required
                  invalid={Boolean(errors.description)}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Where is it?" subtitle="Pick the site and add detail like floor or room" icon="📍" />

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Site" error={errors.location_id}>
                  <Select value={form.location_id} onChange={set('location_id')}>
                    <option value="">Not listed / other</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Exact spot" hint="Floor, room, desk, asset number…">
                  <Input
                    value={form.location_text}
                    onChange={set('location_text')}
                    placeholder="Level 7, kitchenette by the window"
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant={form.latitude != null ? 'success' : 'secondary'} size="sm" icon={<MapPinIcon size={15} />} onClick={useMyLocation} loading={locating}>
                  {form.latitude != null ? 'GPS attached' : 'Use my current location'}
                </Button>
                {form.latitude != null ? (
                  <Pill tone="ok">
                    {Number(form.latitude).toFixed(4)}, {Number(form.longitude).toFixed(4)}
                  </Pill>
                ) : (
                  <span className="text-[11px] text-ink-400">Optional — helps the dispatcher pin the fault.</span>
                )}
              </div>

              {selectedLocation ? (
                <div className="rounded-xl border border-ink-400/16 bg-ink-925/50 p-3">
                  <p className="text-xs font-semibold text-ink-100">{selectedLocation.name}</p>
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    {[selectedLocation.building, selectedLocation.floor ? `Floor ${selectedLocation.floor}` : null, selectedLocation.zone, selectedLocation.address]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {selectedLocation.lat ? (
                    <p className="mt-1 font-mono text-[10px] text-ink-500">
                      {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
                    </p>
                  ) : null}
                </div>
              ) : zones.length ? (
                <div className="flex flex-wrap gap-2">
                  {zones.map((zone) => (
                    <Pill
                      key={zone}
                      tone="neutral"
                      role="button"
                      className="cursor-pointer"
                      onClick={() => setForm((current) => ({ ...current, location_text: current.location_text || zone }))}
                    >
                      <MapPinIcon size={12} /> {zone}
                    </Pill>
                  ))}
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Photos" subtitle="Up to 6 images or PDFs, 10 MB each" icon="📷" action={<Pill tone="neutral">{files.length}/{MAX_FILES}</Pill>} />

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                addFiles(event.dataTransfer.files);
              }}
              className={cx(
                'rounded-2xl border-2 border-dashed p-5 text-center transition',
                dragging ? 'border-brand-400/70 bg-brand-500/10' : 'border-ink-400/25 bg-ink-925/40',
              )}
            >
              <CameraIcon size={22} className="mx-auto text-ink-300" />
              <p className="mt-2 text-sm font-medium text-ink-100">Drag photos here</p>
              <p className="mt-0.5 text-[11px] text-ink-400">Or browse files from your device</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(event) => addFiles(event.target.files)}
              />
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => fileInputRef.current?.click()} disabled={files.length >= MAX_FILES}>
                Choose files
              </Button>
            </div>

            {files.length ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="group relative overflow-hidden rounded-xl border border-ink-400/18 bg-ink-925/60">
                    {previews[index] ? (
                      <img src={previews[index]} alt={file.name} className="h-24 w-full object-cover" />
                    ) : (
                      <div className="flex h-24 items-center justify-center text-2xl">📄</div>
                    )}
                    <div className="p-2">
                      <p className="truncate text-[11px] font-medium text-ink-200">{file.name}</p>
                      <p className="text-[10px] text-ink-500">{formatFileSize(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="absolute top-1 right-1 rounded-lg bg-ink-950/80 px-1.5 py-0.5 text-[11px] text-danger-400 opacity-0 transition group-hover:opacity-100"
                      aria-label={`Remove ${file.name}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Overrides" subtitle="Optional — the AI suggestion applies when left on automatic" icon="🎛️" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Trade / category" hint={analysis && !analysis.skipped ? `AI suggests ${analysis.category_label}` : 'Decided after triage'}>
                <Select value={form.category} onChange={set('category')}>
                  <option value="auto">Let FixFlow decide</option>
                  {categories.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.icon} {category.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Priority" hint={analysis && !analysis.skipped ? `AI suggests ${PRIORITY_META[analysis.priority]?.label}` : 'Scored from the description'}>
                <Select value={form.priority} onChange={set('priority')}>
                  <option value="auto">Let FixFlow decide</option>
                  {PRIORITY_ORDER.map((priority) => (
                    <option key={priority} value={priority}>
                      {PRIORITY_META[priority].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {message ? (
              <p className="mt-4 rounded-xl border border-danger-400/35 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{message}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" size="lg" loading={submitting}>
                Submit report
              </Button>
              <Button variant="ghost" size="lg" onClick={() => navigate(-1)} disabled={submitting}>
                Cancel
              </Button>
              <span className="text-[11px] text-ink-400">
                Reported as {user.name} · {user.department ?? 'no department'}
              </span>
            </div>
          </Card>
        </form>

        {/* Live AI panel ---------------------------------------------- */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <AiInsight analysis={analysis} loading={analysing} />

          <Card>
            <CardHeader title="What happens on submit" subtitle="The routing pipeline" icon="⚙️" />
            <ol className="space-y-2.5">
              {[
                'Your text is classified into one of 12 trades with a confidence score.',
                'Urgency is scored 0–100 from hazard words, impact scale and sentiment.',
                'An SLA clock starts from the trade baseline and priority.',
                'A technician is matched by skill, zone, seniority and current workload.',
                'Managers and the assignee get a realtime notification instantly.',
              ].map((step, index) => (
                <li key={step} className="flex gap-2.5 text-xs leading-relaxed text-ink-300">
                  <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brand-400/40 bg-brand-500/12 text-[10px] font-bold text-brand-200">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </Card>

          {categories.length ? (
            <Card>
              <CardHeader title="Trades we cover" subtitle="Each with its own SLA baseline" icon="🛠️" />
              <div className="grid grid-cols-2 gap-2">
                {categories.map((category) => (
                  <div key={category.key} className="rounded-xl border border-ink-400/14 p-2.5">
                    <p className="text-xs font-semibold text-ink-100">
                      <span aria-hidden className="mr-1">
                        {category.icon}
                      </span>
                      {category.name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-400">{category.sla_hours}h baseline SLA</p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
