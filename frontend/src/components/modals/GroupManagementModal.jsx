import { Check, Copy, Crown, LogIn, LogOut, Pencil, Plus, RefreshCw, Trash2, UserMinus, Users } from 'lucide-react';
import { useState } from 'react';
import { useAppState } from '../../state/appState';
import { formatDate } from '../../utils/date';
import Modal from '../ui/Modal';

const inputClass =
  'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none focus:border-stone-400';

function GroupCard({ group, currentUserId }) {
  const { renameGroup, rotateJoinCode, removeGroupMember, leaveGroup, deleteGroup, confirm, notify } = useAppState();

  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(group.name);
  const [copied, setCopied] = useState(false);
  const isOwner = group.owner_id === currentUserId;

  const copyJoinCode = async () => {
    try {
      await navigator.clipboard.writeText(group.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied outside secure contexts; the code is on
      // screen either way, so this is not worth an error toast.
      notify.info(`Join code: ${group.join_code}`);
    }
  };

  const handleRename = async (event) => {
    event.preventDefault();
    if (!draftName.trim() || draftName.trim() === group.name) {
      setIsRenaming(false);
      return;
    }
    try {
      await renameGroup(group.id, draftName.trim());
      notify.success('Group renamed');
      setIsRenaming(false);
    } catch (error) {
      notify.error(error.message || 'Could not rename the group');
    }
  };

  const handleRotate = async () => {
    const accepted = await confirm({
      title: 'Generate a new join code?',
      message: 'The current code stops working immediately. Members who already joined are unaffected.',
      confirmLabel: 'Generate new code',
      tone: 'default'
    });
    if (!accepted) return;

    try {
      await rotateJoinCode(group.id);
      notify.success('New join code generated');
    } catch (error) {
      notify.error(error.message || 'Could not generate a new code');
    }
  };

  const handleRemoveMember = async (member) => {
    const accepted = await confirm({
      title: `Remove ${member.user.username}?`,
      message:
        'They lose access to this group and its shared trackers. Their own logs and journal entries are kept.',
      confirmLabel: 'Remove',
      tone: 'danger'
    });
    if (!accepted) return;

    try {
      await removeGroupMember(group.id, member.user.id);
      notify.success(`${member.user.username} removed`);
    } catch (error) {
      notify.error(error.message || 'Could not remove that member');
    }
  };

  const handleLeave = async () => {
    const accepted = await confirm({
      title: `Leave ${group.name}?`,
      message: 'You lose access to its shared trackers. Your own history stays with you.',
      confirmLabel: 'Leave group',
      tone: 'danger'
    });
    if (!accepted) return;

    try {
      await leaveGroup(group.id);
      notify.success(`You left ${group.name}`);
    } catch (error) {
      notify.error(error.message || 'Could not leave the group');
    }
  };

  const handleDelete = async () => {
    const accepted = await confirm({
      title: `Delete ${group.name}?`,
      message: `Its ${group.tracker_count} shared tracker${
        group.tracker_count === 1 ? '' : 's'
      } become private trackers owned by whoever created them. No history is deleted.`,
      confirmLabel: 'Delete group',
      tone: 'danger',
      requireText: group.name
    });
    if (!accepted) return;

    try {
      await deleteGroup(group.id);
      notify.success('Group deleted');
    } catch (error) {
      notify.error(error.message || 'Could not delete the group');
    }
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <form onSubmit={handleRename} className="flex gap-2">
              <input
                type="text"
                value={draftName}
                maxLength={80}
                onChange={(event) => setDraftName(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-stone-500"
                aria-label="Group name"
              />
              <button type="submit" className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftName(group.name);
                  setIsRenaming(false);
                }}
                className="rounded-lg px-2 py-1.5 text-xs text-stone-500"
              >
                Cancel
              </button>
            </form>
          ) : (
            <h4 className="flex items-center gap-2 truncate font-semibold text-stone-900">
              {group.name}
              {isOwner && <Crown size={14} className="shrink-0 text-amber-500" aria-label="You own this group" />}
            </h4>
          )}
          <p className="mt-1 text-xs text-stone-500">
            {group.member_count} member{group.member_count === 1 ? '' : 's'} · {group.tracker_count} shared tracker
            {group.tracker_count === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex shrink-0 gap-1">
          {isOwner && !isRenaming && (
            <button
              type="button"
              onClick={() => setIsRenaming(true)}
              title="Rename group"
              aria-label={`Rename ${group.name}`}
              className="rounded-lg border border-stone-200 p-2 text-stone-500 transition-colors hover:border-stone-300 hover:bg-white hover:text-stone-900"
            >
              <Pencil size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={copyJoinCode}
            title="Copy join code"
            aria-label={`Copy the join code for ${group.name}`}
            className="rounded-lg border border-stone-200 p-2 text-stone-500 transition-colors hover:border-stone-300 hover:bg-white hover:text-stone-900"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 rounded-xl bg-white px-3 py-2 font-mono text-xs tracking-[0.2em] text-stone-600">
          {group.join_code}
        </code>
        {isOwner && (
          <button
            type="button"
            onClick={handleRotate}
            title="Generate a new join code"
            aria-label="Generate a new join code"
            className="rounded-lg border border-stone-200 p-2 text-stone-500 transition-colors hover:border-stone-300 hover:bg-white hover:text-stone-900"
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      {group.members?.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-stone-200 pt-3">
          {group.members.map((member) => (
            <li key={member.user.id} className="flex items-center justify-between gap-2 px-1 py-1 text-sm">
              <span className="min-w-0 flex-1 truncate text-stone-700">
                {member.user.username}
                {member.user.id === currentUserId && <span className="ml-1.5 text-xs text-stone-400">(you)</span>}
                <span className="ml-2 text-xs text-stone-400">joined {formatDate(member.joined_at)}</span>
              </span>
              {isOwner && member.user.id !== group.owner_id && (
                <button
                  type="button"
                  onClick={() => handleRemoveMember(member)}
                  title={`Remove ${member.user.username}`}
                  aria-label={`Remove ${member.user.username} from ${group.name}`}
                  className="shrink-0 rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                >
                  <UserMinus size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex justify-end border-t border-stone-200 pt-3">
        {isOwner ? (
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 transition-colors hover:text-rose-700"
          >
            <Trash2 size={13} /> Delete group
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLeave}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 transition-colors hover:text-rose-700"
          >
            <LogOut size={13} /> Leave group
          </button>
        )}
      </div>
    </div>
  );
}

function GroupManagementModal() {
  const { isGroupManagementOpen, setIsGroupManagementOpen, groups, createGroup, joinGroup, user, notify } =
    useAppState();

  const [groupName, setGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('list');

  if (!isGroupManagementOpen) return null;

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!groupName.trim()) return;

    setIsSubmitting(true);
    try {
      await createGroup(groupName.trim());
      notify.success(`Group "${groupName.trim()}" created`);
      setGroupName('');
      setActiveTab('list');
    } catch (error) {
      notify.error(error.message || 'Could not create the group');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoin = async (event) => {
    event.preventDefault();
    if (!joinCode.trim()) return;

    setIsSubmitting(true);
    try {
      const group = await joinGroup(joinCode.trim());
      notify.success(`Joined ${group?.name || 'the group'}`);
      setJoinCode('');
      setActiveTab('list');
    } catch (error) {
      notify.error(error.message || 'Could not join that group');
    } finally {
      setIsSubmitting(false);
    }
  };

  const TABS = [
    { id: 'list', label: 'Your groups', badge: groups.length },
    { id: 'create', label: 'Create' },
    { id: 'join', label: 'Join' }
  ];

  return (
    <Modal
      isOpen
      onClose={() => setIsGroupManagementOpen(false)}
      title="Groups"
      description="Share trackers with family or friends and compare progress."
      size="xl"
    >
      <div className="mb-6 flex gap-2 border-b border-gray-100">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'list' && (
        <div className="space-y-3">
          {groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-8 text-center">
              <Users size={32} className="mx-auto mb-3 text-stone-300" />
              <p className="mb-1 text-sm text-stone-600">No groups yet</p>
              <p className="text-xs text-stone-500">Create one, or join with a code someone shared with you.</p>
            </div>
          ) : (
            groups.map((group) => <GroupCard key={group.id} group={group} currentUserId={user?.id} />)
          )}
        </div>
      )}

      {activeTab === 'create' && (
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label htmlFor="group-name" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-stone-500">
              Group name
            </label>
            <input
              id="group-name"
              value={groupName}
              maxLength={80}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="e.g. Family, Friends, Team"
              className={inputClass}
              required
            />
          </div>
          <p className="text-xs text-stone-500">
            You will get a join code to share. Only you can add shared trackers to a group you own.
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-60"
          >
            <Plus size={16} /> Create group
          </button>
        </form>
      )}

      {activeTab === 'join' && (
        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label htmlFor="join-code" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-stone-500">
              Join code
            </label>
            <input
              id="join-code"
              value={joinCode}
              maxLength={32}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="ABCD1234"
              className={`${inputClass} tracking-[0.18em] uppercase`}
              required
            />
          </div>
          <p className="text-xs text-stone-500">Ask a group member for their code.</p>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-60"
          >
            <LogIn size={16} /> Join group
          </button>
        </form>
      )}
    </Modal>
  );
}

export default GroupManagementModal;
