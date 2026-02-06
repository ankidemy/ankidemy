"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/components/core/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/core/card';
import { getCurrentUser } from '@/lib/api';
import { AppPreferences, loadAppPreferences, updateAppPreferences } from '@/lib/app-preferences';
import { playDueReviewNotificationSound } from '@/lib/due-review-notification-sound';
import { playSurveyQueueNotificationSound } from '@/lib/survey-notification-sound';

const DEFAULT_PREFERENCES: AppPreferences = {
  version: 1,
  notifications: {
    surveyQueueSoundEnabled: true,
    dueReviewBatchSoundEnabled: true,
    dueReviewBatchSize: 10,
  },
};

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const checkAuthAndLoadPreferences = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          router.push('/login');
          return;
        }
        setPreferences(loadAppPreferences());
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    void checkAuthAndLoadPreferences();
  }, [router]);

  const surveySoundEnabled = preferences.notifications?.surveyQueueSoundEnabled !== false;
  const dueReviewSoundEnabled = preferences.notifications?.dueReviewBatchSoundEnabled !== false;
  const dueReviewBatchSize = (() => {
    const parsed = Number(preferences.notifications?.dueReviewBatchSize ?? 10);
    if (!Number.isFinite(parsed)) return 10;
    return Math.max(1, Math.floor(parsed));
  })();

  const handleSurveySoundToggle = (enabled: boolean) => {
    const next = updateAppPreferences({
      notifications: {
        surveyQueueSoundEnabled: enabled,
      },
    });
    setPreferences(next);
  };

  const handleDueReviewSoundToggle = (enabled: boolean) => {
    const next = updateAppPreferences({
      notifications: {
        dueReviewBatchSoundEnabled: enabled,
      },
    });
    setPreferences(next);
  };

  const handleDueReviewBatchSizeChange = (value: number) => {
    const safeValue = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 10;
    const next = updateAppPreferences({
      notifications: {
        dueReviewBatchSize: safeValue,
      },
    });
    setPreferences(next);
  };

  if (loading) {
    return <p className="text-center text-gray-500 py-10">Loading settings...</p>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-orange-500">Settings</h1>
        <Link href="/main">
          <Button variant="outline" size="sm">Back To Main</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">App Preferences</CardTitle>
          <CardDescription>
            Preferences on this page are stored locally in this browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-md border border-gray-200 p-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-gray-900">
                Survey Queue Sound Notifications
              </div>
              <p className="text-xs text-gray-600">
                Play a subtle sound when new quests enter your survey queue.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={surveySoundEnabled}
                onChange={(event) => handleSurveySoundToggle(event.target.checked)}
              />
              <span className="text-xs text-gray-700">{surveySoundEnabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          </div>

          <div className="flex items-center justify-between rounded-md border border-gray-200 p-4">
            <div className="text-xs text-gray-600">
              Test the current notification sound.
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={playSurveyQueueNotificationSound}
            >
              Play Test Sound
            </Button>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border border-gray-200 p-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-gray-900">
                Top Notifications Sound Alerts
              </div>
              <p className="text-xs text-gray-600">
                Play a subtle sound when due reviews reach each configured batch threshold.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={dueReviewSoundEnabled}
                onChange={(event) => handleDueReviewSoundToggle(event.target.checked)}
              />
              <span className="text-xs text-gray-700">{dueReviewSoundEnabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-gray-200 p-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-gray-900">
                Due Alert Batch Size
              </div>
              <p className="text-xs text-gray-600">
                Alerts trigger at multiples of this value (for example: 10, 20, 30).
              </p>
            </div>
            <input
              type="number"
              min={1}
              value={dueReviewBatchSize}
              onChange={(event) => handleDueReviewBatchSizeChange(Number(event.target.value))}
              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-gray-200 p-4">
            <div className="text-xs text-gray-600">
              Test the top notifications alert sound.
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={playDueReviewNotificationSound}
            >
              Play Due Alert Sound
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
