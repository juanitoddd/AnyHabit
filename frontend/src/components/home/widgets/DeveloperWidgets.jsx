import { Check, Copy, ExternalLink, KeyRound, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { WidgetEmptyState } from './shared';

const SNIPPET_KINDS = [
  { id: 'curl', label: 'curl' },
  { id: 'fetch', label: 'fetch' },
  { id: 'python', label: 'Python' }
];

const buildSnippets = (baseUrl, path) => ({
  curl: `curl -H "Authorization: Bearer $ANYHABIT_TOKEN" \\\n  ${baseUrl}${path}`,
  fetch: `const response = await fetch("${baseUrl}${path}", {
  headers: { Authorization: \`Bearer \${process.env.ANYHABIT_TOKEN}\` }
});
const data = await response.json();`,
  python: `import os, httpx

response = httpx.get(
    "${baseUrl}${path}",
    headers={"Authorization": f"Bearer {os.environ['ANYHABIT_TOKEN']}"},
)
response.raise_for_status()
data = response.json()`
});

const ENDPOINTS = [
  { path: '/trackers/', label: 'List trackers' },
  { path: '/dashboard/summary', label: 'Dashboard summary' },
  { path: '/dashboard/activity', label: 'Recent activity' },
  { path: '/developer/metrics', label: 'Prometheus metrics' },
  { path: '/export/?data_type=all&format=json', label: 'Full backup' }
];

/**
 * A cheat sheet on the dashboard for the person running the server.
 *
 * The base URL is read from the browser rather than hardcoded, so the snippets
 * are correct whether AnyHabit is on localhost, a LAN IP or a domain.
 */
export function ApiExplorerWidget({ config, onConfigChange, onOpenSettings }) {
  const [copied, setCopied] = useState('');
  const kind = SNIPPET_KINDS.some((option) => option.id === config.snippet) ? config.snippet : 'curl';
  const path = config.path || ENDPOINTS[0].path;

  const baseUrl = useMemo(() => window.location.origin, []);
  const snippets = useMemo(() => buildSnippets(baseUrl, path), [baseUrl, path]);

  const copy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((current) => (current === id ? '' : current)), 1800);
    } catch {
      // Clipboard needs a secure context; the snippet is selectable regardless.
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-stone-100 px-2 py-1 font-mono text-[11px] text-stone-600">
          {baseUrl}
        </code>
        <button
          type="button"
          onClick={() => copy(baseUrl, 'base')}
          className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-stone-50"
          aria-label="Copy base URL"
        >
          {copied === 'base' ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
        </button>
      </div>

      <div>
        <label htmlFor="api-endpoint" className="sr-only">
          Endpoint
        </label>
        <select
          id="api-endpoint"
          value={path}
          onChange={(event) => onConfigChange({ path: event.target.value })}
          className="w-full rounded-xl border border-gray-200 bg-white p-2 text-xs text-stone-800 outline-none focus:border-stone-400"
        >
          {ENDPOINTS.map((endpoint) => (
            <option key={endpoint.path} value={endpoint.path}>
              {endpoint.label} — {endpoint.path}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-1">
        {SNIPPET_KINDS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onConfigChange({ snippet: option.id })}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              kind === option.id ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => copy(snippets[kind], 'snippet')}
          className="ml-auto rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-stone-50"
        >
          {copied === 'snippet' ? 'Copied' : 'Copy'}
        </button>
      </div>

      <pre className="min-h-0 flex-1 overflow-auto rounded-xl bg-stone-900 p-3 font-mono text-[11px] leading-5 text-stone-100">
        {snippets[kind]}
      </pre>

      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <KeyRound size={12} className="shrink-0" />
        <button type="button" onClick={onOpenSettings} className="underline-offset-2 hover:underline">
          Create an API token
        </button>
        <a
          href={`${baseUrl}/docs`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 underline-offset-2 hover:underline"
        >
          API docs <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

/**
 * Embed another self-hosted page — a Grafana panel, an Uptime Kuma badge.
 *
 * Sandboxed without `allow-same-origin`, so the embedded page cannot reach
 * this origin's cookies or storage even if it is served from the same host.
 */
export function EmbedWidget({ config }) {
  const url = (config.url || '').trim();

  if (!url) {
    return (
      <WidgetEmptyState
        title="Nothing embedded yet"
        hint="Add a URL in widget settings — a Grafana panel, a status page, anything."
      />
    );
  }

  if (!/^https?:\/\//i.test(url)) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center">
        <div className="text-sm text-rose-600">
          <ShieldAlert size={20} className="mx-auto mb-2" />
          Only http:// and https:// URLs can be embedded.
        </div>
      </div>
    );
  }

  return (
    <iframe
      src={url}
      title={config.title || 'Embedded content'}
      loading="lazy"
      referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-forms allow-popups"
      className="h-full w-full rounded-xl border border-gray-200 bg-white"
    />
  );
}
