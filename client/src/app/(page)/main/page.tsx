// src/app/(page)/main/page.tsx
"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Button } from "@/app/components/core/button";
import { Card } from "@/app/components/core/card";
import { Plus, ArrowRight, Lock, Users, Globe, Upload, X, MoreVertical, Download, UserCheck, Wrench, Radio, Unplug, Unlink } from 'lucide-react';
import SubjectMatterGraph from '@/app/components/Graph/SubjectMatterGraph';
import { useRouter } from 'next/navigation';
import Navbar from "@/app/components/Navbar";
import DomainForm from "@/app/components/Domain/DomainForm";
import { showToast } from '@/app/components/core/ToastNotification';
import { useNotifications } from '@/contexts/NotificationContext';
import { useAppDarkMode } from '@/lib/use-app-dark-mode';
import { APP_PREFERENCES_UPDATED_EVENT } from '@/lib/app-preferences';
import ExplorerFontSizeOptionsSection from '@/app/components/core/ExplorerFontSizeOptionsSection';
import {
  adjustExplorerFontSizeStep,
  ExplorerFontSizeCategory,
  ExplorerFontSizeSteps,
  explorerFontSizeCssVariables,
  getExplorerFontSizeSteps,
} from '@/lib/explorer-font-sizes';

import {
  Domain,
  getPublicDomains,
  getMyDomains,
  getEnrolledDomains,
  getSharedDomains,
  enrollInDomain,
  getCurrentUser,
  User,
  exportDomainAsJson,
  downloadJsonFile,
  copyDomain
} from '@/lib/api';
import {
  archiveDomain,
  attachCurrentLiveImportRoot,
  detachLiveImportBinding,
  getLiveImportStatus,
  subscribeLiveImportEvents,
  LiveImportStatus,
} from '@/lib/api';

export default function MainPage() {
  const { domainDueCounts } = useNotifications();
  const isDarkMode = useAppDarkMode();

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'my' | 'shared' | 'enrolled' | 'community'>('community');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Domain data
  const [publicDomains, setPublicDomains] = useState<Domain[]>([]);
  const [myDomains, setMyDomains] = useState<Domain[]>([]);
  const [enrolledDomains, setEnrolledDomains] = useState<Domain[]>([]);
  const [sharedDomains, setSharedDomains] = useState<Domain[]>([]);
  const [displayDomains, setDisplayDomains] = useState<Domain[]>([]);
  
  // UI state
  const [enrolling, setEnrolling] = useState<Set<number>>(new Set());
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [copyDomainSource, setCopyDomainSource] = useState<Domain | null>(null);
  const [copyName, setCopyName] = useState('');
  const [copyDescription, setCopyDescription] = useState('');
  const [copyPrivacy, setCopyPrivacy] = useState<'public' | 'private'>('private');
  const [copying, setCopying] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [fontSizeSteps, setFontSizeSteps] = useState<ExplorerFontSizeSteps>(() => getExplorerFontSizeSteps());
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  // NEW: Create/Import dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [liveImportStatus, setLiveImportStatus] = useState<LiveImportStatus | null>(null);
  const [isAttachingLiveRoot, setIsAttachingLiveRoot] = useState(false);
  const [isDetachingLiveRoot, setIsDetachingLiveRoot] = useState(false);

  const router = useRouter();
  const explorerFontStyle = useMemo(
    () => explorerFontSizeCssVariables(fontSizeSteps) as React.CSSProperties,
    [fontSizeSteps]
  );

  // Close menu by clicking anywhere inside the page container; elements that should keep it open stop propagation.
  // Note: Using React bubbling avoids conflicts with native document listeners.

  // Load user data
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await getCurrentUser();
        setCurrentUser(userData);
        // Set default tab to 'my' for logged-in users
        setActiveTab('my');
      } catch (error) {
        console.error("Error loading user:", error);
        // Continue without user data - initial state is already 'community'
      }
    };
    fetchUser();
  }, []);

  // Load initial domain data
  useEffect(() => {
    const fetchDomains = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Get public domains (always available)
        const publicDomainsResponse = await getPublicDomains();
        setPublicDomains(publicDomainsResponse || []);
        
        // Get user's domains if authenticated
        let myDomainsResponse: Domain[] = [];
        let enrolledDomainsResponse: Domain[] = [];
        
        if (currentUser) {
          try {
            const [myResult, sharedResult, enrolledResult] = await Promise.allSettled([
              getMyDomains(),
              getSharedDomains(),
              getEnrolledDomains()
            ]);
            
            myDomainsResponse = myResult.status === 'fulfilled' ? myResult.value : [];
            const sharedDomainsResponse = sharedResult.status === 'fulfilled' ? sharedResult.value : [];
            enrolledDomainsResponse = enrolledResult.status === 'fulfilled' ? enrolledResult.value : [];
            setSharedDomains(sharedDomainsResponse);
          } catch (error) {
            console.error("Failed to load user domains:", error);
          }
        }
        
        setMyDomains(myDomainsResponse);
        setEnrolledDomains(enrolledDomainsResponse);

      } catch (error) {
        console.error("Failed to load domains:", error);
        setError("Failed to load domains. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchDomains();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setLiveImportStatus(null);
      return;
    }
    let active = true;
    let stopEvents: (() => void) | undefined;
    const refresh = async () => {
      try {
        const status = await getLiveImportStatus();
        if (!active) return;
        setLiveImportStatus(status);
        if (status.enabled && !stopEvents) {
          stopEvents = subscribeLiveImportEvents(event => {
            if (!active) return;
            if (event.type === 'connection.changed' && event.connectionState) {
              setLiveImportStatus(previous => previous ? { ...previous, connectionState: event.connectionState! } : previous);
            }
            if (event.type === 'root.available' || event.type === 'binding.detached') {
              void refresh();
            }
            if (event.type === 'sync.accepted') {
              void getMyDomains().then(domains => {
                if (active) setMyDomains(domains || []);
              });
            }
          });
        }
      } catch (liveImportError) {
        console.warn('Development live import is unavailable', liveImportError);
      }
    };
    void refresh();
    return () => {
      active = false;
      stopEvents?.();
    };
  }, [currentUser]);

  // Compute enrolledNonOwned (defensive client-side filter until server is deployed)
  const enrolledNonOwned = useMemo(() =>
    enrolledDomains.filter(d => d.ownerId !== currentUser?.id),
    [enrolledDomains, currentUser]
  );

  // Compute enrolledNonOwnedIds for quick lookup
  const enrolledNonOwnedIds = useMemo(() =>
    new Set(enrolledNonOwned.map(d => d.id)),
    [enrolledNonOwned]
  );

  const sharedDomainIds = useMemo(() =>
    new Set(sharedDomains.map(d => d.id)),
    [sharedDomains]
  );

  // Compute communityDomains (public domains that user doesn't own and isn't enrolled in)
  const communityDomains = useMemo(() =>
    publicDomains.filter(d =>
      d.ownerId !== currentUser?.id && !enrolledNonOwnedIds.has(d.id) && !sharedDomainIds.has(d.id)
    ),
    [publicDomains, currentUser, enrolledNonOwnedIds, sharedDomainIds]
  );

  // Update display domains when data changes or tab changes
  useEffect(() => {
    if (activeTab === 'my') {
      setDisplayDomains(myDomains);
    } else if (activeTab === 'shared') {
      setDisplayDomains(sharedDomains);
    } else if (activeTab === 'enrolled') {
      setDisplayDomains(enrolledNonOwned);
    } else if (activeTab === 'community') {
      setDisplayDomains(communityDomains);
    }
  }, [activeTab, myDomains, sharedDomains, enrolledNonOwned, communityDomains]);

  useEffect(() => {
    const syncFontSizes = () => {
      setFontSizeSteps(getExplorerFontSizeSteps());
    };
    window.addEventListener(APP_PREFERENCES_UPDATED_EVENT, syncFontSizes);
    return () => {
      window.removeEventListener(APP_PREFERENCES_UPDATED_EVENT, syncFontSizes);
    };
  }, []);

  useEffect(() => {
    if (!showOptionsMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) {
        setShowOptionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showOptionsMenu]);

  // Handle tab change
  const handleTabChange = (tab: 'my' | 'shared' | 'enrolled' | 'community') => {
    setActiveTab(tab);
  };

  const handleAdjustFontSize = useCallback((category: ExplorerFontSizeCategory, delta: -1 | 1) => {
    const next = adjustExplorerFontSizeStep(category, delta);
    setFontSizeSteps(next);
  }, []);

  // Handle enrollment
  const handleEnrollment = async (domain: Domain) => {
    if (!currentUser) {
      showToast('Please log in to enroll in domains', 'error');
      router.push('/login');
      return;
    }

    setEnrolling(prev => new Set(prev).add(domain.id));

    try {
      await enrollInDomain(domain.id);

      // Update local state
      setEnrolledDomains(prev => [...prev, domain]);

      showToast(`Successfully enrolled in "${domain.name}"`, 'success');

      // Navigate to the domain
      router.push(`/main/domains/${domain.id}/study`);
    } catch (error) {
      console.error('Error enrolling in domain:', error);
      showToast(`Failed to enroll in "${domain.name}"`, 'error');
    } finally {
      setEnrolling(prev => {
        const newSet = new Set(prev);
        newSet.delete(domain.id);
        return newSet;
      });
    }
  };

  // Handle export
  const handleExport = async (domain: Domain) => {
    try {
      const data = await exportDomainAsJson(domain.id);
      const safeBase = `${domain.name.replace(/[^a-z0-9-]+/gi, '_')}_export`;
      downloadJsonFile(data, safeBase);
      showToast('Export created', 'success');
    } catch (e: any) {
      console.error('Failed to export domain:', e);
      const errorMessage = e?.message || 'Failed to export domain';
      showToast(errorMessage, 'error');
    }
  };

  // Handle domain access
  const handleDomainAccess = async (domain: Domain) => {
    // Check if user owns the domain
    const currentUserId = currentUser?.id;
    const isOwned = !!currentUserId && domain.ownerId === currentUserId;
    const isShared = !!domain.permissionRole && !isOwned;
    const isEnrolled = enrolledNonOwnedIds.has(domain.id);

    if (isOwned || isEnrolled || isShared) {
      // Direct access for owned or enrolled domains
      router.push(`/main/domains/${domain.id}/study`);
    } else if (domain.privacy === 'public') {
      // Navigate to public domain; enrollment is optional and handled in the domain view
      router.push(`/main/domains/${domain.id}/study`);
    } else {
      // Private domain that user doesn't own
      showToast('This is a private domain you cannot access', 'error');
    }
  };

  // Archive a domain (soft delete)
  const handleArchive = async (domain: Domain) => {
    const confirmed = window.confirm(`Archive "${domain.name}"? You can restore it later from Archived Domains.`);
    if (!confirmed) return;
    try {
      await archiveDomain(domain.id);
      // Remove from lists where it may appear
      setMyDomains(prev => prev.filter(d => d.id !== domain.id));
      setEnrolledDomains(prev => prev.filter(d => d.id !== domain.id));
      setPublicDomains(prev => prev.filter(d => d.id !== domain.id));
      showToast(`Archived "${domain.name}"`, 'success');
    } catch (e) {
      console.error('Failed to archive domain', e);
      showToast('Failed to archive domain', 'error');
    }
  };

  // Get domain status info
  const getDomainStatus = (domain: Domain) => {
    const currentUserId = currentUser?.id;
    const isOwned = !!currentUserId && domain.ownerId === currentUserId;
    const isShared = !!domain.permissionRole && !isOwned;
    const isEnrolled = enrolledNonOwnedIds.has(domain.id);

    if (isOwned) {
      return {
        icon: <UserCheck size={14} className="text-purple-600" />,
        label: 'Owned',
        className: 'bg-purple-100 text-purple-700'
      };
    } else if (isShared) {
      const label = domain.permissionRole === 'editor' ? 'Editor' : 'Viewer';
      return {
        icon: <Users size={14} className="text-amber-600" />,
        label,
        className: 'bg-amber-100 text-amber-700'
      };
    } else if (isEnrolled) {
      return {
        icon: <Users size={14} className="text-green-600" />,
        label: 'Enrolled',
        className: 'bg-green-100 text-green-700'
      };
    } else if (domain.privacy === 'public') {
      return {
        icon: <Globe size={14} className="text-blue-600" />,
        label: 'Public',
        className: 'bg-blue-100 text-blue-700'
      };
    } else {
      return {
        icon: <Lock size={14} className="text-gray-600" />,
        label: 'Private',
        className: 'bg-gray-100 text-gray-700'
      };
    }
  };

  // NEW: Handle import success
  const handleImportSuccess = (domain: Domain) => {
    setShowImportDialog(false);
    showToast(`Domain "${domain.name}" created successfully with imported data!`, 'success');
    
    // Refresh domain lists
    if (currentUser) {
      // Add to my domains
      setMyDomains(prev => [...prev, domain]);
      
      // If it's public, also add to public domains
      if (domain.privacy === 'public') {
        setPublicDomains(prev => [...prev, domain]);
      }
    }
    
    // Navigate to the new domain
    router.push(`/main/domains/${domain.id}/study`);
  };

  const handleCreateSuccess = (domain: Domain) => {
    setShowCreateDialog(false);
    showToast(`Domain "${domain.name}" created successfully!`, 'success');

    if (currentUser) {
      setMyDomains(prev => [...prev, domain]);
      if (domain.privacy === 'public') {
        setPublicDomains(prev => [...prev, domain]);
      }
    }

    router.push(`/main/domains/${domain.id}/study`);
  };

  const openCopyDialog = (domain: Domain) => {
    setCopyDomainSource(domain);
    setCopyName(`${domain.name} (Copy)`);
    setCopyDescription(domain.description || '');
    setCopyPrivacy('private');
  };

  const closeCopyDialog = () => {
    setCopyDomainSource(null);
    setCopyName('');
    setCopyDescription('');
    setCopyPrivacy('private');
    setCopying(false);
  };

  const handleCopyDomain = async () => {
    if (!copyDomainSource) return;
    if (!currentUser) {
      showToast('Please log in to copy domains', 'error');
      router.push('/login');
      return;
    }

    setCopying(true);
    try {
      const created = await copyDomain(copyDomainSource.id, {
        name: copyName.trim(),
        description: copyDescription.trim(),
        privacy: copyPrivacy,
      });
      setMyDomains(prev => [...prev, created]);
      if (created.privacy === 'public') {
        setPublicDomains(prev => [...prev, created]);
      }
      showToast(`Copied "${copyDomainSource.name}"`, 'success');
      closeCopyDialog();
      router.push(`/main/domains/${created.id}/study`);
    } catch (error: any) {
      console.error('Failed to copy domain:', error);
      showToast(error?.message || 'Failed to copy domain', 'error');
      setCopying(false);
    }
  };

  const handleAttachLiveRoot = async () => {
    if (!liveImportStatus?.currentRoot.hasManifest || isAttachingLiveRoot) return;
    setIsAttachingLiveRoot(true);
    try {
      const attached = await attachCurrentLiveImportRoot();
      const [status, domains] = await Promise.all([getLiveImportStatus(), getMyDomains()]);
      setLiveImportStatus(status);
      setMyDomains(domains || []);
      setActiveTab('my');
      showToast(`Attached "${attached.binding.displayName}"`, 'success');
      router.push(`/main/domains/${attached.binding.domainId}/study`);
    } catch (attachError: any) {
      showToast(attachError?.message || 'Failed to attach the current Org-roam root', 'error');
    } finally {
      setIsAttachingLiveRoot(false);
    }
  };

  const currentRootAttachedBinding = liveImportStatus?.bindings.find(binding =>
    binding.authorizationState === 'attached' &&
    binding.providerNotebookId === liveImportStatus.currentRoot.providerNotebookId
  );

  const handleDetachLiveRoot = async () => {
    if (!currentRootAttachedBinding || isDetachingLiveRoot) return;
    if (!window.confirm(`Detach "${currentRootAttachedBinding.displayName}"? The imported domain and learning history will remain intact.`)) return;
    setIsDetachingLiveRoot(true);
    try {
      await detachLiveImportBinding(currentRootAttachedBinding.id);
      setLiveImportStatus(await getLiveImportStatus());
      showToast(`Detached "${currentRootAttachedBinding.displayName}"`, 'success');
    } catch (detachError: any) {
      showToast(detachError?.message || 'Could not detach the current notebook', 'error');
    } finally {
      setIsDetachingLiveRoot(false);
    }
  };

  const managedDomainIds = useMemo(
    () => new Set((liveImportStatus?.bindings || [])
      .filter(binding => binding.authorizationState === 'attached')
      .map(binding => binding.domainId)),
    [liveImportStatus?.bindings],
  );

  const currentRootAlreadyAttached = !!currentRootAttachedBinding;

  return (
    <div className={`${isDarkMode ? 'kg-night-mode dark' : ''} kg-font-root`} style={explorerFontStyle}>
      {/* Use Navbar's built-in hamburger dropdown (no slide-over sidebar) */}
      <Navbar 
        // Do not pass onMenuClick so the Navbar shows its dropdown
        // Provide extra menu items we previously had in the right panel
        extraMenuItems={[
          { href: '/main/domains/invitations', label: 'Invitations' },
          { href: '/main/domains/archived', label: 'Archived Domains' },
        ]}
      />
      
      <div className="min-h-screen bg-white w-full mt-16">
        {/* Use consistent padding like dashboard */}
        <div className="w-full max-w-7xl mx-auto px-6 sm:px-8 lg:px-16 py-8" onClick={() => setMenuOpenId(null)}>
          {process.env.NODE_ENV === 'development' && liveImportStatus && !liveImportStatus.enabled && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <Unplug size={18} className="mt-0.5 shrink-0 text-amber-700" />
                <div>
                  <div className="font-semibold text-gray-900">Org live import is disabled in the server process</div>
                  <div className="mt-1 text-sm text-gray-700">
                    Restart <code>make dev</code> from a shell that exports the bridge enable flag, URL, and token.
                  </div>
                </div>
              </div>
            </div>
          )}
          {liveImportStatus?.enabled && (
            <div className={`mb-6 rounded-xl border p-4 ${
              liveImportStatus.connectionState === 'online'
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-amber-200 bg-amber-50'
            }`}>
              <div className="flex flex-wrap items-center gap-3">
                {liveImportStatus.connectionState === 'online'
                  ? <Radio size={18} className="text-emerald-700" />
                  : <Unplug size={18} className="text-amber-700" />}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-900">
                    Org live import · {liveImportStatus.connectionState}
                  </div>
                  <div className="text-sm text-gray-700 truncate">
                    {liveImportStatus.currentRoot.hasManifest
                      ? `Current notebook: ${liveImportStatus.currentRoot.title || liveImportStatus.currentRoot.providerNotebookId}`
                      : liveImportStatus.connectionState === 'online'
                        ? 'The current Org-roam root has no ankidemy.org manifest.'
                        : 'Emacs is unreachable. Managed domains remain readable using the last accepted snapshot.'}
                  </div>
                </div>
                {liveImportStatus.connectionState === 'online' &&
                  liveImportStatus.currentRoot.hasManifest &&
                  !currentRootAlreadyAttached && (
                    <Button onClick={handleAttachLiveRoot} disabled={isAttachingLiveRoot}>
                      {isAttachingLiveRoot ? 'Attaching…' : 'Attach notebook'}
                    </Button>
                  )}
                {currentRootAlreadyAttached && (
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
                      Attached
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDetachLiveRoot}
                      disabled={isDetachingLiveRoot}
                    >
                      <Unlink size={14} className="mr-1.5" />
                      {isDetachingLiveRoot ? 'Detaching…' : 'Detach'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Domain Network Visualization (moved above tabs) */}
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-6 text-gray-800">Domain Network</h2>
            <div className="border rounded-xl h-96 overflow-hidden bg-gray-50 relative">
              {displayDomains.length > 0 ? (
                <SubjectMatterGraph
                  key={`${activeTab}-${displayDomains.length}`}
                  isDarkMode={isDarkMode}
                  subjectMatters={displayDomains.map(domain => ({
                    id: domain.id.toString(),
                    name: domain.name,
                    nodeCount: domain.nodeCount || 0,
                    exerciseCount: domain.exerciseCount || 0
                  }))}
                  onSelectSubjectMatter={(id) => {
                    const domain = displayDomains.find(d => d.id.toString() === id);
                    if (domain) {
                      handleDomainAccess(domain);
                    }
                  }}
                  onCreateSubjectMatter={currentUser ? () => setShowCreateDialog(true) : undefined}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <p className="text-4xl mb-2">📚</p>
                    <p className="text-sm">
                      {activeTab === 'my' && "No domains created yet"}
                      {activeTab === 'shared' && "No shared domains yet"}
                      {activeTab === 'enrolled' && "No enrolled domains yet"}
                      {activeTab === 'community' && "No community domains available"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b mb-6">
            <button
              className={`px-4 py-2 font-medium ${activeTab === 'my' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'}`}
              onClick={() => handleTabChange('my')}
            >
              My Domains ({myDomains.length})
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === 'shared' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'}`}
              onClick={() => handleTabChange('shared')}
            >
              Shared Domains ({sharedDomains.length})
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === 'enrolled' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'}`}
              onClick={() => handleTabChange('enrolled')}
            >
              Enrolled Domains ({enrolledNonOwned.length})
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === 'community' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'}`}
              onClick={() => handleTabChange('community')}
            >
              Community Domains ({communityDomains.length})
            </button>
          </div>

          {/* Domain + Explorer actions */}
          <div className="flex items-center gap-3 mb-6">
            {currentUser && (
              <>
                <Button
                  className="flex items-center"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus size={16} className="mr-1" />
                  Create Domain
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowImportDialog(true)}
                  className="flex items-center"
                >
                  <Upload size={16} className="mr-1" />
                  Import
                </Button>
              </>
            )}
            <div className="ml-auto">
              <div className="flex items-center gap-2">
                <div className="relative" ref={optionsMenuRef}>
                  <Button
                    variant="outline"
                    className="flex items-center"
                    onClick={() => setShowOptionsMenu((prev) => !prev)}
                  >
                    Options
                    <Wrench size={14} className="ml-1" />
                  </Button>
                  {showOptionsMenu && (
                    <div className="kg-font-ui absolute right-0 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg z-30 p-3 text-sm">
                      <div className="font-semibold text-gray-800 mb-2">Options</div>
                      <ExplorerFontSizeOptionsSection
                        steps={fontSizeSteps}
                        onAdjust={handleAdjustFontSize}
                      />
                    </div>
                  )}
                </div>
                {currentUser && (
                  <Link href="/main/domains/archived">
                    <Button variant="outline" className="flex items-center">
                      Archived Domains
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
          
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 text-red-500 p-4 rounded-lg mb-6">
              {error}
            </div>
          )}
          
          {/* Domain Display */}
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
            </div>
          ) : displayDomains.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-600 mb-2">No domains found</h3>
              <p className="text-gray-500">
                {activeTab === 'my'
                  ? "You haven't created any domains yet."
                  : activeTab === 'shared'
                  ? "You don't have any shared domains yet."
                  : activeTab === 'enrolled'
                  ? "You haven't enrolled in any domains yet."
                  : "There are no community domains available."
                }
              </p>

              {activeTab === 'my' && currentUser && (
                <div className="flex justify-center gap-3 mt-4">
                  <Button onClick={() => setShowCreateDialog(true)}>
                    Create Your First Domain
                  </Button>
                  <Link href="/main/domains/archived">
                    <Button variant="outline">
                      Archived Domains
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={() => setShowImportDialog(true)}
                  >
                    <Upload size={16} className="mr-1" />
                    Import
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayDomains.map((domain) => {
                const statusInfo = getDomainStatus(domain);
                const isEnrolling = enrolling.has(domain.id);
                const currentUserId = currentUser?.id;
                const isOwned = !!currentUserId && domain.ownerId === currentUserId;
                const isShared = !!domain.permissionRole && !isOwned;
                const isEnrolled = enrolledNonOwnedIds.has(domain.id);
                const isManaged = managedDomainIds.has(domain.id);

                return (
                  <Card key={domain.id} className="p-6 hover:shadow-lg transition-all duration-200 rounded-xl border-0 shadow-sm relative">
                    {/* Card actions: 3-dot menu in upper-right */}
                    <div className="absolute top-4 right-4 z-20" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="p-1 rounded hover:bg-gray-100"
                        onClick={() => setMenuOpenId(prev => prev === domain.id ? null : domain.id)}
                        aria-label="More options"
                      >
                        <MoreVertical size={18} />
                      </button>
                      {menuOpenId === domain.id && (
                        <div className="kg-font-ui absolute right-0 mt-2 w-44 bg-white border rounded-md shadow-lg" onClick={(e) => e.stopPropagation()}>
                          {isOwned && !isManaged && (
                            <button
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => { setMenuOpenId(null); handleArchive(domain); }}
                            >
                              Archive
                            </button>
                          )}
                          <button
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                            onClick={() => { setMenuOpenId(null); handleDomainAccess(domain); }}
                          >
                            Open
                          </button>
                          {!isManaged && (
                            <button
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => { setMenuOpenId(null); openCopyDialog(domain); }}
                            >
                              Copy
                            </button>
                          )}
                          <button
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                            onClick={() => { setMenuOpenId(null); handleExport(domain); }}
                          >
                            Export
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-2 pr-8">
                      <h3 className="text-xl font-semibold mb-2 text-gray-800">{domain.name}</h3>
                      {domainDueCounts[domain.id] > 0 && (
                        <span className={`kg-font-tag mt-1 inline-flex items-center rounded-full text-xs font-semibold px-2 py-0.5 ${
                          isDarkMode ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {domainDueCounts[domain.id]} due
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 mb-4 line-clamp-2 min-h-[2.5rem]">{domain.description || "No description"}</p>
                    
                    <div className="flex justify-between items-center relative">
                      <div className="flex items-center space-x-2">
                        <span className={`kg-font-tag text-sm px-2 py-1 rounded-full flex items-center ${statusInfo.className}`}>
                          {statusInfo.icon}
                          <span className="ml-1">{statusInfo.label}</span>
                        </span>
                        {isManaged && (
                          <span className="kg-font-tag text-sm px-2 py-1 rounded-full flex items-center bg-cyan-100 text-cyan-800">
                            <Radio size={14} className="mr-1" /> Managed
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {/* Export button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); handleExport(domain); }}
                          className="text-xs"
                        >
                          <Download size={14} className="mr-1" />
                          Export
                        </Button>
                        {/* Enrollment button for public domains */}
                        {domain.privacy === 'public' && !isOwned && !isEnrolled && !isShared && currentUser && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEnrollment(domain)}
                            disabled={isEnrolling}
                            className="text-xs"
                          >
                            {isEnrolling ? 'Enrolling...' : 'Enroll'}
                          </Button>
                        )}
                        {/* Explore button */}
                        <button
                          onClick={() => handleDomainAccess(domain)}
                          className="text-orange-500 hover:text-orange-700 flex items-center font-medium transition-colors"
                          disabled={isEnrolling}
                        >
                          Explore
                          <ArrowRight size={16} className="ml-1" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Login prompt for non-authenticated users */}
                    {!currentUser && domain.privacy === 'public' && (
                      <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-700">
                        <Link href="/login" className="underline">Log in</Link> to enroll and track your progress
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
          
          {/* Graph was moved above */}
        </div>
      </div>

      {/* NEW: Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowCreateDialog(false)}
              className="absolute top-4 right-4 z-10"
            >
              <X size={20} />
            </Button>
            <DomainForm
              onSuccess={handleCreateSuccess}
              onCancel={() => setShowCreateDialog(false)}
            />
          </div>
        </div>
      )}

      {/* NEW: Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowImportDialog(false)}
              className="absolute top-4 right-4 z-10"
            >
              <X size={20} />
            </Button>
            <DomainForm
              allowImport={true}
              onSuccess={handleImportSuccess}
              onCancel={() => setShowImportDialog(false)}
            />
          </div>
        </div>
      )}

      {copyDomainSource && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={closeCopyDialog}
              className="absolute top-3 right-3"
            >
              <X size={18} />
            </Button>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Copy Domain</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Name</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={copyName}
                  onChange={(e) => setCopyName(e.target.value)}
                  placeholder="New domain name"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Description</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={copyDescription}
                  onChange={(e) => setCopyDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-2">Privacy</label>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="copyPrivacy"
                      value="private"
                      checked={copyPrivacy === 'private'}
                      onChange={() => setCopyPrivacy('private')}
                    />
                    Private
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="copyPrivacy"
                      value="public"
                      checked={copyPrivacy === 'public'}
                      onChange={() => setCopyPrivacy('public')}
                    />
                    Public
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={closeCopyDialog} disabled={copying}>
                Cancel
              </Button>
              <Button onClick={handleCopyDomain} disabled={copying}>
                {copying ? 'Copying...' : 'Create Copy'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
