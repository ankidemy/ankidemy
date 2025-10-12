// src/app/(page)/main/domains/archived/page.tsx
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/app/components/Navbar';
import { Button } from '@/app/components/core/button';
import { Card } from '@/app/components/core/card';
import { showToast } from '@/app/components/core/ToastNotification';
import { 
  Domain,
  getMyArchivedDomains,
  restoreDomain,
  purgeDomain,
  getCurrentUser,
  User
} from '@/lib/api';

export default function ArchivedDomainsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const u = await getCurrentUser();
        setCurrentUser(u);
      } catch {
        // If not logged in, redirect to login
        router.push('/login');
        return;
      }
      try {
        const data = await getMyArchivedDomains();
        setDomains(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('Failed to load archived domains', e);
        setError('Failed to load archived domains.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const handleUnarchive = async (domain: Domain) => {
    try {
      await restoreDomain(domain.id);
      setDomains(prev => prev.filter(d => d.id !== domain.id));
      showToast(`Restored "${domain.name}"`, 'success');
    } catch (e) {
      console.error('Restore failed', e);
      showToast('Failed to restore domain', 'error');
    }
  };

  const handlePurge = async (domain: Domain) => {
    const confirmed = window.confirm(`Permanently delete "${domain.name}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await purgeDomain(domain.id);
      setDomains(prev => prev.filter(d => d.id !== domain.id));
      showToast('Domain permanently deleted', 'success');
    } catch (e) {
      console.error('Purge failed', e);
      showToast('Failed to delete domain', 'error');
    }
  };


  return (
    <div>
      {/* Reuse Navbar dropdown menu like main/dashboard */}
      <Navbar extraMenuItems={[{ href: '/main/domains/archived', label: 'Archived Domains' }]} />

      <div className="min-h-screen bg-white w-full mt-16">
        <div className="w-full max-w-7xl mx-auto px-6 sm:px-8 lg:px-16 py-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Archived Domains</h1>
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
          ) : domains.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-600">You have no archived domains.</p>
              <div className="mt-4">
                <Link href="/main">
                  <Button>Go to Main</Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {domains.map((domain) => (
                <Card key={domain.id} className="p-6 rounded-xl border-0 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">{domain.name}</h3>
                  <p className="text-gray-600 mb-4 line-clamp-2 min-h-[2.5rem]">{domain.description || 'No description'}</p>
                  <div className="flex items-center justify-between">
                    <div className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">Archived</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleUnarchive(domain)}>Unarchive</Button>
                      <Button size="sm" variant="destructive" onClick={() => handlePurge(domain)}>Delete Permanently</Button>
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
