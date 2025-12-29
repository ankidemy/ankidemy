"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, RefreshCw } from "lucide-react";
import { useNotifications } from "@/contexts/NotificationContext";

interface NotificationCenterProps {
  suppressDomainId?: number;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ suppressDomainId }) => {
  const {
    notifications,
    domainDueCounts,
    unreadCount,
    readCounts,
    loading,
    lastUpdated,
    refreshNotifications,
    markAllAsRead,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const suppressedUnreadCount = useMemo(() => {
    if (!suppressDomainId) return 0;
    const dueCount = domainDueCounts[suppressDomainId] ?? 0;
    const lastRead = readCounts[suppressDomainId] ?? 0;
    return dueCount > lastRead ? dueCount : 0;
  }, [suppressDomainId, domainDueCounts, readCounts]);

  const badgeCount = Math.max(unreadCount - suppressedUnreadCount, 0);

  const badgeText = useMemo(() => {
    if (badgeCount > 99) return "99+";
    return badgeCount.toString();
  }, [badgeCount]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      markAllAsRead();
    }
  }, [open, markAllAsRead]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="relative flex items-center justify-center h-9 w-9 rounded-full border border-gray-200 text-gray-600 hover:text-orange-500 hover:border-orange-200 transition-colors"
        aria-label="Open notifications"
      >
        <Bell size={18} />
        {badgeCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-orange-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-xl border z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="text-sm font-semibold text-gray-800">Notifications</div>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => markAllAsRead()}
                className="text-gray-500 hover:text-orange-500"
              >
                Mark all read
              </button>
              <button
                type="button"
                onClick={() => refreshNotifications()}
                className="inline-flex items-center gap-1 text-gray-500 hover:text-orange-500"
                disabled={loading}
              >
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 && (
              <div className="px-4 py-6 text-sm text-gray-500">Loading notifications...</div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="px-4 py-6 text-sm text-gray-500">No notifications right now.</div>
            )}
            {notifications.length > 0 && (
              <ul className="py-2">
                {notifications.map(notification => (
                  <li key={notification.id}>
                    {notification.href ? (
                      <Link
                        href={notification.href}
                        className="block px-4 py-3 hover:bg-orange-50 transition-colors"
                        onClick={() => setOpen(false)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-800">
                            {notification.title}
                          </span>
                          {notification.meta?.dueCount !== undefined &&
                            (!suppressDomainId || notification.meta?.domainId !== suppressDomainId) && (
                            <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                              {notification.meta.dueCount}
                            </span>
                          )}
                        </div>
                        {notification.description && (
                          <p className="text-xs text-gray-500 mt-1">{notification.description}</p>
                        )}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-800">
                          {notification.title}
                        </div>
                        {notification.description && (
                          <p className="text-xs text-gray-500 mt-1">{notification.description}</p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {lastUpdated && (
            <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400">
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
