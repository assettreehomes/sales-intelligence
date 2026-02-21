import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getToken, API_URL } from '@/stores/authStore';

const HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds

export const BATTERY_STORAGE_KEY = 'employee_battery_level'; // localStorage key (0–100)

/** Read battery level from localStorage (set by the employee battery widget). */
function getStoredBatteryLevel(): number | null {
    try {
        const stored = localStorage.getItem(BATTERY_STORAGE_KEY);
        if (stored === null) return null;
        const parsed = parseInt(stored, 10);
        return !isNaN(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
    } catch {
        return null;
    }
}

export function useEmployeeHeartbeat() {
    const { user, profile } = useAuth();
    // Expose a ref so the battery widget can trigger an immediate beat
    const sendNowRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!user || !profile || (profile.role !== 'employee' && profile.role !== 'intern')) {
            return;
        }

        const sendHeartbeat = async () => {
            try {
                const token = await getToken();
                if (!token) return;

                const currentTicketId = sessionStorage.getItem('current_ticket_id') || null;
                const currentClientId = sessionStorage.getItem('current_client_id') || null;
                const isRecording = sessionStorage.getItem('is_recording') === 'true';
                const batteryLevel = getStoredBatteryLevel(); // from localStorage slider

                await fetch(`${API_URL}/employee/heartbeat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        is_online: true,
                        is_recording: isRecording,
                        current_client_id: currentClientId,
                        current_ticket_id: currentTicketId,
                        battery_level: batteryLevel,
                    })
                });
            } catch (error) {
                console.error('Heartbeat failed:', error);
            }
        };

        // Expose for external trigger (e.g. battery widget change)
        sendNowRef.current = () => { void sendHeartbeat(); };

        void sendHeartbeat(); // immediate on mount

        const intervalId = setInterval(() => {
            void sendHeartbeat();
        }, HEARTBEAT_INTERVAL);

        return () => {
            clearInterval(intervalId);
            sendNowRef.current = null;
        };
    }, [user, profile]);

    return { triggerHeartbeat: () => sendNowRef.current?.() };
}
