import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getToken, API_URL } from '@/stores/authStore';

const HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds

export function useEmployeeHeartbeat() {
    const { user, profile } = useAuth();

    useEffect(() => {
        // Only run for authenticated employees/interns
        if (!user || !profile || (profile.role !== 'employee' && profile.role !== 'intern')) {
            return;
        }

        const sendHeartbeat = async () => {
            try {
                const token = await getToken();
                if (!token) return;

                await fetch(`${API_URL}/employee/heartbeat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        is_online: true,
                        is_recording: false, // TODO: Hook into actual recording state if available
                        current_client_id: null // TODO: Hook into actual client context
                    })
                });
            } catch (error) {
                console.error('Heartbeat failed:', error);
            }
        };

        // Send immediately on mount/login
        void sendHeartbeat();

        // Set up interval
        const intervalId = setInterval(() => {
            void sendHeartbeat();
        }, HEARTBEAT_INTERVAL);

        return () => clearInterval(intervalId);
    }, [user, profile]);
}
