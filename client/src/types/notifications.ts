export type NotificationKind = 'domain-review-due' | 'domain-invite';

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  description?: string;
  href?: string;
  createdAt: string;
  meta?: {
    domainId?: number;
    dueCount?: number;
    dueLabel?: string;
    inviteId?: number;
  };
}
