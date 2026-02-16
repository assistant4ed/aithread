'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AutoRefresh() {
    const router = useRouter();

    useEffect(() => {
        const interval = setInterval(() => {
            router.refresh();
        }, 10000); // Refresh every 10 seconds

        return () => clearInterval(interval);
    }, [router]);

    return null;
}
