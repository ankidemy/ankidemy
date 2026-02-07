"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getNotificationSummary } from "@/lib/srs-api";
import { getDueReviewBatchSize, isDueReviewBatchSoundEnabled } from "@/lib/app-preferences";
import {
  playDueReviewNotificationSound,
  primeDueReviewNotificationSound,
} from "@/lib/due-review-notification-sound";
import type { NotificationItem } from "@/types/notifications";
import type { NotificationSummaryDomain, NotificationSummaryInvite } from "@/types/srs";

interface NotificationContextValue {
  notifications: NotificationItem[];
  domainDueCounts: Record<number, number>;
  domainAlertDueCounts: Record<number, number>;
  totalDueCount: number;
  unreadCount: number;
  readCounts: Record<number, number>;
  loading: boolean;
  lastUpdated: number | null;
  refreshNotifications: () => Promise<void>;
  markAllAsRead: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);
const READ_COUNTS_STORAGE_KEY = "ankidemy:notifications:read-counts:v1";

const loadReadCounts = (): Record<number, number> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(READ_COUNTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const readCounts: Record<number, number> = {};
    Object.entries(parsed).forEach(([key, value]) => {
      const id = Number(key);
      const count = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(id) || !Number.isFinite(count)) return;
      readCounts[id] = Math.max(0, Math.floor(count));
    });
    return readCounts;
  } catch {
    return {};
  }
};

const saveReadCounts = (readCounts: Record<number, number>) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READ_COUNTS_STORAGE_KEY, JSON.stringify(readCounts));
  } catch {}
};

const getAlertedDueCount = (dueCount: number, batchSize: number): number => {
  if (!Number.isFinite(dueCount) || dueCount < 0) return 0;
  const normalizedDue = Math.floor(dueCount);
  if (normalizedDue < batchSize) return 0;
  return Math.floor(normalizedDue / batchSize) * batchSize;
};

const getAlertLabel = (alertedDueCount: number, dueCount: number): string =>
  dueCount > alertedDueCount ? `${alertedDueCount}+` : `${alertedDueCount}`;

const buildNotifications = (
  domains: NotificationSummaryDomain[],
  invites: NotificationSummaryInvite[],
  batchSize: number,
): {
  notifications: NotificationItem[];
  domainDueCounts: Record<number, number>;
  domainAlertDueCounts: Record<number, number>;
  inviteCount: number;
} => {
  const domainDueCounts: Record<number, number> = {};
  const domainAlertDueCounts: Record<number, number> = {};
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

  domains.forEach(domain => {
    const safeCount = Number.isFinite(domain.dueCount) ? Math.max(0, Math.floor(domain.dueCount)) : 0;
    const alertedDueCount = getAlertedDueCount(safeCount, batchSize);
    const dueLabel = getAlertLabel(alertedDueCount, safeCount);
    domainDueCounts[domain.domainId] = safeCount;
    domainAlertDueCounts[domain.domainId] = alertedDueCount;
    if (alertedDueCount > 0) {
      notifications.push({
        id: `domain-${domain.domainId}-due`,
        kind: "domain-review-due",
        title: domain.domainName,
        description: `${dueLabel} item${alertedDueCount === 1 ? "" : "s"} ready for review`,
        href: `/main/domains/${domain.domainId}/study`,
        createdAt: timestamp,
        meta: {
          domainId: domain.domainId,
          dueCount: alertedDueCount,
          dueLabel,
        },
      });
    }
  });

  notifications.sort((a, b) => {
    if (a.kind === "domain-invite" && b.kind !== "domain-invite") return -1;
    if (b.kind === "domain-invite" && a.kind !== "domain-invite") return 1;
    return (b.meta?.dueCount || 0) - (a.meta?.dueCount || 0);
  });

  return { notifications, domainDueCounts, domainAlertDueCounts, inviteCount: invites.length };
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [domainDueCounts, setDomainDueCounts] = useState<Record<number, number>>({});
  const [domainAlertDueCounts, setDomainAlertDueCounts] = useState<Record<number, number>>({});
  const [readCounts, setReadCounts] = useState<Record<number, number>>(() => loadReadCounts());
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const refreshInFlight = useRef(false);
  const previousDomainAlertDueCountsRef = useRef<Record<number, number>>({});
  const hasAlertSnapshotRef = useRef(false);
  const lastBatchSizeRef = useRef<number | null>(null);
  const notificationPollIntervalMs = 20000;

  const refreshNotifications = useCallback(async () => {
    if (refreshInFlight.current || typeof window === "undefined") return;

    const token = localStorage.getItem("token");
    if (!token) {
      setNotifications([]);
      setDomainDueCounts({});
      setDomainAlertDueCounts({});
      setReadCounts({});
      setPendingInviteCount(0);
      previousDomainAlertDueCountsRef.current = {};
      hasAlertSnapshotRef.current = false;
      lastBatchSizeRef.current = null;
      setLastUpdated(Date.now());
      return;
    }

    refreshInFlight.current = true;
    setLoading(true);
    try {
      const summary = await getNotificationSummary({
        component: "NotificationContext.refreshNotifications",
        action: "summary-refresh",
      });

      const domains = Array.isArray(summary?.domains) ? summary.domains : [];
      const invites = Array.isArray(summary?.invites) ? summary.invites : [];
      if (domains.length === 0 && invites.length === 0) {
        setNotifications([]);
        setDomainDueCounts({});
        setDomainAlertDueCounts({});
        setReadCounts({});
        setPendingInviteCount(0);
        previousDomainAlertDueCountsRef.current = {};
        hasAlertSnapshotRef.current = true;
        setLastUpdated(Date.now());
        return;
      }

      const batchSize = getDueReviewBatchSize();
      const {
        notifications,
        domainDueCounts,
        domainAlertDueCounts,
        inviteCount,
      } = buildNotifications(domains, invites, batchSize);
      const batchSizeChanged = lastBatchSizeRef.current !== null && lastBatchSizeRef.current !== batchSize;
      const shouldPlaySound =
        hasAlertSnapshotRef.current &&
        !batchSizeChanged &&
        Object.entries(domainAlertDueCounts).some(([id, alertedDueCount]) => {
          const numericId = Number(id);
          if (!Number.isFinite(numericId)) return false;
          const previous = previousDomainAlertDueCountsRef.current[numericId] ?? 0;
          return alertedDueCount > previous;
        });

      setNotifications(notifications);
      setDomainDueCounts(domainDueCounts);
      setDomainAlertDueCounts(domainAlertDueCounts);
      setPendingInviteCount(inviteCount);
      setReadCounts(prev => {
        const next: Record<number, number> = {};
        Object.entries(domainAlertDueCounts).forEach(([id, alertedDueCount]) => {
          const numericId = Number(id);
          if (!Number.isNaN(numericId)) {
            const prevRead = prev[numericId];
            if (typeof prevRead === "number") {
              next[numericId] = Math.min(prevRead, alertedDueCount);
            }
          }
        });
        return next;
      });

      previousDomainAlertDueCountsRef.current = domainAlertDueCounts;
      hasAlertSnapshotRef.current = true;
      lastBatchSizeRef.current = batchSize;

      if (shouldPlaySound && isDueReviewBatchSoundEnabled()) {
        playDueReviewNotificationSound();
      }

      setLastUpdated(Date.now());
    } catch (error) {
      console.warn("Failed to refresh notifications:", error);
    } finally {
      setLoading(false);
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    saveReadCounts(readCounts);
  }, [readCounts]);

  useEffect(() => {
    refreshNotifications();
    const interval = setInterval(refreshNotifications, notificationPollIntervalMs);
    return () => clearInterval(interval);
  }, [refreshNotifications, notificationPollIntervalMs]);

  useEffect(() => {
    const primeAudio = () => {
      primeDueReviewNotificationSound();
    };

    window.addEventListener("pointerdown", primeAudio, { once: true });
    window.addEventListener("keydown", primeAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", primeAudio);
      window.removeEventListener("keydown", primeAudio);
    };
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      refreshNotifications();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshNotifications();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshNotifications]);

  const totalDueCount = useMemo(() => {
    return Object.values(domainDueCounts).reduce((sum, value) => sum + value, 0);
  }, [domainDueCounts]);

  const unreadCount = useMemo(() => {
    const dueUnread = Object.entries(domainAlertDueCounts).reduce((sum, [id, dueCount]) => {
      const numericId = Number(id);
      const lastRead = readCounts[numericId] ?? 0;
      return sum + (dueCount > lastRead ? dueCount : 0);
    }, 0);
    return dueUnread + pendingInviteCount;
  }, [domainAlertDueCounts, readCounts, pendingInviteCount]);

  const markAllAsRead = useCallback(() => {
    setReadCounts(prev => {
      const next = { ...prev };
      Object.entries(domainAlertDueCounts).forEach(([id, dueCount]) => {
        const numericId = Number(id);
        if (!Number.isNaN(numericId)) {
          next[numericId] = dueCount;
        }
      });
      return next;
    });
  }, [domainAlertDueCounts]);

  const value = useMemo(
    () => ({
      notifications,
      domainDueCounts,
      domainAlertDueCounts,
      totalDueCount,
      unreadCount,
      readCounts,
      loading,
      lastUpdated,
      refreshNotifications,
      markAllAsRead,
    }),
    [
      notifications,
      domainDueCounts,
      domainAlertDueCounts,
      totalDueCount,
      unreadCount,
      readCounts,
      loading,
      lastUpdated,
      refreshNotifications,
      markAllAsRead,
    ]
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
