'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { LoginResult } from '@/contexts/AuthContext';
import { notifyError } from '@/lib/toast';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Smartphone, Copy, Check } from 'lucide-react';
import HCaptcha from '@hcaptcha/react-hcaptcha';

type LoginStep = 'credentials' | 'totp' | 'totp-setup';

export default function LoginPage() {
    const router = useRouter();
    const { signIn, completeTOTP, confirmTOTPSetup, signOut, user, profile, loading: authLoading, profileLoading } = useAuth();

    // Form state
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Multi-step state
    const [loginStep, setLoginStep] = useState<LoginStep>('credentials');
    const [tempToken, setTempToken] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [qrCodeDataUri, setQrCodeDataUri] = useState('');
    const [base32Secret, setBase32Secret] = useState('');
    const [userName, setUserName] = useState('');
    const [copied, setCopied] = useState(false);

    // CAPTCHA state
    const [captchaToken, setCaptchaToken] = useState('');
    const captchaRef = useRef<HCaptcha>(null);

    // TOTP input refs for auto-focus
    const totpInputRef = useRef<HTMLInputElement>(null);

    const siteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || '';

    // Redirect if already logged in
    useEffect(() => {
        if (!authLoading && !profileLoading && user && profile) {
            // Allow all users to access the web portal for now (dev requirement)
            if (profile.role === 'superadmin' || profile.role === 'admin') {
                router.replace('/admin');
                return;
            }

            if (profile.role === 'intern' || profile.role === 'employee') {
                router.replace('/intern');
                return;
            }
        }
    }, [user, profile, authLoading, profileLoading, router, signOut]);

    // Auto-focus TOTP input when step changes
    useEffect(() => {
        if (loginStep === 'totp' || loginStep === 'totp-setup') {
            setTimeout(() => totpInputRef.current?.focus(), 100);
        }
    }, [loginStep]);

    const handleCredentialsSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // captchaToken is optional — backend decides based on role

        setLoading(true);

        const result: LoginResult = await signIn(email, password, captchaToken);

        if (result.error) {
            setError(result.error);
            notifyError(result.error);
            setLoading(false);
            // Reset CAPTCHA
            captchaRef.current?.resetCaptcha();
            setCaptchaToken('');
            return;
        }

        if (result.requiresTOTP) {
            setTempToken(result.tempToken || '');
            setUserName(result.user?.fullname || '');
            setLoginStep('totp');
            setLoading(false);
            return;
        }

        if (result.requiresTOTPSetup) {
            setTempToken(result.tempToken || '');
            setQrCodeDataUri(result.qrCodeDataUri || '');
            setBase32Secret(result.base32Secret || '');
            setUserName(result.user?.fullname || '');
            setLoginStep('totp-setup');
            setLoading(false);
            return;
        }

        // Direct login (no TOTP) — redirect will happen via useEffect
    };

    const handleTotpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await completeTOTP(tempToken, totpCode);

        if (result.error) {
            setError(result.error);
            setLoading(false);
            setTotpCode('');
            return;
        }

        // Success — redirect will happen via useEffect
    };

    const handleTotpSetupSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await confirmTOTPSetup(tempToken, totpCode);

        if (result.error) {
            setError(result.error);
            setLoading(false);
            setTotpCode('');
            return;
        }

        // Success — redirect will happen via useEffect
    };

    const handleCopySecret = async () => {
        try {
            await navigator.clipboard.writeText(base32Secret);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback
        }
    };

    const handleBack = () => {
        setLoginStep('credentials');
        setTempToken('');
        setTotpCode('');
        setQrCodeDataUri('');
        setBase32Secret('');
        setError('');
        setCaptchaToken('');
        captchaRef.current?.resetCaptcha();
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            {/* Dark mode toggle placeholder */}
            <div className="absolute top-4 right-4">
                <button className="p-2 rounded-full border border-gray-300 bg-white hover:bg-gray-50 transition-colors">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                </button>
            </div>

            {/* Logo */}
            <div className="flex justify-center pt-12 pb-6">
                <Image
                    src="/ATH%20logo/ATH-full-logo.png"
                    alt="ATH"
                    width={280}
                    height={86}
                    priority
                    className="h-auto w-[240px] object-contain sm:w-[280px]"
                />
            </div>

            {/* Login Card */}
            <div className="flex-1 flex items-start justify-center px-4 pb-8">
                <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">

                    {/* ─── STEP 1: Credentials + CAPTCHA ─── */}
                    {loginStep === 'credentials' && (
                        <>
                            <div className="text-center mb-8">
                                <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back</h1>
                                <p className="text-gray-500 text-sm">Please enter your credentials to access the portal</p>
                            </div>

                            {error && (
                                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleCredentialsSubmit} className="space-y-5">
                                {/* Email Field */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="name@company.com"
                                            required
                                            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-gray-400"
                                        />
                                    </div>
                                </div>

                                {/* Password Field */}
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-gray-700">Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required
                                            className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-gray-400"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>

                                {/* hCaptcha */}
                                <div className="flex justify-center">
                                    <HCaptcha
                                        ref={captchaRef}
                                        sitekey={siteKey}
                                        onVerify={(token) => setCaptchaToken(token)}
                                        onExpire={() => setCaptchaToken('')}
                                        onError={() => setCaptchaToken('')}
                                    />
                                </div>

                                {/* Remember Me */}
                                <div className="flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => setRememberMe(!rememberMe)}
                                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${rememberMe ? 'bg-purple-600 border-purple-600' : 'border-gray-300'}`}
                                    >
                                        {rememberMe && (
                                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                    </button>
                                    <span className="ml-2 text-sm text-gray-600">Remember me</span>
                                </div>

                                {/* Submit Button */}
                                <button
                                    type="submit"
                                    disabled={loading || authLoading || profileLoading}
                                    className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Verifying...
                                        </span>
                                    ) : (
                                        'Sign In'
                                    )}
                                </button>
                            </form>
                        </>
                    )}

                    {/* ─── STEP 2a: TOTP Verification ─── */}
                    {loginStep === 'totp' && (
                        <>
                            <div className="text-center mb-8">
                                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <ShieldCheck className="w-8 h-8 text-purple-600" />
                                </div>
                                <h1 className="text-2xl font-bold text-gray-900 mb-2">Two-Factor Authentication</h1>
                                <p className="text-gray-500 text-sm">
                                    Welcome back, <span className="font-medium text-gray-700">{userName}</span>
                                </p>
                                <p className="text-gray-500 text-sm mt-1">
                                    Enter the 6-digit code from your Google Authenticator app
                                </p>
                            </div>

                            {error && (
                                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleTotpSubmit} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Authenticator Code</label>
                                    <div className="relative">
                                        <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            ref={totpInputRef}
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]{6}"
                                            maxLength={6}
                                            value={totpCode}
                                            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            placeholder="000000"
                                            required
                                            autoComplete="one-time-code"
                                            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-gray-400 text-center text-2xl font-mono tracking-[0.5em]"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || totpCode.length !== 6}
                                    className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Verifying...
                                        </span>
                                    ) : (
                                        'Verify Code'
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={handleBack}
                                    className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors"
                                >
                                    ← Back to login
                                </button>
                            </form>
                        </>
                    )}

                    {/* ─── STEP 2b: TOTP Setup (First Time) ─── */}
                    {loginStep === 'totp-setup' && (
                        <>
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Smartphone className="w-8 h-8 text-green-600" />
                                </div>
                                <h1 className="text-xl font-bold text-gray-900 mb-2">Set Up Two-Factor Authentication</h1>
                                <p className="text-gray-500 text-sm">
                                    Scan the QR code below with <span className="font-medium">Google Authenticator</span>
                                </p>
                            </div>

                            {error && (
                                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* QR Code */}
                            <div className="flex justify-center mb-4">
                                <div className="p-3 bg-white border-2 border-gray-200 rounded-xl shadow-sm">
                                    {qrCodeDataUri && (
                                        <img
                                            src={qrCodeDataUri}
                                            alt="TOTP QR Code"
                                            width={200}
                                            height={200}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Manual Secret */}
                            <div className="mb-5">
                                <p className="text-xs text-gray-400 text-center mb-2">Or enter this key manually:</p>
                                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                                    <code className="text-xs font-mono text-gray-700 flex-1 text-center break-all">{base32Secret}</code>
                                    <button
                                        type="button"
                                        onClick={handleCopySecret}
                                        className="p-1 text-gray-400 hover:text-purple-600 transition-colors"
                                        title="Copy to clipboard"
                                    >
                                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Verification */}
                            <form onSubmit={handleTotpSetupSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Enter the 6-digit code from the app</label>
                                    <input
                                        ref={totpInputRef}
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]{6}"
                                        maxLength={6}
                                        value={totpCode}
                                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="000000"
                                        required
                                        autoComplete="one-time-code"
                                        className="w-full py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-gray-400 text-center text-2xl font-mono tracking-[0.5em]"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || totpCode.length !== 6}
                                    className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Activating...
                                        </span>
                                    ) : (
                                        'Activate 2FA & Sign In'
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={handleBack}
                                    className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors"
                                >
                                    ← Back to login
                                </button>
                            </form>
                        </>
                    )}

                    {/* Footer */}
                    <div className="mt-8 text-center">
                        <p className="text-gray-600 text-sm">© 2024 TicketIntel.</p>
                        <p className="text-purple-600 text-sm italic">Your Imagination is Our Creation</p>
                    </div>
                </div>
            </div>

            {/* Help Link */}
            <div className="text-center pb-6">
                <p className="text-gray-500 text-sm">
                    Need help? Contact our{' '}
                    <a href="#" className="text-purple-600 hover:text-purple-700 underline">IT Support Team</a>
                </p>
            </div>
        </div>
    );
}

