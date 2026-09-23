/**
 * Industrial Brain — Main Web Application Shell
 * Phase 1: Core Platform
 */

import React, { useEffect, useState } from 'react';
import { Navigation, ActiveTab } from './components/Navigation.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { DataSourcesView } from './components/DataSourcesView.tsx';
import { RbacView } from './components/RbacView.tsx';
import { AuditView } from './components/AuditView.tsx';
import { KnowledgeGraphView } from './components/KnowledgeGraphView.tsx';
import { SearchContextView } from './components/SearchContextView.tsx';
import { ReasoningView } from './components/ReasoningView.tsx';
import { ActionLoopView } from './components/ActionLoopView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { SystemHealthView } from './components/SystemHealthView.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { AiCopilotModal } from './components/AiCopilotModal.tsx';
import { api, UserProfile, OrganizationInfo } from './services/api.ts';
import { Sparkles } from 'lucide-react';

export default function App() {
  const demoMode = import.meta.env.VITE_DEMO_MODE === 'true';
  const [currentTab, setCurrentTab] = useState<ActiveTab>('dashboard');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeTenant, setActiveTenant] = useState<OrganizationInfo | null>(null);
  const [activeRole, setActiveRole] = useState<string>('VIEWER');
  const [organizations, setOrganizations] = useState<Array<{ tenantId: string; organizationName: string; role: string }>>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAiCopilotOpen, setIsAiCopilotOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'create-org'>('login');
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    bootstrapSession();
  }, []);

  const bootstrapSession = async () => {
    try {
      setInitialLoading(true);
      if (!api.getToken()) {
        if (!demoMode) {
          setIsAuthModalOpen(true);
          return;
        }
        // Demo-only auto-authentication; never enabled in a normal deployment.
        await api.login('admin@industrial-brain.internal', 'AdminPassword123!');
      }

      const me = await api.getMe();
      setUser(me.user);
      setActiveTenant(me.activeTenant);
      setActiveRole(me.activeRole);
      setOrganizations(me.organizations);
    } catch (err) {
      console.warn('Session bootstrap required login:', err);
      api.clearAuth();
      setIsAuthModalOpen(true);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSwitchTenant = async (tenantId: string) => {
    try {
      const res = await api.switchTenant(tenantId);
      setActiveTenant(res.activeTenant);
      setActiveRole(res.activeRole);
      // Reload me to refresh full context
      const me = await api.getMe();
      setUser(me.user);
      setOrganizations(me.organizations);
    } catch (err) {
      console.error('Failed to switch tenant:', err);
    }
  };

  const handleLogout = () => {
    api.clearAuth();
    setUser(null);
    setActiveTenant(null);
    setActiveRole('VIEWER');
    setOrganizations([]);
    setAuthModalMode('login');
    setIsAuthModalOpen(true);
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-400 font-mono text-xs space-y-3">
        <div className="w-8 h-8 rounded border-2 border-amber-500 border-t-transparent animate-spin"></div>
        <div>INITIALIZING INDUSTRIAL BRAIN PLATFORM...</div>
        <div className="text-[10px] text-zinc-600">Verifying Multi-Tenant Boundaries & Cryptographic Audit State</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-amber-500 selection:text-zinc-950">
      {/* Top Header & Navigation */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        user={user}
        activeTenant={activeTenant}
        activeRole={activeRole}
        organizations={organizations}
        onSwitchTenant={handleSwitchTenant}
        onCreateOrgClick={() => {
          setAuthModalMode('create-org');
          setIsAuthModalOpen(true);
        }}
        onLogout={handleLogout}
        onQuickLoginClick={() => {
          setAuthModalMode('login');
          setIsAuthModalOpen(true);
        }}
      />

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {currentTab === 'dashboard' && (
          <DashboardView
            activeTenant={activeTenant}
            activeRole={activeRole}
            onNavigateToTab={setCurrentTab}
          />
        )}

        {currentTab === 'datasources' && <DataSourcesView />}

        {currentTab === 'graph' && <KnowledgeGraphView activeTenantId={activeTenant?.id} />}

        {currentTab === 'search' && <SearchContextView activeTenantId={activeTenant?.id} />}

        {currentTab === 'reasoning' && (
          <ReasoningView activeTenantId={activeTenant?.id} activeRole={activeRole} />
        )}

        {currentTab === 'action' && (
          <ActionLoopView activeTenantId={activeTenant?.id} activeRole={activeRole} />
        )}

        {currentTab === 'rbac' && <RbacView activeRole={activeRole} />}

        {currentTab === 'audit' && <AuditView activeTenantId={activeTenant?.id} />}

        {currentTab === 'settings' && (
          <SettingsView activeTenant={activeTenant} activeRole={activeRole} />
        )}

        {currentTab === 'health' && <SystemHealthView />}
      </main>

      {/* Industrial Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 px-6 py-4 text-xs font-mono text-zinc-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span>INDUSTRIAL BRAIN v1.0.0</span>
          <span>•</span>
          <span>PHASE 6: ACTION & CLOSED-LOOP ENGINE ACTIVE</span>
          <span>•</span>
          <span className="text-emerald-400">PRE-EXECUTION GUARDRAILS ENFORCED</span>
          <span>•</span>
          <span className="text-cyan-400">CLOSED-LOOP SENSOR FEEDBACK VERIFIED</span>
        </div>
        <div className="text-[11px] text-zinc-600">
          STRICT TENANT ISOLATION // ZERO FAKE DATA // ZERO UNSAFE ACCESS
        </div>
      </footer>

      {/* Auth & Tenant Provisioning Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        mode={authModalMode}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={bootstrapSession}
      />

      {/* AI Copilot Modal */}
      <AiCopilotModal
        isOpen={isAiCopilotOpen}
        onClose={() => setIsAiCopilotOpen(false)}
        activeTenant={activeTenant}
      />

      {/* Floating AI Copilot Trigger Button */}
      <button
        onClick={() => setIsAiCopilotOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-zinc-950 px-4 py-3 rounded-full shadow-2xl flex items-center space-x-2 font-bold text-xs transition transform hover:scale-105 border border-amber-300/40"
      >
        <Sparkles className="w-4 h-4 text-zinc-950 animate-pulse" />
        <span>Ask AI Copilot</span>
      </button>
    </div>
  );
}
