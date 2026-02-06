// src/app/(page)/main/domains/invitations/page.tsx
"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/app/components/Navbar';
import { Button } from '@/app/components/core/button';
import { Card } from '@/app/components/core/card';
import { showToast } from '@/app/components/core/ToastNotification';
import {
  DomainInvite,
  acceptDomainInvite,
  declineDomainInvite,
  getCurrentUser,
  getPendingDomainInvites,
} from '@/lib/api';
import { useNotifications } from '@/contexts/NotificationContext';

export default function DomainInvitationsPage() {
  const router = useRouter();
  const { refreshNotifications } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<DomainInvite[]>([]);
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const load = async () => {
      try {
        await getCurrentUser();
      } catch {
        router.push('/login');
        return;
      }

      try {
        const data = await getPendingDomainInvites({
          component: "DomainInvitationsPage.useEffect",
          action: "initial-invite-load",
        });
        setInvites(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Failed to load invites:', error);
        setError('Failed to load invitations.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const markProcessing = (inviteId: number, active: boolean) => {
    setProcessingIds(prev => {
      const next = new Set(prev);
      if (active) next.add(inviteId);
      else next.delete(inviteId);
      return next;
    });
  };

  const handleAccept = async (invite: DomainInvite) => {
    if (processingIds.has(invite.id)) return;
    markProcessing(invite.id, true);
    try {
      await acceptDomainInvite(invite.id, {
        component: "DomainInvitationsPage.handleAccept",
        action: "accept-invite",
      });
      setInvites(prev => prev.filter(item => item.id !== invite.id));
      showToast(`Accepted invite to "${invite.domainName}"`, 'success');
    } catch (error: any) {
      console.error('Failed to accept invite:', error);
      showToast(error?.message || 'Failed to accept invite', 'error');
    } finally {
      refreshNotifications().catch(() => {});
      markProcessing(invite.id, false);
    }
  };

  const handleDecline = async (invite: DomainInvite) => {
    if (processingIds.has(invite.id)) return;
    markProcessing(invite.id, true);
    try {
      await declineDomainInvite(invite.id, {
        component: "DomainInvitationsPage.handleDecline",
        action: "decline-invite",
      });
      setInvites(prev => prev.filter(item => item.id !== invite.id));
      showToast(`Declined invite to "${invite.domainName}"`, 'success');
    } catch (error: any) {
      console.error('Failed to decline invite:', error);
      showToast(error?.message || 'Failed to decline invite', 'error');
    } finally {
      refreshNotifications().catch(() => {});
      markProcessing(invite.id, false);
    }
  };

  return (
    <div>
      <Navbar extraMenuItems={[
        { href: '/main/domains/invitations', label: 'Invitations' },
        { href: '/main/domains/archived', label: 'Archived Domains' },
      ]} />

      <div className="min-h-screen bg-white w-full mt-16">
        <div className="w-full max-w-5xl mx-auto px-6 sm:px-8 lg:px-16 py-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Domain Invitations</h1>
            <Link href="/main">
              <Button variant="outline">Back to Main</Button>
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-600 p-4 rounded">{error}</div>
          ) : invites.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-600">You have no pending invitations.</p>
              <div className="mt-4">
                <Link href="/main">
                  <Button>Go to Main</Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {invites.map(invite => (
                <Card key={invite.id} className="p-6 rounded-xl border-0 shadow-sm">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">{invite.domainName}</h3>
                      <div className="text-sm text-gray-500 mt-1">
                        Role: <span className="capitalize">{invite.role}</span>
                        {invite.invitedByUsername ? ` · Invited by ${invite.invitedByUsername}` : ''}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Sent {invite.createdAt ? new Date(invite.createdAt).toLocaleDateString() : 'recently'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleAccept(invite)}
                        disabled={processingIds.has(invite.id)}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleDecline(invite)}
                        disabled={processingIds.has(invite.id)}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
