export const CALENDAR_CONFIG = {
    email: process.env.GOOGLE_CLIENT_EMAIL || "",
    calendarId: process.env.GOOGLE_CALENDAR_ID || "",
    targetCalendarId: process.env.TARGET_CALENDAR_ID || "",
    // Handle newlines in private key if they are escaped as \\n
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, '\n')
};

if (!CALENDAR_CONFIG.email || !CALENDAR_CONFIG.key) {
    console.warn("⚠️ Warning: Google Calendar credentials are missing in .env.local");
}
