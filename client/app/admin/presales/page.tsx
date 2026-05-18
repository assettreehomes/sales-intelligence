'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy route — pre-sales calls live on the unified tickets page. */
export default function PresalesRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/admin/tickets?view=presales');
    }, [router]);

    return null;
}
