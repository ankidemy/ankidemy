// src/app/(page)/graph/page.tsx
"use client";

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function DeprecatedGraphPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const domainId = searchParams.get('domainId');
    if (domainId) {
      router.replace(`/main/domains/${domainId}/study`);
    } else {
      router.replace('/main');
    }
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
      Redirecting...
    </div>
  );
}

export default function DeprecatedGraphPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Loading...
      </div>
    }>
      <DeprecatedGraphPageContent />
    </Suspense>
  );
}
