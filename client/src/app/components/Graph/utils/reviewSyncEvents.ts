export const REVIEW_ITEM_CONTENT_UPDATED_EVENT = 'ankidemy:review-item-content-updated';
export const REVIEW_SUBMISSION_STATE_EVENT = 'ankidemy:review-submission-state';

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

export const dispatchReviewSubmissionState = (inFlight: boolean): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REVIEW_SUBMISSION_STATE_EVENT, {
    detail: { inFlight },
  }));
};
