import React, { useState, useEffect } from 'react';
import loginBg from '@/assets/login-bg.jpg';
import { getStationForecasts } from '../services/api';

export interface AuthUser {
  role: 'civilian' | 'authority';
  identifier: string;
  name: string;
  organization?: string;
  badge?: string;
}

interface LoginPageProps {
  onLogin: (user: AuthUser) => void;
}

type AuthMode = 'civilian_login' | 'civilian_signup' | 'authority_login';

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [authMode, setAuthMode] = useState<AuthMode>('civilian_login');
  const [error, setError] = useState<string>('');

  // Live / Fallback regional telemetry for top-right header
  const [telemetry, setTelemetry] = useState<{ aqi: number; temp: number }>({
    aqi: 168,
    temp: 26,
  });

  // Civilian Login / Signup fields
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  // Authority fields
  const [aerisId, setAerisId] = useState<string>('');
  const [securityPin, setSecurityPin] = useState<string>('');

  // Fetch station forecasts on mount to compute live average AQI and Temp
  useEffect(() => {
    let isMounted = true;
    getStationForecasts()
      .then((forecastMap) => {
        if (!isMounted || !forecastMap || forecastMap.size === 0) return;
        let totalAqi = 0;
        let totalTemp = 0;
        let count = 0;

        forecastMap.forEach((stationFc) => {
          const currentHour = stationFc.hours[0];
          if (currentHour) {
            totalAqi += currentHour.aqi.mean;
            totalTemp += currentHour.weather.temperature;
            count++;
          }
        });

        if (count > 0) {
          setTelemetry({
            aqi: Math.round(totalAqi / count),
            temp: Math.round(totalTemp / count),
          });
        }
      })
      .catch(() => {
        // Fallback already pre-set to 168 AQI | 26°C
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Civilian Login Handler
  const handleCivilianLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    onLogin({
      role: 'civilian',
      identifier: email.trim(),
      name: email.split('@')[0] || 'Delhi-NCR Resident',
      badge: 'Public Citizen Access',
    });
  };

  // Civilian Signup Handler
  const handleCivilianSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!password.trim()) {
      setError('Please enter a password');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    onLogin({
      role: 'civilian',
      identifier: email.trim(),
      name: fullName.trim(),
      badge: 'Public Citizen Access',
    });
  };

  // Google Sign-in Handler (for Civilians)
  const handleGoogleSignIn = () => {
    onLogin({
      role: 'civilian',
      identifier: 'citizen.delhi@gmail.com',
      name: 'Priya Sharma',
      badge: 'Google Verified Citizen',
    });
  };

  // Authority Login Handler
  const handleAuthoritySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aerisId.trim()) {
      setError('Please enter your official Aeris ID');
      return;
    }
    if (securityPin.length !== 6 || !/^\d+$/.test(securityPin)) {
      setError('Official security code must be exactly 6 digits');
      return;
    }

    onLogin({
      role: 'authority',
      identifier: aerisId.trim().toUpperCase(),
      name: 'Dr. V. Sharma (Nodal Officer)',
      organization: 'Commission for Air Quality Management (CAQM)',
      badge: 'Level-3 GRAP Enforcement Clearance',
    });
  };

  // Demo 1-Click for Authority
  const handleDemoAuthority = () => {
    onLogin({
      role: 'authority',
      identifier: 'AERIS-CAQM-0809',
      name: 'Dr. P. Nair (Joint Director)',
      organization: 'Commission for Air Quality Management (CAQM)',
      badge: 'Level-3 GRAP Enforcement Clearance',
    });
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900 relative flex flex-col justify-between overflow-x-hidden selection:bg-neutral-900 selection:text-white">
      {/* Pristine landscape illustration along the bottom with smooth blend into white sky */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-none z-0 flex justify-center items-end h-[55vh] sm:h-[65vh] overflow-hidden">
        {/* Soft gradient fade on top to ensure zero harsh cutoffs */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none" />
        <img
          src={loginBg}
          alt="Landscape background"
          className="w-full max-w-[1800px] h-full object-cover sm:object-contain object-bottom select-none"
        />
      </div>

      {/* Minimal Top Header: Center Brand + Right AQI & Weather */}
      <header className="w-full max-w-7xl mx-auto px-6 pt-6 sm:pt-8 grid grid-cols-3 items-center relative z-10">
        {/* Left balance column: empty spacer to perfectly center the brand (no back option as requested) */}
        <div />

        {/* Center Logo in official AERIS branding */}
        <div className="text-center flex items-center justify-center">
          <img
            src="/aeris-logo-light-transparent.png"
            alt="AERIS"
            className="h-7 sm:h-8 w-auto object-contain select-none"
          />
        </div>

        {/* Right: AQI | Weather unit display */}
        <div className="flex justify-end">
          <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3.5 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-neutral-200/90 shadow-xs text-xs font-medium text-neutral-700 font-sans">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                telemetry.aqi > 200
                  ? 'bg-rose-500'
                  : telemetry.aqi > 100
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              } animate-pulse`}
            />
            <span className="font-semibold text-neutral-900">{telemetry.aqi} AQI</span>
            <span className="text-neutral-300">|</span>
            <span className="text-neutral-600">{telemetry.temp}°C</span>
          </div>
        </div>
      </header>

      {/* Main Authentication Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-6 sm:py-10 relative z-10">
        <div className="w-full max-w-[390px] bg-white rounded-3xl p-7 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.03)] border border-neutral-100 transition-all">
          {/* Card Header */}
          <div className="text-left mb-6">
            <h1 className="font-heading text-2xl sm:text-[28px] font-normal text-neutral-900 tracking-normal leading-tight">
              {authMode === 'civilian_login' && 'Log in to Aeris'}
              {authMode === 'civilian_signup' && 'Create an account'}
              {authMode === 'authority_login' && 'Log in to Aeris'}
            </h1>
            <p className="text-xs text-neutral-400 font-sans mt-1.5">
              {authMode === 'civilian_login' && 'Your clean air journey starts here'}
              {authMode === 'civilian_signup' && 'Personalized air quality alerts for Delhi-NCR'}
              {authMode === 'authority_login' && 'Official CAQM Telemetry & Enforcement Desk'}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-sans">
              {error}
            </div>
          )}

          {/* ======================================================== */}
          {/* 1. CIVILIAN LOGIN MODE (DEFAULT)                         */}
          {/* ======================================================== */}
          {authMode === 'civilian_login' && (
            <div>
              {/* Google Sign In */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 text-sm font-medium text-neutral-700 transition shadow-xs cursor-pointer font-sans"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-neutral-200/80" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2.5 text-neutral-400 font-sans">or</span>
                </div>
              </div>

              {/* Email / Password Form */}
              <form onSubmit={handleCivilianLogin} className="space-y-4">
                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-medium text-neutral-700 font-sans">
                    Email address
                  </label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 transition font-sans"
                  />
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-medium text-neutral-700 font-sans">
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 transition font-sans"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-[#1e1e22] hover:bg-black text-white font-medium text-sm rounded-xl transition shadow-xs cursor-pointer font-sans mt-1"
                >
                  Continue with Email
                </button>
              </form>

              {/* Toggle to Sign Up */}
              <div className="text-center mt-4 text-xs text-neutral-500 font-sans">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('civilian_signup');
                    setError('');
                  }}
                  className="font-semibold text-neutral-900 hover:underline cursor-pointer"
                >
                  Sign up
                </button>
              </div>

              {/* Authority Link Below */}
              <div className="text-center mt-3 pt-3 border-t border-neutral-100 text-xs text-neutral-500 font-sans">
                An Aeris Authority?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('authority_login');
                    setError('');
                  }}
                  className="font-semibold text-neutral-900 hover:text-emerald-800 hover:underline cursor-pointer"
                >
                  Sign in here
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 2. CIVILIAN SIGNUP MODE                                  */}
          {/* ======================================================== */}
          {authMode === 'civilian_signup' && (
            <div>
              {/* Google Sign In */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 text-sm font-medium text-neutral-700 transition shadow-xs cursor-pointer font-sans"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Sign up with Google</span>
              </button>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-neutral-200/80" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2.5 text-neutral-400 font-sans">or</span>
                </div>
              </div>

              {/* Sign up form: Name, Email, Password, Confirm Password */}
              <form onSubmit={handleCivilianSignup} className="space-y-3">
                <div className="space-y-1 text-left">
                  <label className="block text-xs font-medium text-neutral-700 font-sans">
                    Full name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Aditi Rao"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      setError('');
                    }}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition font-sans"
                  />
                </div>

                <div className="space-y-1 text-left">
                  <label className="block text-xs font-medium text-neutral-700 font-sans">
                    Email address
                  </label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition font-sans"
                  />
                </div>

                <div className="space-y-1 text-left">
                  <label className="block text-xs font-medium text-neutral-700 font-sans">
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition font-sans"
                  />
                </div>

                <div className="space-y-1 text-left">
                  <label className="block text-xs font-medium text-neutral-700 font-sans">
                    Confirm password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError('');
                    }}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition font-sans"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#1f1f23] hover:bg-black text-white font-medium text-sm rounded-lg transition shadow-xs cursor-pointer font-sans mt-2"
                >
                  Create Account
                </button>
              </form>

              {/* Toggle to Log In */}
              <div className="text-center mt-4 text-xs text-neutral-500 font-sans">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('civilian_login');
                    setError('');
                  }}
                  className="font-semibold text-neutral-900 hover:underline cursor-pointer"
                >
                  Log in
                </button>
              </div>

              {/* Authority Link Below */}
              <div className="text-center mt-3 pt-3 border-t border-neutral-100 text-xs text-neutral-500 font-sans">
                An Aeris Authority?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('authority_login');
                    setError('');
                  }}
                  className="font-semibold text-neutral-900 hover:text-emerald-800 hover:underline cursor-pointer"
                >
                  Sign in here
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 3. AUTHORITY LOGIN MODE                                  */}
          {/* ======================================================== */}
          {authMode === 'authority_login' && (
            <div>
              {/* Authority Form: Aeris ID and 6-digit code only */}
              <form onSubmit={handleAuthoritySubmit} className="space-y-3.5">
                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-medium text-neutral-700 font-sans">
                    Aeris ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AERIS-CAQM-0809"
                    value={aerisId}
                    onChange={(e) => {
                      setAerisId(e.target.value);
                      setError('');
                    }}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-900 font-mono placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition"
                  />
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-medium text-neutral-700 font-sans">
                    6-Digit Security Code
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="••••••"
                    value={securityPin}
                    onChange={(e) => {
                      setSecurityPin(e.target.value.replace(/\D/g, ''));
                      setError('');
                    }}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-200 bg-white text-base tracking-widest text-center font-mono text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition"
                  />
                  <span className="text-[11px] text-neutral-400 block text-left font-sans mt-1">
                    Issued by CAQM Telemetry Infrastructure Command
                  </span>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#1f1f23] hover:bg-black text-white font-medium text-sm rounded-lg transition shadow-xs cursor-pointer font-sans mt-1"
                >
                  Continue as Authority
                </button>

                {/* 1-Click Quick Demo Helper */}
                <button
                  type="button"
                  onClick={handleDemoAuthority}
                  className="w-full py-2 px-3 border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-900 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                >
                  <span>Demo 1-Click: Sign in as CAQM Taskforce Chief</span>
                </button>
              </form>

              {/* Return to Civilian Login */}
              <div className="text-center mt-5 text-xs text-neutral-500 font-sans">
                Are you a citizen?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('civilian_login');
                    setError('');
                  }}
                  className="font-semibold text-neutral-900 hover:underline cursor-pointer"
                >
                  Return to Citizen Sign in
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Subtle bottom spacing to ensure clean frame */}
      <footer className="w-full py-3 relative z-10" />
    </div>
  );
};

export default LoginPage;
