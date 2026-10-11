import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { cx, formatDate } from '../lib/format.js';
import { ROLE_META } from '../lib/constants.js';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Field,
  Input,
  Pill,
  Select,
} from '../components/ui.jsx';
import { CogIcon, ShieldIcon } from '../components/icons.jsx';

const emptyProfile = { name: '', phone: '', title: '', department: '', zone: '' };

export function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const { zones, categories } = useMeta();
  const toast = useToast();
  const isTechnician = user?.role === 'TECHNICIAN';

  const [profile, setProfile] = useState(emptyProfile);
  const [profileErrors, setProfileErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwd, setPwd] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwdErrors, setPwdErrors] = useState({});
  const [savingPwd, setSavingPwd] = useState(false);

  const [skills, setSkills] = useState([]);
  const [available, setAvailable] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfile({
      name: user.name ?? '',
      phone: user.phone ?? '',
      title: user.title ?? '',
      department: user.department ?? '',
      zone: user.zone ?? '',
    });
    setSkills(user.skills ?? []);
    setAvailable(user.is_available ?? true);
  }, [user]);

  const setProfileField = (key) => (event) => setProfile((current) => ({ ...current, [key]: event.target.value }));

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileErrors({});
    try {
      await updateProfile(Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== '')));
      toast.success('Profile saved', 'Your contact details are up to date.');
    } catch (caught) {
      if (caught instanceof ApiError) {
        setProfileErrors(caught.details ?? {});
        toast.error('Could not save', caught.message);
      } else {
        toast.error('Could not save', caught?.message ?? 'An unexpected error occurred.');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (pwd.new_password.length < 8) nextErrors.new_password = 'Use at least 8 characters.';
    if (pwd.new_password !== pwd.confirm) nextErrors.confirm = 'The two passwords do not match.';
    setPwdErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSavingPwd(true);
    try {
      await updateProfile({ current_password: pwd.current_password, new_password: pwd.new_password });
      toast.success('Password changed', 'Use the new password next time you sign in.');
      setPwd({ current_password: '', new_password: '', confirm: '' });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setPwdErrors(caught.details ?? {});
        if (!caught.details?.current_password) toast.error('Could not change', caught.message);
      } else {
        toast.error('Could not change', caught?.message ?? 'An unexpected error occurred.');
      }
    } finally {
      setSavingPwd(false);
    }
  };

  const toggleSkill = (key) =>
    setSkills((current) => (current.includes(key) ? current.filter((skill) => skill !== key) : [...current, key]));

  const savePrefs = async (event) => {
    event.preventDefault();
    setSavingPrefs(true);
    try {
      await updateProfile({ skills, is_available: available });
      toast.success('Preferences saved', isTechnician ? 'Your skills and availability are updated.' : 'Settings saved.');
    } catch (caught) {
      toast.error('Could not save', caught?.message ?? 'An unexpected error occurred.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const restoreDefaults = () => {
    setSkills(user?.skills ?? []);
    setAvailable(user?.is_available ?? true);
  };

  return (
    <div className="space-y-5">
      <header>
        <Pill tone="brand">
          <CogIcon size={13} /> Account settings
        </Pill>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-white sm:text-2xl">Profile & preferences</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-300">
          Your contact details, security and — for technicians — the skills and availability that feed smart assignment.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {/* Profile ---------------------------------------------------- */}
          <form onSubmit={saveProfile}>
            <Card>
              <CardHeader title="Profile" subtitle="Shown on your tickets and in the team directory" icon="👤" action={<Pill tone="neutral">{ROLE_META[user?.role]?.label ?? user?.role}</Pill>} />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" required error={profileErrors.name}>
                  <Input value={profile.name} onChange={setProfileField('name')} invalid={Boolean(profileErrors.name)} required minLength={2} />
                </Field>
                <Field label="Email" hint="Sign-in identity — cannot be changed here">
                  <Input value={user?.email ?? ''} disabled />
                </Field>
                <Field label="Phone">
                  <Input value={profile.phone} onChange={setProfileField('phone')} placeholder="+44 7000 000000" />
                </Field>
                <Field label="Job title">
                  <Input value={profile.title} onChange={setProfileField('title')} placeholder="e.g. Facilities technician" />
                </Field>
                <Field label="Department">
                  <Input value={profile.department} onChange={setProfileField('department')} placeholder="e.g. Facilities" />
                </Field>
                <Field label="Coverage zone">
                  <Select value={profile.zone} onChange={setProfileField('zone')}>
                    <option value="">No zone</option>
                    {zones.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-400/10 pt-4">
                <Button type="submit" variant="primary" loading={savingProfile}>
                  Save profile
                </Button>
                <span className="text-[11px] text-ink-400">
                  Fields left blank are cleared.
                </span>
              </div>
            </Card>
          </form>

          {/* Password --------------------------------------------------- */}
          <form onSubmit={savePassword}>
            <Card>
              <CardHeader title="Security" subtitle="Change your password — current one required" icon="🔐" />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Current password" error={pwdErrors.current_password}>
                  <Input type="password" value={pwd.current_password} onChange={(event) => setPwd((current) => ({ ...current, current_password: event.target.value }))} invalid={Boolean(pwdErrors.current_password)} placeholder="••••••••" />
                </Field>
                <Field label="New password" error={pwdErrors.new_password} hint="Min 8 characters">
                  <Input type="password" value={pwd.new_password} onChange={(event) => setPwd((current) => ({ ...current, new_password: event.target.value }))} invalid={Boolean(pwdErrors.new_password)} placeholder="••••••••" minLength={8} />
                </Field>
                <Field label="Confirm new password" error={pwdErrors.confirm}>
                  <Input type="password" value={pwd.confirm} onChange={(event) => setPwd((current) => ({ ...current, confirm: event.target.value }))} invalid={Boolean(pwdErrors.confirm)} placeholder="••••••••" />
                </Field>
              </div>

              <div className="mt-4 border-t border-ink-400/10 pt-4">
                <Button type="submit" variant="secondary" loading={savingPwd}>
                  Change password
                </Button>
              </div>
            </Card>
          </form>

          {/* Technician preferences -------------------------------------- */}
          {isTechnician ? (
            <form onSubmit={savePrefs}>
              <Card>
                <CardHeader
                  title="Assignment preferences"
                  subtitle="These signals decide which jobs are routed to you"
                  icon="🧰"
                  action={
                    <Button variant="ghost" size="xs" onClick={restoreDefaults} type="button">
                      Revert
                    </Button>
                  }
                />

                <div className="rounded-xl border border-ink-400/14 bg-ink-925/40 p-3">
                  <Checkbox
                    label="Available for new assignments"
                    checked={available}
                    onChange={(event) => setAvailable(event.target.checked)}
                  />
                  <p className="mt-1 pl-6 text-[11px] leading-relaxed text-ink-400">
                    {available
                      ? 'You appear in the roster and the assignment engine can route new jobs to you.'
                      : 'You are paused — new jobs are routed to other technicians until you switch this back on.'}
                  </p>
                </div>

                <div className="mt-4">
                  <Field label="Skills" hint="Tap the trades you are qualified for. Matching is skill-first, then zone, then seniority.">
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map((category) => {
                        const active = skills.includes(category.key);
                        return (
                          <button
                            key={category.key}
                            type="button"
                            onClick={() => toggleSkill(category.key)}
                            className={cx(
                              'rounded-xl border px-2.5 py-1.5 text-xs font-medium transition',
                              active
                                ? 'border-brand-400/60 bg-brand-500/20 text-brand-200'
                                : 'border-ink-400/20 bg-white/4 text-ink-300 hover:border-brand-400/35',
                            )}
                          >
                            <span aria-hidden className="mr-1">
                              {category.icon}
                            </span>
                            {category.name}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                </div>

                <div className="mt-4 border-t border-ink-400/10 pt-4">
                  <Button type="submit" variant="primary" loading={savingPrefs}>
                    Save preferences
                  </Button>
                </div>
              </Card>
            </form>
          ) : null}
        </div>

        {/* Side column -------------------------------------------------- */}
        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader title="Your account" icon="🪪" />
            <div className="flex items-center gap-3">
              <Avatar user={user} size={52} />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{user?.name}</p>
                <Pill tone={ROLE_META[user?.role]?.tone ?? 'neutral'} className="mt-1">
                  {ROLE_META[user?.role]?.label ?? user?.role}
                </Pill>
              </div>
            </div>
            <div className="mt-4 space-y-2 border-t border-ink-400/10 pt-4 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-400">Member since</span>
                <span className="font-medium text-ink-100">{formatDate(user?.created_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-400">Jobs carried</span>
                <span className="font-medium text-ink-100">{user?.open_tickets ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-400">Zone</span>
                <span className="font-medium text-ink-100">{user?.zone ?? '—'}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="How smart assignment reads you" icon={<ShieldIcon size={16} />} />
            <ul className="space-y-3">
              {[
                { icon: '🛠️', title: 'Skills first', body: 'Only technicians holding the matching trade are considered for a job.' },
                { icon: '📍', title: 'Then zone', body: 'Between qualified people, the closest coverage zone breaks ties.' },
                { icon: '📊', title: 'Then load & tenure', body: 'Lightest queue wins, with a seniority nudge on hard jobs.' },
                { icon: '⏸️', title: 'Availability respected', body: 'Paused technicians are excluded entirely until they opt back in.' },
              ].map((item) => (
                <li key={item.title} className="flex gap-2.5">
                  <span className="text-base leading-none" aria-hidden>
                    {item.icon}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-ink-100">{item.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-400">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Your demo password" icon="🔑" />
            <p className="text-xs leading-relaxed text-ink-300">
              The seed accounts share the strength of the demo password{' '}
              <code className="rounded-md border border-ink-400/20 bg-ink-925 px-1.5 py-0.5 font-mono text-[11px] text-brand-300">
                FixFlow123!
              </code>
              . Change it here if you want a persona-specific one.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}