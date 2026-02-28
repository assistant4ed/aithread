/**
 * Shared timezone utilities for HKT (Asia/Hong_Kong, UTC+8).
 * All schedule logic assumes HKT as the canonical timezone.
 */

/**
 * Converts an HKT time string (HH:MM) to a UTC Date object for the current day in HKT.
 */
export function toUTCDate(hhmmHKT: string, referenceDate: Date): Date {
    const [h, m] = hhmmHKT.split(":").map(Number);

    // Get the current date in HKT as YYYY-MM-DD
    const hktDateString = referenceDate.toLocaleDateString("en-CA", {
        timeZone: "Asia/Hong_Kong"
    });

    // Create a new date at the specified time in HKT for that day
    // Format: YYYY-MM-DDTHH:mm:ss+08:00
    const date = new Date(`${hktDateString}T${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00+08:00`);

    return date;
}

/**
 * Returns midnight HKT (00:00 Asia/Hong_Kong) as a UTC Date for today.
 */
export function todayStartHKT(): Date {
    return toUTCDate("00:00", new Date());
}
