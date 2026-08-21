import { Archive, Home, Layers, Plus, Search, Settings, Upload, Download, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../state/appState';

const TYPE_LABELS = { quit: 'Quit', build: 'Build', boolean: 'Yes/No' };

/**
 * Ctrl/Cmd+K launcher.
 *
 * With no search anywhere in the app, the only way to reach a tracker was to
 * scroll the sidebar — which stops working somewhere around twenty of them.
 */
function CommandPalette() {
  const navigate = useNavigate();
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    trackers,
    setSelectedTrackerId,
    setSelectedCategory,
    existingCategories,
    openTrackerModal,
    setIsSettingsOpen,
    setIsExportOpen,
    setIsImportOpen,
    setIsGroupManagementOpen
  } = useAppState();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Global shortcut: Cmd+K on macOS, Ctrl+K elsewhere.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsCommandPaletteOpen((open) => !open);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsCommandPaletteOpen]);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery('');
      setActiveIndex(0);
      // The palette mounts and focuses in the same frame without this.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isCommandPaletteOpen]);

  const close = () => setIsCommandPaletteOpen(false);

  const commands = useMemo(() => {
    const go = (path, action) => () => {
      action?.();
      navigate(path);
      close();
    };

    const actions = [
      {
        id: 'action-home',
        label: 'Go to Home',
        hint: 'Dashboard',
        icon: Home,
        run: go('/', () => {
          setSelectedTrackerId(null);
          setSelectedCategory(null);
        })
      },
      {
        id: 'action-new-tracker',
        label: 'Create a tracker',
        hint: 'New',
        icon: Plus,
        run: () => {
          close();
          openTrackerModal();
        }
      },
      {
        id: 'action-groups',
        label: 'Manage groups',
        hint: 'Groups',
        icon: Users,
        run: () => {
          close();
          setIsGroupManagementOpen(true);
        }
      },
      {
        id: 'action-export',
        label: 'Export data / backup',
        hint: 'Data',
        icon: Download,
        run: () => {
          close();
          setIsExportOpen(true);
        }
      },
      {
        id: 'action-import',
        label: 'Restore from a backup',
        hint: 'Data',
        icon: Upload,
        run: () => {
          close();
          setIsImportOpen(true);
        }
      },
      {
        id: 'action-settings',
        label: 'Open settings',
        hint: 'Settings',
        icon: Settings,
        run: () => {
          close();
          setIsSettingsOpen(true);
        }
      }
    ];

    const trackerCommands = trackers.map((tracker) => ({
      id: `tracker-${tracker.id}`,
      label: tracker.name,
      hint: `${TYPE_LABELS[tracker.type] || tracker.type} · ${(tracker.category || 'General').trim()}`,
      icon: tracker.archived_at ? Archive : Search,
      keywords: `${tracker.name} ${tracker.category} ${tracker.description || ''}`,
      run: go(`/tracker/${tracker.id}`, () => {
        setSelectedCategory((tracker.category || 'General').trim() || 'General');
        setSelectedTrackerId(tracker.id);
      })
    }));

    const categoryCommands = existingCategories.map((category) => ({
      id: `category-${category}`,
      label: category,
      hint: 'Category',
      icon: Layers,
      run: go(`/category/${encodeURIComponent(category)}`, () => {
        setSelectedTrackerId(null);
        setSelectedCategory(category);
      })
    }));

    return [...trackerCommands, ...categoryCommands, ...actions];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackers, existingCategories, navigate]);

  const results = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return commands.slice(0, 12);

    return commands
      .filter((command) =>
        `${command.label} ${command.hint} ${command.keywords || ''}`.toLowerCase().includes(search)
      )
      .slice(0, 12);
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!isCommandPaletteOpen) return null;

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (results.length ? (index + 1) % results.length : 0));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (results.length ? (index - 1 + results.length) % results.length : 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      results[activeIndex]?.run();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-start justify-center bg-stone-900/30 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search AnyHabit"
        className="app-modal-card w-full max-w-xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          <Search size={18} className="shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search trackers, categories and actions…"
            className="w-full bg-transparent text-sm text-stone-800 outline-none placeholder:text-gray-400"
            aria-label="Search"
          />
          <kbd className="hidden shrink-0 rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 sm:block">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-gray-400">Nothing matches “{query}”.</p>
          ) : (
            results.map((command, index) => {
              const Icon = command.icon;
              const isActive = index === activeIndex;

              return (
                <button
                  key={command.id}
                  type="button"
                  data-active={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={command.run}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    isActive ? 'bg-stone-100 text-stone-900' : 'text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <Icon size={16} className="shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{command.label}</span>
                  <span className="shrink-0 text-xs text-gray-400">{command.hint}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">
          <span>↑↓ to navigate</span>
          <span>↵ to open</span>
          <span className="ml-auto">Ctrl/⌘ + K</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
