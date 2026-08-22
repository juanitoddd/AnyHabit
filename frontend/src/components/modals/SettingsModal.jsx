import { Code2, Database, Info, LogOut, Monitor, Moon, Palette, Sun, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { WEEK_START_OPTIONS } from '../../constants/tracker';
import { fetchSystemInfoApi } from '../../services/systemApi';
import { useAppState } from '../../state/appState';
import { getTimezoneOptions } from '../../utils/date';
import DeveloperTab from '../settings/DeveloperTab';
import Modal from '../ui/Modal';

const TABS = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'preferences', label: 'Preferences', icon: Palette },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'developer', label: 'Developer', icon: Code2 },
  { id: 'about', label: 'About', icon: Info }
];

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun, hint: 'Bright background' },
  { value: 'dark', label: 'Dark', icon: Moon, hint: 'Dimmed for low light' },
  { value: 'system', label: 'System', icon: Monitor, hint: 'Follow your device' }
];

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-stone-50 p-2.5 text-sm text-stone-800 outline-none focus:border-stone-400';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500';
const sectionTitleClass = 'mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400';

function AccountTab() {
  const { user, changePassword, updatePreferences, deleteAccount, confirm, notify, logout, setIsSettingsOpen } =
    useAppState();

  const [username, setUsername] = useState(user?.username || '');
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [isSaving, setIsSaving] = useState(false);

  const passwordsMatch = passwords.next === passwords.confirm;
  const canChangePassword =
    passwords.current && passwords.next.length >= 8 && passwordsMatch && !isSaving;

  const handleUsernameSave = async (event) => {
    event.preventDefault();
    if (!username.trim() || username.trim() === user?.username) return;
    await updatePreferences({ username: username.trim() });
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await changePassword({ current_password: passwords.current, new_password: passwords.next });
      setPasswords({ current: '', next: '', confirm: '' });
      notify.success('Password updated');
    } catch (error) {
      notify.error(error.message || 'Could not change your password');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const accepted = await confirm({
      title: 'Delete your account?',
      message:
        'Every tracker, log and journal entry you own will be permanently deleted. Export a backup first if you might want any of it back.',
      confirmLabel: 'Delete my account',
      tone: 'danger',
      requireText: user?.username || ''
    });
    if (!accepted) return;

    try {
      await deleteAccount(user.username);
      setIsSettingsOpen(false);
    } catch (error) {
      notify.error(error.message || 'Could not delete the account');
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <h3 className={sectionTitleClass}>Signed in as</h3>
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="truncate text-sm font-semibold text-stone-900">{user?.username}</p>
          <p className="mt-0.5 truncate text-xs text-stone-500">{user?.email}</p>
          <button
            type="button"
            onClick={() => {
              logout();
              setIsSettingsOpen(false);
            }}
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-stone-900 transition-colors hover:text-rose-600"
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      </section>

      <section>
        <h3 className={sectionTitleClass}>Display name</h3>
        <form onSubmit={handleUsernameSave} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="settings-username" className="sr-only">
              Username
            </label>
            <input
              id="settings-username"
              type="text"
              value={username}
              maxLength={64}
              onChange={(event) => setUsername(event.target.value)}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            disabled={!username.trim() || username.trim() === user?.username}
            className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </form>
      </section>

      <section>
        <h3 className={sectionTitleClass}>Change password</h3>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <div>
            <label htmlFor="current-password" className={labelClass}>
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={passwords.current}
              onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="new-password" className={labelClass}>
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={passwords.next}
              onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
              className={inputClass}
            />
            <p className="mt-1.5 text-[11px] text-gray-400">At least 8 characters.</p>
          </div>
          <div>
            <label htmlFor="confirm-password" className={labelClass}>
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={passwords.confirm}
              onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
              className={inputClass}
            />
            {passwords.confirm && !passwordsMatch && (
              <p className="mt-1.5 text-[11px] text-rose-600">These passwords do not match.</p>
            )}
          </div>
          <button
            type="submit"
            disabled={!canChangePassword}
            className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSaving ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </section>

      <section>
        <h3 className={sectionTitleClass}>Danger zone</h3>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-900">Delete this account</p>
          <p className="mt-1 text-xs leading-5 text-rose-700">
            Removes every tracker, log and journal entry you own. There is no undo.
          </p>
          <button
            type="button"
            onClick={handleDeleteAccount}
            className="mt-3 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100"
          >
            Delete account
          </button>
        </div>
      </section>
    </div>
  );
}

function PreferencesTab() {
  const { theme, setTheme, user, updatePreferences } = useAppState();
  const { browserZone, options } = useMemo(() => getTimezoneOptions(), []);

  const currentZone = user?.timezone || 'UTC';
  const isZoneMismatched = browserZone && currentZone !== browserZone;

  return (
    <div className="space-y-8">
      <section>
        <h3 className={sectionTitleClass}>Theme</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = theme === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                aria-pressed={isSelected}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  isSelected ? 'border-stone-800 bg-stone-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Icon size={18} className="mb-2 text-stone-700" />
                <p className="text-sm font-semibold text-stone-800">{option.label}</p>
                <p className="mt-1 text-xs text-gray-500">{option.hint}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className={sectionTitleClass}>Time zone</h3>
        <p className="mb-3 text-xs leading-5 text-gray-500">
          Decides when your day rolls over, so streaks and daily targets reset at your midnight rather than UTC&nbsp;midnight.
        </p>
        <label htmlFor="timezone" className="sr-only">
          Time zone
        </label>
        <select
          id="timezone"
          value={currentZone}
          onChange={(event) => updatePreferences({ timezone: event.target.value })}
          className={inputClass}
        >
          {options.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
              {zone === browserZone ? ' (your device)' : ''}
            </option>
          ))}
        </select>

        {isZoneMismatched && (
          <button
            type="button"
            onClick={() => updatePreferences({ timezone: browserZone })}
            className="mt-2 text-xs font-medium text-stone-600 underline-offset-2 hover:underline"
          >
            Use your device time zone ({browserZone})
          </button>
        )}
      </section>

      <section>
        <h3 className={sectionTitleClass}>Week starts on</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {WEEK_START_OPTIONS.map((option) => {
            const isSelected = (user?.week_start || 'monday') === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => updatePreferences({ week_start: option.value })}
                aria-pressed={isSelected}
                className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
                  isSelected
                    ? 'border-stone-800 bg-stone-50 text-stone-900'
                    : 'border-gray-200 text-stone-600 hover:border-gray-300'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-gray-500">Applies to weekly targets and the consistency heatmap.</p>
      </section>
    </div>
  );
}

function DataTab() {
  const { setIsExportOpen, setIsImportOpen, setIsSettingsOpen } = useAppState();

  const openDialog = (open) => {
    setIsSettingsOpen(false);
    open(true);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-stone-900">Export a backup</h3>
        <p className="mt-1 text-xs leading-5 text-gray-500">
          Downloads every tracker, log and journal entry as JSON. Take one before upgrading AnyHabit.
        </p>
        <button
          type="button"
          onClick={() => openDialog(setIsExportOpen)}
          className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
        >
          Export data
        </button>
      </section>

      <section className="rounded-2xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-stone-900">Restore a backup</h3>
        <p className="mt-1 text-xs leading-5 text-gray-500">
          Import a JSON export. You will see a preview of exactly what changes before anything is written.
        </p>
        <button
          type="button"
          onClick={() => openDialog(setIsImportOpen)}
          className="mt-3 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-50"
        >
          Restore data
        </button>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-stone-50 p-4">
        <h3 className="text-sm font-semibold text-stone-900">Automatic server backups</h3>
        <p className="mt-1 text-xs leading-5 text-gray-600">
          Whenever AnyHabit starts with a database that needs upgrading, it copies the old database into{' '}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">data/backups/</code> first. Those
          snapshots live in the same Docker volume as your database.
        </p>
      </section>
    </div>
  );
}

function AboutTab() {
  const [systemInfo, setSystemInfo] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchSystemInfoApi()
      .then((info) => {
        if (!cancelled) setSystemInfo(info);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-stone-50 p-4">
        <p className="text-sm leading-6 text-stone-700">
          AnyHabit is a self-hosted habit tracker, made by Bebedi as an open source project.
        </p>
        <a
          href="https://github.com/Sparths/AnyHabit"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-sm font-medium text-stone-900 hover:underline"
        >
          github.com/Sparths/AnyHabit
        </a>
      </section>

      <section>
        <h3 className={sectionTitleClass}>Server</h3>
        {loadFailed ? (
          <p className="text-sm text-gray-500">Could not reach the server for version information.</p>
        ) : !systemInfo ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <dl className="space-y-2">
            <div className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <dt className="text-stone-600">Version</dt>
              <dd className="font-mono text-stone-900">{systemInfo.version}</dd>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <dt className="text-stone-600">Database schema</dt>
              <dd className="font-mono text-stone-900">v{systemInfo.schema_version}</dd>
            </div>
            {systemInfo.migrations_applied_on_boot?.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                <dt className="font-medium text-emerald-900">
                  Upgraded on last start ({systemInfo.migrations_applied_on_boot.length} migration
                  {systemInfo.migrations_applied_on_boot.length === 1 ? '' : 's'})
                </dt>
                {systemInfo.backup_created_on_boot && (
                  <dd className="mt-1 break-all font-mono text-[11px] text-emerald-800">
                    Backup: {systemInfo.backup_created_on_boot}
                  </dd>
                )}
              </div>
            )}
          </dl>
        )}
      </section>

      <section>
        <h3 className={sectionTitleClass}>Keyboard shortcuts</h3>
        <dl className="space-y-2 text-sm">
          {[
            ['Ctrl / ⌘ + K', 'Search trackers and actions'],
            ['Esc', 'Close a dialog'],
            ['↑ ↓ then ↵', 'Move through search results']
          ].map(([keys, description]) => (
            <div key={keys} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
              <dt className="text-stone-600">{description}</dt>
              <dd>
                <kbd className="rounded-md border border-gray-200 bg-stone-50 px-2 py-0.5 font-mono text-[11px] text-stone-700">
                  {keys}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function SettingsModal() {
  const { isSettingsOpen, setIsSettingsOpen } = useAppState();
  const [activeTab, setActiveTab] = useState('account');

  // The modal stays mounted while hidden, so without this it reopens on
  // whichever tab was last viewed — surprising when you came back for Account.
  useEffect(() => {
    if (isSettingsOpen) setActiveTab('account');
  }, [isSettingsOpen]);

  if (!isSettingsOpen) return null;

  return (
    <Modal
      isOpen
      onClose={() => setIsSettingsOpen(false)}
      title="Settings"
      description="Personalise AnyHabit and manage your data."
      size="xl"
    >
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-100 pb-px">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-stone-900 text-stone-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'account' && <AccountTab />}
      {activeTab === 'preferences' && <PreferencesTab />}
      {activeTab === 'data' && <DataTab />}
      {activeTab === 'developer' && <DeveloperTab />}
      {activeTab === 'about' && <AboutTab />}
    </Modal>
  );
}

export default SettingsModal;
