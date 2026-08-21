import { apiClient } from './apiClient';

export async function exportDataApi({ data_type = 'all', format = 'json', tracker_ids = null } = {}) {
  const params = new URLSearchParams({ data_type, format });

  if (Array.isArray(tracker_ids)) {
    tracker_ids.forEach((id) => params.append('tracker_id', id));
  }

  return apiClient.get(`/export/?${params.toString()}`, { parse: 'text' });
}

/**
 * Restore a JSON backup.
 *
 * `dryRun` asks the server what *would* happen without writing anything, so the
 * UI can show a preview before the user commits to a merge or a replace.
 */
export async function importDataApi(file, { mode = 'merge', dryRun = true, confirm = '' } = {}) {
  const params = new URLSearchParams({ mode, dry_run: String(dryRun) });
  if (confirm) params.set('confirm', confirm);

  const formData = new FormData();
  formData.append('file', file);

  return apiClient.upload(`/import/?${params.toString()}`, formData);
}

/** Hand the browser a file without leaving the page. */
export function downloadTextFile(contents, filename, mimeType) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
