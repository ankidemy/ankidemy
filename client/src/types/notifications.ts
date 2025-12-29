export type NotificationKind = 'domain-review-due';

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
  };
}
