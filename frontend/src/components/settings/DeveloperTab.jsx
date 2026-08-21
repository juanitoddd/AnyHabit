import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCcw,
  Send,
  Trash2,
  Webhook as WebhookIcon
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  createTokenApi,
  createWebhookApi,
  deleteWebhookApi,
  fetchTokensApi,
  fetchWebhookEventsApi,
  fetchWebhooksApi,
  revokeTokenApi,
  testWebhookApi,
  updateWebhookApi
} from '../../services/developerApi';
import { useAppState } from '../../state/appState';
import { formatDate, formatRelative } from '../../utils/date';

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-stone-50 p-2.5 text-sm text-stone-800 outline-none focus:border-stone-400';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500';

const EXPIRY_OPTIONS = [
  { value: '', label: 'Never expires' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' }
];

function CopyButton({ value, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard needs a secure context; the value is selectable anyway.
        }
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50"
    >
      {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

function TokenSection() {
  const { notify, confirm } = useAppState();

  const [tokens, setTokens] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  // Held in memory only: the server will never return this value again.
  const [freshToken, setFreshToken] = useState(null);

  const load = useCallback(async () => {
    try {
      setTokens(await fetchTokensApi());
    } catch (error) {
      notify.error(error.message || 'Could not load your API tokens');
    } finally {
      setIsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      const created = await createTokenApi({
        name: name.trim(),
        expires_in_days: expiry ? Number(expiry) : null
      });
      setFreshToken(created);
      setName('');
      setExpiry('');
      await load();
    } catch (error) {
      notify.error(error.message || 'Could not create the token');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (token) => {
    const accepted = await confirm({
      title: `Revoke "${token.name}"?`,
      message: 'Anything using this token stops working immediately. This cannot be undone.',
      confirmLabel: 'Revoke token',
      tone: 'danger'
    });
    if (!accepted) return;

    try {
      await revokeTokenApi(token.id);
      notify.success('Token revoked');
      await load();
    } catch (error) {
      notify.error(error.message || 'Could not revoke the token');
    }
  };

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">API tokens</h3>
      <p className="mb-4 text-xs leading-5 text-gray-500">
        Long-lived credentials for scripts, cron jobs and integrations. Send one as{' '}
        <code className="rounded bg-stone-100 px-1 font-mono text-[11px]">Authorization: Bearer …</code> on any
        API request.
      </p>

      {freshToken && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <KeyRound size={15} /> Copy this now — it is not shown again
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-white px-3 py-2 font-mono text-xs text-stone-800">
              {freshToken.token}
            </code>
            <CopyButton value={freshToken.token} />
          </div>
          <button
            type="button"
            onClick={() => setFreshToken(null)}
            className="mt-3 text-xs font-medium text-emerald-800 underline-offset-2 hover:underline"
          >
            I have saved it
          </button>
        </div>
      )}

      <form onSubmit={handleCreate} className="mb-4 space-y-3 rounded-2xl border border-gray-200 p-4">
        <div>
          <label htmlFor="token-name" className={labelClass}>
            What is it for?
          </label>
          <input
            id="token-name"
            type="text"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Home Assistant, backup script, Grafana…"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="token-expiry" className={labelClass}>
            Expiry
          </label>
          <select
            id="token-expiry"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
            className={inputClass}
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={!name.trim() || isCreating}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={15} /> {isCreating ? 'Creating…' : 'Create token'}
        </button>
      </form>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : tokens.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
          No tokens yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {tokens.map((token) => (
            <li
              key={token.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-stone-900">{token.name}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  <span className="font-mono">{token.token_prefix}…</span> · created{' '}
                  {formatDate(token.created_at)} · last used{' '}
                  {token.last_used_at ? formatRelative(token.last_used_at) : 'never'}
                  {token.expires_at ? ` · expires ${formatDate(token.expires_at)}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRevoke(token)}
                className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Revoke ${token.name}`}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WebhookSection() {
  const { notify, confirm } = useAppState();

  const [webhooks, setWebhooks] = useState([]);
  const [availableEvents, setAvailableEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState({ name: '', url: '', events: '*' });
  const [isCreating, setIsCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [hooks, events] = await Promise.all([fetchWebhooksApi(), fetchWebhookEventsApi()]);
      setWebhooks(hooks);
      setAvailableEvents(events);
    } catch (error) {
      notify.error(error.message || 'Could not load your webhooks');
    } finally {
      setIsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!form.url.trim()) return;

    setIsCreating(true);
    try {
      await createWebhookApi({
        name: form.name.trim(),
        url: form.url.trim(),
        events: form.events.trim() || '*'
      });
      notify.success('Webhook created');
      setForm({ name: '', url: '', events: '*' });
      await load();
    } catch (error) {
      notify.error(error.message || 'Could not create the webhook');
    } finally {
      setIsCreating(false);
    }
  };

  const handleTest = async (webhook) => {
    try {
      await testWebhookApi(webhook.id);
      notify.info('Test sent. Refresh in a moment to see the result.');
    } catch (error) {
      notify.error(error.message || 'Could not send the test');
    }
  };

  const handleToggle = async (webhook) => {
    try {
      await updateWebhookApi(webhook.id, { is_active: !webhook.is_active });
      await load();
    } catch (error) {
      notify.error(error.message || 'Could not update the webhook');
    }
  };

  const handleDelete = async (webhook) => {
    const accepted = await confirm({
      title: `Delete "${webhook.name || webhook.url}"?`,
      message: 'It stops receiving events immediately.',
      confirmLabel: 'Delete webhook',
      tone: 'danger'
    });
    if (!accepted) return;

    try {
      await deleteWebhookApi(webhook.id);
      notify.success('Webhook deleted');
      await load();
    } catch (error) {
      notify.error(error.message || 'Could not delete the webhook');
    }
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Webhooks</h3>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-stone-800"
        >
          <RefreshCcw size={12} /> Refresh
        </button>
      </div>
      <p className="mb-4 text-xs leading-5 text-gray-500">
        AnyHabit POSTs a JSON payload to your URL when something happens. Every request is signed with
        HMAC-SHA256 in the{' '}
        <code className="rounded bg-stone-100 px-1 font-mono text-[11px]">X-AnyHabit-Signature</code> header.
      </p>

      <form onSubmit={handleCreate} className="mb-4 space-y-3 rounded-2xl border border-gray-200 p-4">
        <div>
          <label htmlFor="webhook-url" className={labelClass}>
            Endpoint URL
          </label>
          <input
            id="webhook-url"
            type="url"
            value={form.url}
            onChange={(event) => setForm({ ...form, url: event.target.value })}
            placeholder="https://homeassistant.local/api/webhook/anyhabit"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="webhook-name" className={labelClass}>
            Label
          </label>
          <input
            id="webhook-name"
            type="text"
            value={form.name}
            maxLength={80}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Home Assistant"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="webhook-events" className={labelClass}>
            Events
          </label>
          <input
            id="webhook-events"
            type="text"
            value={form.events}
            onChange={(event) => setForm({ ...form, events: event.target.value })}
            placeholder="*"
            className={`${inputClass} font-mono text-xs`}
          />
          <p className="mt-1.5 text-[11px] leading-5 text-gray-400">
            <code className="font-mono">*</code> for everything, or a comma-separated list:{' '}
            {availableEvents.join(', ') || 'log.created, journal.created, …'}
          </p>
        </div>
        <button
          type="submit"
          disabled={!form.url.trim() || isCreating}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={15} /> {isCreating ? 'Creating…' : 'Add webhook'}
        </button>
      </form>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : webhooks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
          No webhooks yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {webhooks.map((webhook) => (
            <li key={webhook.id} className="rounded-2xl border border-gray-200 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-stone-900">
                    <WebhookIcon size={14} className="shrink-0 text-gray-400" />
                    {webhook.name || 'Unnamed webhook'}
                    {!webhook.is_active && (
                      <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-stone-500">
                        Paused
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-gray-500">{webhook.url}</p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {webhook.events === '*' ? 'All events' : webhook.events} · {webhook.delivery_count} sent
                    {webhook.failure_count > 0 ? ` · ${webhook.failure_count} failed` : ''}
                    {webhook.last_triggered_at ? ` · last ${formatRelative(webhook.last_triggered_at)}` : ''}
                  </p>
                  {webhook.last_error && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-rose-600">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                      {webhook.last_error}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => handleTest(webhook)}
                    className="rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-stone-50 hover:text-stone-900"
                    aria-label="Send a test delivery"
                    title="Send a test delivery"
                  >
                    <Send size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(webhook)}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-stone-50"
                  >
                    {webhook.is_active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(webhook)}
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Delete webhook"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Signing secret
                </span>
                <code className="min-w-0 flex-1 truncate rounded bg-stone-50 px-2 py-1 font-mono text-[11px] text-stone-600">
                  {webhook.secret}
                </code>
                <CopyButton value={webhook.secret} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DeveloperTab() {
  const baseUrl = window.location.origin;
  const scrapeTarget = baseUrl.replace(/^https?:\/\//, '');

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-gray-200 bg-stone-50 p-4">
        <h3 className="text-sm font-semibold text-stone-900">Your instance</h3>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-xs text-stone-700">
            {baseUrl}
          </code>
          <CopyButton value={baseUrl} />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
          {[
            { href: `${baseUrl}/docs`, label: 'Swagger UI' },
            { href: `${baseUrl}/redoc`, label: 'ReDoc' },
            { href: `${baseUrl}/openapi.json`, label: 'OpenAPI schema' }
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-stone-700 underline-offset-2 hover:underline"
            >
              {link.label} <ExternalLink size={11} />
            </a>
          ))}
        </div>
      </section>

      <TokenSection />
      <WebhookSection />

      <section className="rounded-2xl border border-gray-200 bg-stone-50 p-4">
        <h3 className="text-sm font-semibold text-stone-900">Prometheus</h3>
        <p className="mt-1 text-xs leading-5 text-gray-600">
          Scrape <code className="rounded bg-white px-1 font-mono text-[11px]">/developer/metrics</code> for
          tracker counts, streaks and progress. It needs an API token:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-stone-900 p-3 font-mono text-[11px] leading-5 text-stone-100">
{`scrape_configs:
  - job_name: anyhabit
    metrics_path: /developer/metrics
    authorization:
      credentials: ahb_your_token_here
    static_configs:
      - targets: ["${scrapeTarget}"]`}
        </pre>
      </section>
    </div>
  );
}

export default DeveloperTab;
