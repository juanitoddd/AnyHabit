import { Check, ChevronDown } from 'lucide-react';
import { PERIOD_OPTIONS, TRACKER_COLORS } from '../../constants/tracker';
import { useAppState } from '../../state/appState';
import { toDateInputValue } from '../../utils/date';
import Modal from '../ui/Modal';

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-stone-50 p-2.5 text-sm text-stone-800 outline-none focus:border-stone-400';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500';

function TrackerModal() {
  const {
    isTrackerModalOpen,
    setIsTrackerModalOpen,
    user,
    trackerFormData,
    setTrackerFormData,
    handleTrackerSubmit,
    categoryMenuRef,
    typeMenuRef,
    groupMenuRef,
    isCategoryMenuOpen,
    setIsCategoryMenuOpen,
    isCreatingCategory,
    setIsCreatingCategory,
    existingCategories,
    isTypeMenuOpen,
    setIsTypeMenuOpen,
    isGroupMenuOpen,
    setIsGroupMenuOpen,
    trackerTypeOptions,
    groups
  } = useAppState();

  if (!isTrackerModalOpen) return null;

  const isBoolean = trackerFormData.type === 'boolean';
  const isQuit = trackerFormData.type === 'quit';
  const selectedType = trackerTypeOptions.find((option) => option.value === trackerFormData.type);
  const ownerGroupOptions = groups.filter((group) => group.owner_id === user?.id);
  const selectedGroup = groups.find((group) => group.id === Number(trackerFormData.group_id)) || null;

  const update = (patch) => setTrackerFormData({ ...trackerFormData, ...patch });

  const toggleParticipant = (userId) => {
    const numericId = Number(userId);
    const current = Array.isArray(trackerFormData.participant_ids) ? trackerFormData.participant_ids : [];
    update({
      participant_ids: current.includes(numericId)
        ? current.filter((id) => id !== numericId)
        : [...current, numericId]
    });
  };

  return (
    <Modal
      isOpen
      onClose={() => setIsTrackerModalOpen(false)}
      title={trackerFormData.id ? 'Edit tracker' : 'New tracker'}
      description={selectedType?.hint}
      size="lg"
    >
      <form id="tracker-form" onSubmit={handleTrackerSubmit} className="space-y-5">
        <div>
          <label htmlFor="tracker-name" className={labelClass}>
            Name
          </label>
          <input
            id="tracker-name"
            type="text"
            required
            maxLength={120}
            value={trackerFormData.name}
            onChange={(event) => update({ name: event.target.value })}
            className={inputClass}
            placeholder="e.g. Quit Smoking"
          />
        </div>

        <div>
          <label htmlFor="tracker-description" className={labelClass}>
            Description <span className="normal-case tracking-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            id="tracker-description"
            rows="2"
            maxLength={2000}
            value={trackerFormData.description || ''}
            onChange={(event) => update({ description: event.target.value })}
            className={`${inputClass} resize-none`}
            placeholder="Why does this matter to you? You will read this on hard days."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className={labelClass}>Category</span>
            <div className="space-y-2" ref={categoryMenuRef}>
              <button
                type="button"
                onClick={() => setIsCategoryMenuOpen((open) => !open)}
                aria-expanded={isCategoryMenuOpen}
                className={`${inputClass} flex items-center justify-between`}
              >
                <span className="truncate text-left">
                  {isCreatingCategory ? 'Create new category' : trackerFormData.category || 'General'}
                </span>
                <ChevronDown
                  size={16}
                  className={`text-gray-400 transition-transform ${isCategoryMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isCategoryMenuOpen && (
                <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <ul className="max-h-48 overflow-y-auto py-1">
                    {existingCategories.map((category) => (
                      <li key={category}>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingCategory(false);
                            update({ category });
                            setIsCategoryMenuOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                            trackerFormData.category === category && !isCreatingCategory
                              ? 'bg-stone-100 text-stone-900'
                              : 'text-stone-700 hover:bg-stone-50'
                          }`}
                        >
                          {category}
                        </button>
                      </li>
                    ))}
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingCategory(true);
                          update({ category: '' });
                          setIsCategoryMenuOpen(false);
                        }}
                        className="w-full border-t border-gray-100 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
                      >
                        + Create new category
                      </button>
                    </li>
                  </ul>
                </div>
              )}

              {isCreatingCategory && (
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={trackerFormData.category}
                  onChange={(event) => update({ category: event.target.value })}
                  className={inputClass}
                  placeholder="e.g. Health"
                  aria-label="New category name"
                />
              )}
            </div>
          </div>

          <div>
            <span className={labelClass}>Type</span>
            <div className="space-y-2" ref={typeMenuRef}>
              <button
                type="button"
                onClick={() => setIsTypeMenuOpen((open) => !open)}
                aria-expanded={isTypeMenuOpen}
                className={`${inputClass} flex items-center justify-between`}
              >
                <span className="truncate text-left">{selectedType?.label || 'Quit'}</span>
                <ChevronDown
                  size={16}
                  className={`text-gray-400 transition-transform ${isTypeMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isTypeMenuOpen && (
                <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <ul className="py-1">
                    {trackerTypeOptions.map((option) => (
                      <li key={option.value}>
                        <button
                          type="button"
                          onClick={() => {
                            update({ type: option.value });
                            setIsTypeMenuOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left transition-colors ${
                            trackerFormData.type === option.value
                              ? 'bg-stone-100 text-stone-900'
                              : 'text-stone-700 hover:bg-stone-50'
                          }`}
                        >
                          <span className="block text-sm font-medium">{option.label}</span>
                          <span className="block text-xs text-gray-500">{option.hint}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tracker-start" className={labelClass}>
              Start date
            </label>
            <input
              id="tracker-start"
              type="date"
              value={toDateInputValue(trackerFormData.start_date)}
              max={toDateInputValue(new Date())}
              onChange={(event) =>
                update({ start_date: event.target.value ? new Date(event.target.value).toISOString() : '' })
              }
              className={inputClass}
            />
            {/* Without this, a quit tracker always started "today", so people
                who quit months ago lost that history on day one. */}
            <p className="mt-1.5 text-[11px] text-gray-400">
              {isQuit ? 'Already quit a while ago? Backdate it.' : 'Leave empty to start today.'}
            </p>
          </div>

          {!isBoolean && (
            <div>
              <label htmlFor="tracker-unit" className={labelClass}>
                Unit
              </label>
              <input
                id="tracker-unit"
                type="text"
                required
                maxLength={32}
                value={trackerFormData.unit}
                onChange={(event) => update({ unit: event.target.value })}
                className={inputClass}
                placeholder="e.g. Pages, Cigarettes"
              />
            </div>
          )}
        </div>

        <div>
          <span className={labelClass}>Colour</span>
          <div className="flex flex-wrap gap-2">
            {TRACKER_COLORS.map((option) => {
              const isSelected = (trackerFormData.color || '') === option.value;
              return (
                <button
                  key={option.value || 'default'}
                  type="button"
                  onClick={() => update({ color: option.value })}
                  aria-label={option.label}
                  aria-pressed={isSelected}
                  title={option.label}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                    isSelected ? 'border-stone-900 scale-110' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: option.swatch }}
                >
                  {isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className={labelClass}>Sharing</span>
          <div className="space-y-2" ref={groupMenuRef}>
            <button
              type="button"
              onClick={() => setIsGroupMenuOpen((open) => !open)}
              aria-expanded={isGroupMenuOpen}
              className={`${inputClass} flex items-center justify-between`}
            >
              <span className="truncate text-left">{selectedGroup?.name || 'Private tracker'}</span>
              <ChevronDown
                size={16}
                className={`text-gray-400 transition-transform ${isGroupMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isGroupMenuOpen && (
              <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <ul className="max-h-48 overflow-y-auto py-1">
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        update({ group_id: null, participant_ids: [] });
                        setIsGroupMenuOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                        !trackerFormData.group_id
                          ? 'bg-stone-100 text-stone-900'
                          : 'text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      Private tracker
                    </button>
                  </li>
                  {ownerGroupOptions.map((group) => (
                    <li key={group.id}>
                      <button
                        type="button"
                        onClick={() => {
                          update({ group_id: group.id, participant_ids: [] });
                          setIsGroupMenuOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                          trackerFormData.group_id === group.id
                            ? 'bg-stone-100 text-stone-900'
                            : 'text-stone-700 hover:bg-stone-50'
                        }`}
                      >
                        {group.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-gray-400">
            {ownerGroupOptions.length
              ? 'Shared trackers can only live in groups you own.'
              : 'Create a group first to share a tracker with other people.'}
          </p>
        </div>

        {selectedGroup && (
          <fieldset className="rounded-2xl border border-gray-100 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Assigned members
            </legend>
            <p className="mb-3 text-[11px] text-stone-400">You are always included as the owner.</p>
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {selectedGroup.members.map((membership) => (
                <label
                  key={membership.user.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 px-3 py-2 text-sm text-stone-700"
                >
                  <span className="min-w-0 truncate">
                    {membership.user.username}
                    <span className="ml-2 text-xs text-stone-400">{membership.role}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={(trackerFormData.participant_ids || []).includes(membership.user.id)}
                    onChange={() => toggleParticipant(membership.user.id)}
                    className="h-4 w-4 rounded border-gray-300 text-stone-900 focus:ring-stone-500"
                  />
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="rounded-2xl border border-gray-100 p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {isBoolean ? 'Frequency' : isQuit ? 'Usage to avoid' : 'Target goal'}
          </legend>

          {isBoolean ? (
            <div className="space-y-3">
              <label htmlFor="boolean-period" className="sr-only">
                How often
              </label>
              <select
                id="boolean-period"
                value={trackerFormData.units_per}
                onChange={(event) => update({ units_per: event.target.value })}
                className={inputClass}
              >
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="number"
                step="any"
                min="0"
                value={trackerFormData.units_per_amount}
                onChange={(event) => update({ units_per_amount: event.target.value })}
                className={`${inputClass} flex-1`}
                aria-label="Amount"
              />
              <span className="text-sm text-gray-400">per</span>
              <select
                value={trackerFormData.units_per}
                onChange={(event) => update({ units_per: event.target.value })}
                className={`${inputClass} flex-1`}
                aria-label="Period"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-3">
            <label htmlFor="interval" className={labelClass}>
              Every N periods
            </label>
            <input
              id="interval"
              type="number"
              min="1"
              max="365"
              step="1"
              value={trackerFormData.units_per_interval}
              onChange={(event) => update({ units_per_interval: event.target.value })}
              className={inputClass}
              placeholder="1"
            />
            <p className="mt-1.5 text-[11px] text-gray-400">
              Use 1 for every period, 2 for every other, and so on.
            </p>
          </div>
        </fieldset>

        {!isBoolean && (
          <fieldset className="rounded-2xl border border-gray-100 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Secondary impact
            </legend>
            <p className="mb-3 text-[11px] text-gray-400">
              Money saved, CO₂ avoided, hours reclaimed — anything you want counted alongside the habit.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="number"
                step="any"
                min="0"
                value={trackerFormData.impact_amount}
                onChange={(event) => update({ impact_amount: event.target.value })}
                className={`${inputClass} flex-1`}
                placeholder="Amount"
                aria-label="Impact amount"
              />
              <input
                type="text"
                maxLength={16}
                value={trackerFormData.impact_unit}
                onChange={(event) => update({ impact_unit: event.target.value })}
                className={`${inputClass} flex-1`}
                placeholder="$ or kg CO₂"
                aria-label="Impact unit"
              />
              <span className="text-sm text-gray-400">per</span>
              <select
                value={trackerFormData.impact_per}
                onChange={(event) => update({ impact_per: event.target.value })}
                className={`${inputClass} flex-1`}
                aria-label="Impact period"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setIsTrackerModalOpen(false)}
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-xl bg-stone-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default TrackerModal;
