'use client';

import { useEmployeeHeartbeat } from '@/hooks/useEmployeeHeartbeat';

export function HeartbeatManager() {
    useEmployeeHeartbeat();
    return null;
}
