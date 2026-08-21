import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_JOURNAL_FORM, DEFAULT_LOG_FORM, DEFAULT_TRACKER_FORM } from '../constants/tracker';
import {
  createGroupApi,
  deleteGroupApi,
  fetchGroupsApi,
  joinGroupApi,
  leaveGroupApi,
  removeGroupMemberApi,
  renameGroupApi,
  rotateJoinCodeApi
} from '../services/groupApi';
import {
  archiveTrackerApi,
  createBooleanLogApi,
  createLogApi,
  deleteJournalApi,
  deleteLogApi,
  deleteTrackerApi,
  fetchHabitLogsApi,
  fetchJournalsApi,
  fetchTrackersApi,
  resetTrackerApi,
  saveJournalApi,
  saveTrackerApi,
  toggleTrackerStatusApi,
  unarchiveTrackerApi,
  updateLogApi
} from '../services/trackerApi';

const normalizeCategory = (value) => (value || 'General').trim() || 'General';

export function useTrackerData(isAuthenticated, onError) {
  const [trackers, setTrackers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedTrackerId, setSelectedTrackerId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isLoadingTrackers, setIsLoadingTrackers] = useState(true);

  const [journals, setJournals] = useState([]);
  const [journalFormData, setJournalFormData] = useState(DEFAULT_JOURNAL_FORM);
  const [journalSearch, setJournalSearch] = useState('');

  const [habitLogs, setHabitLogs] = useState([]);
  const [logFormData, setLogFormData] = useState(DEFAULT_LOG_FORM);

  const [trackerFormData, setTrackerFormData] = useState(DEFAULT_TRACKER_FORM);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const reportError = useCallback(
    (error) => {
      // Failures used to go only to the console, so a dead backend looked like
      // an app with no data. Surfacing them is the whole point of onError.
      onError?.(error);
    },
    [onError]
  );

  const fetchTrackers = useCallback(async () => {
    try {
      const data = await fetchTrackersApi(true);
      setTrackers(
        data.map((tracker) => ({
          ...tracker,
          units_per_interval: Math.max(1, Number(tracker.units_per_interval || 1))
        }))
      );
    } catch (error) {
      reportError(error);
    } finally {
      setIsLoadingTrackers(false);
    }
  }, [reportError]);

  const fetchGroups = useCallback(async () => {
    try {
      setGroups(await fetchGroupsApi());
    } catch (error) {
      reportError(error);
    }
  }, [reportError]);

  const fetchJournals = useCallback(
    async (trackerId, search = journalSearch) => {
      try {
        setJournals(await fetchJournalsApi(trackerId, { mineOnly: true, search }));
      } catch (error) {
        reportError(error);
      }
    },
    [journalSearch, reportError]
  );

  const fetchHabitLogs = useCallback(
    async (trackerId) => {
      try {
        setHabitLogs(await fetchHabitLogsApi(trackerId, { mineOnly: true }));
      } catch (error) {
        reportError(error);
      }
    },
    [reportError]
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setTrackers([]);
      setGroups([]);
      setSelectedTrackerId(null);
      setSelectedCategory(null);
      setJournals([]);
      setHabitLogs([]);
      setJournalFormData(DEFAULT_JOURNAL_FORM);
      setLogFormData(DEFAULT_LOG_FORM);
      setTrackerFormData(DEFAULT_TRACKER_FORM);
      setIsLoadingTrackers(false);
      return;
    }

    setIsLoadingTrackers(true);
    fetchTrackers();
    fetchGroups();
  }, [isAuthenticated, fetchTrackers, fetchGroups]);

  useEffect(() => {
    if (!isAuthenticated) return;

    if (selectedTrackerId) {
      fetchJournals(selectedTrackerId);
      fetchHabitLogs(selectedTrackerId);
      setJournalFormData(DEFAULT_JOURNAL_FORM);
    } else {
      setJournals([]);
      setHabitLogs([]);
    }
    // journalSearch is applied by its own debounce below, not on tracker change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, selectedTrackerId]);

  // Debounce journal search so typing does not fire a request per keystroke.
  useEffect(() => {
    if (!isAuthenticated || !selectedTrackerId) return undefined;

    const timer = setTimeout(() => fetchJournals(selectedTrackerId, journalSearch), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalSearch]);

  const selectedTracker = useMemo(
    () => trackers.find((tracker) => tracker.id === selectedTrackerId),
    [trackers, selectedTrackerId]
  );

  /** Everything except archived trackers, unless the user asked to see them. */
  const visibleTrackers = useMemo(
    () => (showArchived ? trackers : trackers.filter((tracker) => !tracker.archived_at)),
    [trackers, showArchived]
  );

  const archivedCount = useMemo(() => trackers.filter((tracker) => tracker.archived_at).length, [trackers]);

  const existingCategories = useMemo(() => {
    const categories = trackers.map((tracker) => normalizeCategory(tracker.category));
    return [...new Set(['General', ...categories])].sort((a, b) => a.localeCompare(b));
  }, [trackers]);

  const groupedTrackers = useMemo(
    () =>
      visibleTrackers.reduce((accumulator, tracker) => {
        const category = normalizeCategory(tracker.category);
        if (!accumulator[category]) accumulator[category] = [];
        accumulator[category].push(tracker);
        return accumulator;
      }, {}),
    [visibleTrackers]
  );

  const sortedCategoryEntries = useMemo(
    () =>
      Object.entries(groupedTrackers)
        .map(([category, items]) => [category, [...items].sort((a, b) => a.name.localeCompare(b.name))])
        .sort(([a], [b]) => a.localeCompare(b)),
    [groupedTrackers]
  );

  const selectedCategoryTrackers = useMemo(() => {
    if (!selectedCategory) return [];
    return visibleTrackers
      .filter((tracker) => normalizeCategory(tracker.category) === selectedCategory)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleTrackers, selectedCategory]);

  const activeCategory = selectedTracker ? normalizeCategory(selectedTracker.category) : selectedCategory;

  useEffect(() => {
    if (selectedCategory && !groupedTrackers[selectedCategory]) {
      setSelectedCategory(null);
    }
  }, [groupedTrackers, selectedCategory]);

  const openTrackerModalData = useCallback(
    (tracker = null) => {
      if (tracker) {
        const normalizedCategory = normalizeCategory(tracker.category);
        setIsCreatingCategory(!existingCategories.includes(normalizedCategory));
        setTrackerFormData({
          ...DEFAULT_TRACKER_FORM,
          ...tracker,
          description: tracker.description || '',
          color: tracker.color || '',
          category: normalizedCategory,
          units_per_interval: Math.max(1, Number(tracker.units_per_interval || 1)),
          start_date: tracker.start_date || '',
          group_id: tracker.group_id || null,
          participant_ids: tracker.participant_ids || []
        });
        return;
      }

      setIsCreatingCategory(false);
      setTrackerFormData({ ...DEFAULT_TRACKER_FORM, category: selectedCategory || 'General' });
    },
    [existingCategories, selectedCategory]
  );

  const submitTracker = useCallback(async () => {
    const saved = await saveTrackerApi(trackerFormData);
    await fetchTrackers();
    return saved;
  }, [trackerFormData, fetchTrackers]);

  const deleteTracker = useCallback(
    async (id) => {
      await deleteTrackerApi(id);
      if (selectedTrackerId === id) setSelectedTrackerId(null);
      await fetchTrackers();
    },
    [selectedTrackerId, fetchTrackers]
  );

  const toggleTrackerStatus = useCallback(
    async (tracker) => {
      await toggleTrackerStatusApi(tracker);
      await fetchTrackers();
    },
    [fetchTrackers]
  );

  const archiveTracker = useCallback(
    async (trackerId) => {
      await archiveTrackerApi(trackerId);
      await fetchTrackers();
    },
    [fetchTrackers]
  );

  const unarchiveTracker = useCallback(
    async (trackerId) => {
      await unarchiveTrackerApi(trackerId);
      await fetchTrackers();
    },
    [fetchTrackers]
  );

  const resetTracker = useCallback(
    async (trackerId, note = '') => {
      await resetTrackerApi(trackerId, note);
      await fetchTrackers();
      await fetchJournals(trackerId);
    },
    [fetchTrackers, fetchJournals]
  );

  const submitJournal = useCallback(async () => {
    if (!selectedTrackerId || !journalFormData.content.trim()) return;
    await saveJournalApi(selectedTrackerId, journalFormData);
    setJournalFormData(DEFAULT_JOURNAL_FORM);
    await fetchJournals(selectedTrackerId);
  }, [selectedTrackerId, journalFormData, fetchJournals]);

  const deleteJournal = useCallback(
    async (journalId) => {
      if (!selectedTrackerId) return;
      await deleteJournalApi(selectedTrackerId, journalId);
      await fetchJournals(selectedTrackerId);
    },
    [selectedTrackerId, fetchJournals]
  );

  const submitLog = useCallback(async () => {
    if (!selectedTrackerId) return;
    await createLogApi(selectedTrackerId, logFormData);
    setLogFormData({ ...DEFAULT_LOG_FORM, timestamp: new Date().toISOString() });
    await fetchHabitLogs(selectedTrackerId);
  }, [selectedTrackerId, logFormData, fetchHabitLogs]);

  const quickMarkBooleanDone = useCallback(async () => {
    if (!selectedTrackerId) return;
    await createBooleanLogApi(selectedTrackerId);
    await fetchHabitLogs(selectedTrackerId);
  }, [selectedTrackerId, fetchHabitLogs]);

  const updateLog = useCallback(
    async (logId, payload) => {
      if (!selectedTrackerId) return;
      await updateLogApi(selectedTrackerId, logId, payload);
      await fetchHabitLogs(selectedTrackerId);
    },
    [selectedTrackerId, fetchHabitLogs]
  );

  const deleteLog = useCallback(
    async (logId) => {
      if (!selectedTrackerId) return;
      await deleteLogApi(selectedTrackerId, logId);
      await fetchHabitLogs(selectedTrackerId);
    },
    [selectedTrackerId, fetchHabitLogs]
  );

  const createGroup = useCallback(
    async (name) => {
      const group = await createGroupApi({ name });
      await fetchGroups();
      return group;
    },
    [fetchGroups]
  );

  const joinGroup = useCallback(
    async (joinCode) => {
      const group = await joinGroupApi({ join_code: joinCode });
      await fetchGroups();
      await fetchTrackers();
      return group;
    },
    [fetchGroups, fetchTrackers]
  );

  const renameGroup = useCallback(
    async (groupId, name) => {
      await renameGroupApi(groupId, name);
      await fetchGroups();
    },
    [fetchGroups]
  );

  const rotateJoinCode = useCallback(
    async (groupId) => {
      await rotateJoinCodeApi(groupId);
      await fetchGroups();
    },
    [fetchGroups]
  );

  const removeGroupMember = useCallback(
    async (groupId, userId) => {
      await removeGroupMemberApi(groupId, userId);
      await fetchGroups();
      await fetchTrackers();
    },
    [fetchGroups, fetchTrackers]
  );

  const leaveGroup = useCallback(
    async (groupId) => {
      await leaveGroupApi(groupId);
      await fetchGroups();
      await fetchTrackers();
    },
    [fetchGroups, fetchTrackers]
  );

  const deleteGroup = useCallback(
    async (groupId) => {
      await deleteGroupApi(groupId);
      await fetchGroups();
      await fetchTrackers();
    },
    [fetchGroups, fetchTrackers]
  );

  return {
    trackers,
    visibleTrackers,
    archivedCount,
    showArchived,
    setShowArchived,
    isLoadingTrackers,
    groups,
    selectedTrackerId,
    setSelectedTrackerId,
    selectedCategory,
    setSelectedCategory,
    selectedTracker,
    journals,
    habitLogs,
    journalFormData,
    setJournalFormData,
    journalSearch,
    setJournalSearch,
    logFormData,
    setLogFormData,
    trackerFormData,
    setTrackerFormData,
    isCreatingCategory,
    setIsCreatingCategory,
    existingCategories,
    sortedCategoryEntries,
    selectedCategoryTrackers,
    activeCategory,
    refreshTrackers: fetchTrackers,
    fetchGroups,
    createGroup,
    joinGroup,
    renameGroup,
    rotateJoinCode,
    removeGroupMember,
    leaveGroup,
    deleteGroup,
    openTrackerModalData,
    submitTracker,
    deleteTracker,
    toggleTrackerStatus,
    archiveTracker,
    unarchiveTracker,
    resetTracker,
    submitJournal,
    deleteJournal,
    submitLog,
    quickMarkBooleanDone,
    updateLog,
    deleteLog
  };
}
