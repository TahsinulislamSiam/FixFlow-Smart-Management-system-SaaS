import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { ApiError } from '../lib/api.js';
import { AuthLayout } from './Login.jsx';
import { Button, Checkbox, Field, Input, Pill, Select } from '../components/ui.jsx';

export function RegisterPage() {
  const { register } = useAuth();
  const { categories } = useMeta();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'REQUESTER',
    department: '',
    zone: '',
    skills: [],
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const toggleSkill = (key) =>
    setForm((current) => ({
      ...current,
      skills: current.skills.includes(key) ? current.skills.filter((skill) => skill !== key) : [...current.skills, key],
    }));

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setErrors({});
    setMessage(null);
    try {
      const user = await register({
        ...form,
        department: form.department || null,
        zone: form.zone || null,
        skills: form.role === 'TECHNICIAN' ? form.skills : [],
      });
      toast.success('Account created', `Welcome to FixFlow, ${user.name.split(' ')[0]}.`);
      navigate('/', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.details ?? {});
        setMessage(caught.message);
      } else {
        setMessage('Could not create your account.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="surface surface-raised p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Create your FixFlow account</h2>
        <p className="mt-1 text-xs text-ink-400">
          Reporters raise and track issues. Technicians also get a work queue and can update job status.
        </p>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          <Field label="Full name" required error={errors.name}>
            <Input value={form.name} onChange={set('name')} placeholder="Alex Morgan" required invalid={Boolean(errors.name)} />
          </Field>

          <Field label="Work email" required error={errors.email}>
            <Input type="email" value={form.email} onChange={set('email')} placeholder="alex@company.com" required invalid={Boolean(errors.email)} />
          </Field>

          <Field label="Password" required error={errors.password} hint="At least 8 characters.">
            <Input
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder="••••••••"
              required
              invalid={Boolean(errors.password)}
            />
          </Field>

          <Field label="I am joining as" error={errors.role}>
            <Select value={form.role} onChange={set('role')}>
              <option value="REQUESTER">Reporter — raise and track issues</option>
              <option value="TECHNICIAN">Technician — carry out and close jobs</option>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department / site" error={errors.department}>
              <Input value={form.department} onChange={set('department')} placeholder="Atrium Tower" />
            </Field>
            <Field label="Zone" error={errors.zone}>
              <Input value={form.zone} onChange={set('zone')} placeholder="North Zone" />
            </Field>
          </div>

          {form.role === 'TECHNICIAN' ? (
            <Field label="Trades you cover" hint="Used by the auto-assignment engine.">
              <div className="flex flex-wrap gap-1.5 rounded-xl border border-ink-400/18 bg-ink-925/50 p-2.5">
                {categories.map((category) => (
                  <label key={category.key} className="cursor-pointer">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={form.skills.includes(category.key)}
                      onChange={() => toggleSkill(category.key)}
                    />
                    <span className="chip border-ink-400/25 bg-white/4 text-ink-300 peer-checked:border-brand-400/60 peer-checked:bg-brand-500/20 peer-checked:text-brand-200">
                      <span aria-hidden>{category.icon}</span>
                      {category.name}
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          ) : null}

          <Checkbox label="I agree to the fair-use demo terms" defaultChecked />

          {message ? (
            <p className="rounded-xl border border-danger-400/35 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{message}</p>
          ) : null}

          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
            Create account
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-400">
            Already registered?{' '}
            <Link to="/login" className="font-semibold text-brand-300 hover:text-brand-200">
              Sign in
            </Link>
          </p>
          <Pill tone="neutral">No credit card</Pill>
        </div>
      </div>
    </AuthLayout>
  );
}
