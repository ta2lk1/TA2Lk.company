import React, { useState } from 'react';
import { Lock, Building2, User, Mail, Shield, ArrowRight, AlertCircle } from 'lucide-react';
import { api } from '../services/api.ts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode?: 'login' | 'register' | 'create-org';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  mode = 'login',
}) => {
  const demoMode = import.meta.env.VITE_DEMO_MODE === 'true';
  const [currentMode, setCurrentMode] = useState<'login' | 'register' | 'create-org'>(mode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (currentMode === 'login') {
        await api.login(email, password);
      } else if (currentMode === 'register') {
        await api.register(email, password, fullName, orgName, orgSlug);
      } else if (currentMode === 'create-org') {
        await api.createOrganization(orgName, orgSlug || orgName.toLowerCase().replace(/[^a-z0-9]/g, '-'));
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (userEmail: string, userPass: string) => {
    setError(null);
    setLoading(true);
    try {
      await api.login(userEmail, userPass);
      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-md w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white font-mono uppercase">
              {currentMode === 'login' && 'Sign In to Industrial Brain'}
              {currentMode === 'register' && 'Register Organization & Admin'}
              {currentMode === 'create-org' && 'Create New Tenant Organization'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white font-mono text-xs cursor-pointer"
          >
            [ESC]
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded bg-red-950/60 border border-red-800 text-red-300 text-xs font-mono flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-mono">
          {currentMode === 'register' && (
            <div>
              <label className="text-zinc-400 block mb-1 text-[10px] uppercase">Full Name</label>
              <input
                type="text"
                required
                placeholder="Dr. Walter White"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          {(currentMode === 'register' || currentMode === 'create-org') && (
            <>
              <div>
                <label className="text-zinc-400 block mb-1 text-[10px] uppercase">Organization Name</label>
                <input
                  type="text"
                  required
                  placeholder="Apex Advanced Manufacturing"
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value);
                    if (!orgSlug) {
                      setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                    }
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1 text-[10px] uppercase">Organization Slug</label>
                <input
                  type="text"
                  required
                  placeholder="apex-mfg"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </>
          )}

          {currentMode !== 'create-org' && (
            <>
              <div>
                <label className="text-zinc-400 block mb-1 text-[10px] uppercase">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="admin@industrial-brain.internal"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 text-[10px] uppercase">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded transition cursor-pointer disabled:opacity-50 mt-2 text-xs"
          >
            {loading ? 'Authenticating...' : currentMode === 'login' ? 'Sign In' : 'Proceed'}
          </button>
        </form>

        {/* Quick Persona Switcher for Evaluation */}
        {currentMode === 'login' && demoMode && (
          <div className="pt-3 border-t border-zinc-800">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-2">
              Instant Persona Switch (Testing Multi-Tenancy & RBAC):
            </div>
            <div className="grid grid-cols-1 gap-1.5 text-xs font-mono">
              <button
                onClick={() => quickLogin('admin@industrial-brain.internal', 'AdminPassword123!')}
                className="w-full text-left p-2 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 flex items-center justify-between transition cursor-pointer"
              >
                <div>
                  <span className="text-white font-semibold">Admin (Elena)</span>
                  <span className="text-[10px] text-zinc-400 ml-2">Apex Mfg (ORG_ADMIN)</span>
                </div>
                <ArrowRight className="w-3 h-3 text-amber-400" />
              </button>

              <button
                onClick={() => quickLogin('manager@industrial-brain.internal', 'ManagerPassword123!')}
                className="w-full text-left p-2 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 flex items-center justify-between transition cursor-pointer"
              >
                <div>
                  <span className="text-white font-semibold">Marcus</span>
                  <span className="text-[10px] text-zinc-400 ml-2">Apex Mfg (PLANT_MANAGER)</span>
                </div>
                <ArrowRight className="w-3 h-3 text-amber-400" />
              </button>

              <button
                onClick={() => quickLogin('operator@industrial-brain.internal', 'OperatorPassword123!')}
                className="w-full text-left p-2 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 flex items-center justify-between transition cursor-pointer"
              >
                <div>
                  <span className="text-white font-semibold">Klaus</span>
                  <span className="text-[10px] text-zinc-400 ml-2">Apex Mfg (OPERATOR)</span>
                </div>
                <ArrowRight className="w-3 h-3 text-amber-400" />
              </button>

              <button
                onClick={() => quickLogin('auditor@industrial-brain.internal', 'AuditorPassword123!')}
                className="w-full text-left p-2 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 flex items-center justify-between transition cursor-pointer"
              >
                <div>
                  <span className="text-white font-semibold">Sophia</span>
                  <span className="text-[10px] text-zinc-400 ml-2">Apex Mfg (AUDITOR)</span>
                </div>
                <ArrowRight className="w-3 h-3 text-amber-400" />
              </button>

              <button
                onClick={() => quickLogin('engineer@betachem.internal', 'BetaPassword123!')}
                className="w-full text-left p-2 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 flex items-center justify-between transition cursor-pointer"
              >
                <div>
                  <span className="text-white font-semibold">David</span>
                  <span className="text-[10px] text-emerald-400 ml-2">Beta Chem (ISOLATED TENANT)</span>
                </div>
                <ArrowRight className="w-3 h-3 text-emerald-400" />
              </button>
            </div>
          </div>
        )}

        {/* Mode Switcher */}
        <div className="text-center text-xs font-mono text-zinc-400 pt-2 border-t border-zinc-800">
          {currentMode === 'login' ? (
            <p>
              Need a new tenant?{' '}
              <button
                onClick={() => setCurrentMode('register')}
                className="text-amber-400 hover:underline cursor-pointer"
              >
                Register Organization
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button
                onClick={() => setCurrentMode('login')}
                className="text-amber-400 hover:underline cursor-pointer"
              >
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
