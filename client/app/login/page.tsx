'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { notifyError } from '@/lib/toast';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const { signIn, signOut, user, profile, loading: authLoading, profileLoading } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Redirect if already logged in
    useEffect(() => {
        if (!authLoading && !profileLoading && user && profile) {
            if (profile.role === 'superadmin' || profile.role === 'admin') {
                router.replace('/admin');
                return;
            }

            if (profile.role === 'intern') {
                router.replace('/intern');
                return;
            }

            const kickOutEmployee = async () => {
                await signOut();
                const message = 'Employee web access is disabled. Please use the mobile application.';
                setError(message);
                notifyError(message, { toastId: 'employee-web-disabled' });
            };

            void kickOutEmployee();
        }
    }, [user, profile, authLoading, profileLoading, router, signOut]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await signIn(email, password);

        if (result.error) {
            setError(result.error);
            notifyError(result.error);
            setLoading(false);
            return;
        }

        // Redirect will happen via useEffect after profile loads
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
                <div className="w-28 h-28 bg-[#2d3a2d] rounded-lg flex items-center justify-center shadow-lg">
                    <div className="text-center">
                        <div className="text-white text-xs font-semibold tracking-wide">TICKET</div>
                        <div className="text-3xl my-1">🌳</div>
                        <div className="text-white text-xs font-semibold tracking-wide">INTEL</div>
                    </div>
                </div>
            </div>

            {/* Login Card */}
            <div className="flex-1 flex items-start justify-center px-4 pb-8">
                <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back</h1>
                        <p className="text-gray-500 text-sm">Please enter your credentials to access the portal</p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
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
                                    Signing in...
                                </span>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>

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
