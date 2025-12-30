// client/src/app/components/Domain/DomainAccessModal.tsx
"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/core/card";
import { X } from 'lucide-react';
import {
  createDomainInvite,
  getDomainPermissions,
  removeDomainPermission,
  DomainPermissionInfo,
  DomainPermissionList,
} from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';

interface DomainAccessModalProps {
  isOpen: boolean;
  domainId: number;
  domainName: string;
  onClose: () => void;
}

const DomainAccessModal: React.FC<DomainAccessModalProps> = ({
  isOpen,
  domainId,
  domainName,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [owner, setOwner] = useState<DomainPermissionList['owner'] | null>(null);
  const [permissions, setPermissions] = useState<DomainPermissionInfo[]>([]);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer');
  const [inviting, setInviting] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set());

  const sortedPermissions = useMemo(() => {
    return [...permissions].sort((a, b) => a.username.localeCompare(b.username));
  }, [permissions]);

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getDomainPermissions(domainId);
        setOwner(data.owner);
        setPermissions(data.permissions || []);
      } catch (error) {
        console.error('Failed to load domain permissions:', error);
        showToast('Failed to load permissions', 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen, domainId]);

  const handleInvite = async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      showToast('Enter a username to invite', 'warning');
      return;
    }

    setInviting(true);
    try {
      await createDomainInvite(domainId, { username: trimmed, role });
      showToast(`Invitation sent to ${trimmed}`, 'success');
      setUsername('');
    } catch (error: any) {
      console.error('Failed to send invite:', error);
      showToast(error?.message || 'Failed to send invite', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (entry: DomainPermissionInfo) => {
    if (removingIds.has(entry.userId)) return;
    const confirmed = window.confirm(`Remove ${entry.username} from this domain?`);
    if (!confirmed) return;

    setRemovingIds(prev => new Set(prev).add(entry.userId));
    try {
      await removeDomainPermission(domainId, entry.userId);
      setPermissions(prev => prev.filter(p => p.userId !== entry.userId));
      showToast(`Removed ${entry.username}`, 'success');
    } catch (error: any) {
      console.error('Failed to remove permission:', error);
      showToast(error?.message || 'Failed to remove permission', 'error');
    } finally {
      setRemovingIds(prev => {
        const next = new Set(prev);
        next.delete(entry.userId);
        return next;
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-xl">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Manage Access</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X size={18} />
            </Button>
          </div>
          <div className="text-sm text-gray-500">
            Invite collaborators to <span className="font-medium text-gray-700">{domainName}</span>.
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Owner</h4>
            {owner ? (
              <div className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                <div>
                  <div className="text-sm font-medium text-gray-800">{owner.username}</div>
                  <div className="text-xs text-gray-500">Full control</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Owner details unavailable.</div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Collaborators</h4>
            {loading ? (
              <div className="text-sm text-gray-500">Loading permissions...</div>
            ) : sortedPermissions.length === 0 ? (
              <div className="text-sm text-gray-500">No collaborators yet.</div>
            ) : (
              <div className="space-y-2">
                {sortedPermissions.map(entry => (
                  <div key={entry.userId} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-800">{entry.username}</div>
                      <div className="text-xs text-gray-500 capitalize">{entry.role}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRemove(entry)}
                      disabled={removingIds.has(entry.userId)}
                    >
                      {removingIds.has(entry.userId) ? 'Removing...' : 'Remove'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Invite by Username</h4>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                className="flex-1 border rounded px-3 py-2 text-sm"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <select
                className="border rounded px-3 py-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <Button onClick={handleInvite} disabled={inviting}>
                {inviting ? 'Sending...' : 'Send Invite'}
              </Button>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              Editors can modify nodes; viewers can only read.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DomainAccessModal;
