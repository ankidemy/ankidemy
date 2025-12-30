"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getEnrolledDomains, getMyDomains, getPendingDomainInvites } from "@/lib/api";
import { getDomainStats } from "@/lib/srs-api";
import type { Domain } from "@/lib/api";
import type { DomainInvite } from "@/lib/api";
import type { NotificationItem } from "@/types/notifications";

interface NotificationContextValue {
  notifications: NotificationItem[];
  domainDueCounts: Record<number, number>;
  totalDueCount: number;
  unreadCount: number;
  readCounts: Record<number, number>;
  loading: boolean;
  lastUpdated: number | null;
  refreshNotifications: () => Promise<void>;
  markAllAsRead: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

const buildNotifications = (domains: Domain[], stats: Array<number | null>, invites: DomainInvite[]): {
  notifications: NotificationItem[];
  domainDueCounts: Record<number, number>;
  inviteCount: number;
} => {
  const domainDueCounts: Record<number, number> = {};
  const notifications: NotificationItem[] = [];
  const timestamp = new Date().toISOString();

  invites.forEach(invite => {
    notifications.push({
      id: `invite-${invite.id}`,
      kind: "domain-invite",
      title: `Invitation to ${invite.domainName}`,
      description: `Role: ${invite.role} · From ${invite.invitedByUsername}`,
      href: `/main/domains/invitations`,
      createdAt: invite.createdAt || timestamp,
      meta: {
        domainId: invite.domainId,
        inviteId: invite.id,
      },
    });
  });

  stats.forEach((dueCount, index) => {
    const domain = domains[index];
    if (!domain) return;
    const safeCount = typeof dueCount === "number" ? dueCount : 0;
    domainDueCounts[domain.id] = safeCount;
    if (safeCount > 0) {
      notifications.push({
        id: `domain-${domain.id}-due`,
        kind: "domain-review-due",
        title: domain.name,
        description: `${safeCount} item${safeCount === 1 ? "" : "s"} ready for review`,
        href: `/main/domains/${domain.id}/study`,
        createdAt: timestamp,
        meta: {
          domainId: domain.id,
          dueCount: safeCount,
        },
      });
    }
  });

  notifications.sort((a, b) => {
    if (a.kind === "domain-invite" && b.kind !== "domain-invite") return -1;
    if (b.kind === "domain-invite" && a.kind !== "domain-invite") return 1;
    return (b.meta?.dueCount || 0) - (a.meta?.dueCount || 0);
  });

  return { notifications, domainDueCounts, inviteCount: invites.length };
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [domainDueCounts, setDomainDueCounts] = useState<Record<number, number>>({});
  const [readCounts, setReadCounts] = useState<Record<number, number>>({});
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const refreshInFlight = useRef(false);

  const refreshNotifications = useCallback(async () => {
    if (refreshInFlight.current || typeof window === "undefined") return;

    const token = localStorage.getItem("token");
    if (!token) {
      setNotifications([]);
      setDomainDueCounts({});
      setReadCounts({});
      setPendingInviteCount(0);
      setLastUpdated(Date.now());
      return;
    }

    refreshInFlight.current = true;
    setLoading(true);
    try {
      const [myResult, enrolledResult, inviteResult] = await Promise.allSettled([
        getMyDomains(),
        getEnrolledDomains(),
        getPendingDomainInvites(),
      ]);

      const domainMap = new Map<number, Domain>();
      if (myResult.status === "fulfilled") {
        myResult.value.forEach(domain => domainMap.set(domain.id, domain));
      }
      if (enrolledResult.status === "fulfilled") {
        enrolledResult.value.forEach(domain => domainMap.set(domain.id, domain));
      }

      const domains = Array.from(domainMap.values());
      const invites = inviteResult.status === "fulfilled" ? inviteResult.value : [];
      if (domains.length === 0 && invites.length === 0) {
        setNotifications([]);
        setDomainDueCounts({});
        setReadCounts({});
        setPendingInviteCount(0);
        setLastUpdated(Date.now());
        return;
      }

      const statsResults = await Promise.allSettled(
        domains.map(domain => getDomainStats(domain.id))
      );

      const dueCounts = statsResults.map(result => {
        if (result.status !== "fulfilled") return null;
        return typeof result.value?.dueReviews === "number" ? result.value.dueReviews : 0;
      });

      const { notifications, domainDueCounts, inviteCount } = buildNotifications(domains, dueCounts, invites);
      setNotifications(notifications);
      setDomainDueCounts(domainDueCounts);
      setPendingInviteCount(inviteCount);
      setReadCounts(prev => {
        const next: Record<number, number> = {};
        Object.entries(domainDueCounts).forEach(([id, dueCount]) => {
          const numericId = Number(id);
          if (!Number.isNaN(numericId)) {
            const prevRead = prev[numericId];
            if (typeof prevRead === "number") {
              next[numericId] = Math.min(prevRead, dueCount);
            }
          }
        });
        return next;
      });
      setLastUpdated(Date.now());
    } catch (error) {
      console.warn("Failed to refresh notifications:", error);
    } finally {
      setLoading(false);
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refreshNotifications();
    const interval = setInterval(refreshNotifications, 60000);
    return () => clearInterval(interval);
  }, [refreshNotifications]);

  const totalDueCount = useMemo(() => {
    return Object.values(domainDueCounts).reduce((sum, value) => sum + value, 0);
  }, [domainDueCounts]);

  const unreadCount = useMemo(() => {
    const dueUnread = Object.entries(domainDueCounts).reduce((sum, [id, dueCount]) => {
      const numericId = Number(id);
      const lastRead = readCounts[numericId] ?? 0;
      return sum + (dueCount > lastRead ? dueCount : 0);
    }, 0);
    return dueUnread + pendingInviteCount;
  }, [domainDueCounts, readCounts, pendingInviteCount]);

  const markAllAsRead = useCallback(() => {
    setReadCounts(prev => {
      const next = { ...prev };
      Object.entries(domainDueCounts).forEach(([id, dueCount]) => {
        const numericId = Number(id);
        if (!Number.isNaN(numericId)) {
          next[numericId] = dueCount;
        }
      });
      return next;
    });
  }, [domainDueCounts]);

  const value = useMemo(
    () => ({
      notifications,
      domainDueCounts,
      totalDueCount,
      unreadCount,
      readCounts,
      loading,
      lastUpdated,
      refreshNotifications,
      markAllAsRead,
    }),
    [notifications, domainDueCounts, totalDueCount, unreadCount, readCounts, loading, lastUpdated, refreshNotifications, markAllAsRead]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
};
