import { useAppState } from '../state/appState';
import JournalSection from './tracker/JournalSection';
import TrackerCharts from './tracker/TrackerCharts';
import TrackerHeader from './tracker/TrackerHeader';
import TrackerLeaderboard from './tracker/TrackerLeaderboard';
import TrackerStats from './tracker/TrackerStats';

function TrackerView() {
  const {
    selectedTracker,
    canManageSelectedTracker,
    dailyProgress,
    currentMath,
    streakStats,
    consistency,
    weekdayBreakdown,
    moodTrend,
    effectiveStartDate,
    historicalChartData,
    buildHeatmap,
    shareStats,
    habitLogs,
    handleDeleteLog,
    updateLog,
    setIsSidebarOpen,
    setSelectedCategory,
    setIsLogModalOpen,
    setLogFormData,
    handleQuickBooleanLog,
    handleResetTracker,
    handleToggleTrackerStatus,
    handleArchiveTracker,
    handleUnarchiveTracker,
    openTrackerModal,
    handleDeleteTracker,
    journalFormData,
    setJournalFormData,
    handleJournalSubmit,
    journals,
    handleDeleteJournal,
    journalSearch,
    setJournalSearch
  } = useAppState();

  if (!selectedTracker) return null;

  return (
    <div className="flex-1 overflow-y-auto">
      <TrackerHeader
        selectedTracker={selectedTracker}
        canManageTracker={canManageSelectedTracker}
        dailyProgress={dailyProgress}
        effectiveStartDate={effectiveStartDate}
        setIsSidebarOpen={setIsSidebarOpen}
        setSelectedCategory={setSelectedCategory}
        setIsLogModalOpen={setIsLogModalOpen}
        setLogFormData={setLogFormData}
        onQuickBooleanLog={handleQuickBooleanLog}
        handleResetTracker={handleResetTracker}
        toggleTrackerStatus={handleToggleTrackerStatus}
        archiveTracker={handleArchiveTracker}
        unarchiveTracker={handleUnarchiveTracker}
        openTrackerModal={openTrackerModal}
        deleteTracker={handleDeleteTracker}
      />

      <TrackerStats
        selectedTracker={selectedTracker}
        dailyProgress={dailyProgress}
        currentMath={currentMath}
        streakStats={streakStats}
        consistency={consistency}
        shareStats={shareStats}
      />

      <div className="flex flex-col px-4 pb-10 md:px-10">
        <TrackerCharts
          selectedTracker={selectedTracker}
          historicalChartData={historicalChartData}
          buildHeatmap={buildHeatmap}
          weekdayBreakdown={weekdayBreakdown}
          habitLogs={habitLogs}
          deleteLog={handleDeleteLog}
          updateLog={updateLog}
        />

        <TrackerLeaderboard shareStats={shareStats} />

        <JournalSection
          journalFormData={journalFormData}
          setJournalFormData={setJournalFormData}
          handleJournalSubmit={handleJournalSubmit}
          journals={journals}
          deleteJournal={handleDeleteJournal}
          journalSearch={journalSearch}
          setJournalSearch={setJournalSearch}
          moodTrend={moodTrend}
        />
      </div>
    </div>
  );
}

export default TrackerView;
