import { describe, it, expect } from 'vitest';
import { toUTCDate } from './time';

describe('Time Utilities (HKT to UTC)', () => {
    describe('toUTCDate', () => {
        it('correctly converts HKT morning time to UTC', () => {
            const ref = new Date('2026-03-03T00:00:00Z'); // midnight UTC
            const res = toUTCDate('09:00', ref);
            // 9:00 AM HKT is 1:00 AM UTC
            expect(res.toISOString()).toContain('T01:00:00.000Z');
        });

        it('correctly converts HKT evening time to UTC', () => {
            const ref = new Date('2026-03-03T00:00:00Z');
            const res = toUTCDate('19:30', ref);
            // 7:30 PM HKT is 11:30 AM UTC
            expect(res.toISOString()).toContain('T11:30:00.000Z');
        });

        it('handles date boundaries (HKT is ahead)', () => {
            const ref = new Date('2026-03-03T20:00:00Z'); // 4:00 AM HKT on March 4
            const res = toUTCDate('01:00', ref);
            // 1:00 AM HKT on March 4 is 5:00 PM UTC on March 3
            expect(res.toISOString()).toBe('2026-03-03T17:00:00.000Z');
        });
    });
});
