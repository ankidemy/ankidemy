export const REVIEW_ITEM_CONTENT_UPDATED_EVENT = 'ankidemy:review-item-content-updated';

export interface ReviewItemContentUpdatedDetail {
  nodeType: 'definition' | 'exercise';
  metaId: number;
  versionId?: number;
}

export const dispatchReviewItemContentUpdated = (detail: ReviewItemContentUpdatedDetail): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ReviewItemContentUpdatedDetail>(REVIEW_ITEM_CONTENT_UPDATED_EVENT, { detail }),
  );
};
