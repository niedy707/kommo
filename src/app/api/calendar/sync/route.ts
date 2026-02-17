
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { CALENDAR_CONFIG } from '@/lib/calendarConfig';

import { categorizeEvent, cleanDisplayName } from '@/lib/classification';

export const dynamic = 'force-dynamic';

import { addLogs, getLogs } from '@/lib/syncLogger';

export async function POST(request: NextRequest) {
    return handleSync(request);
}

export async function GET(request: NextRequest) {
    // If it's a simple GET, maybe return logs? 
    // But handleSync essentially does a sync. 
    // Let's create a separate route for just fetching logs later if needed, but for now user wants to see it "during sync" or on dashboard.
    // Actually, dashboard polls this.
    return handleSync(request);
}

async function handleSync(request: NextRequest) {
    try {
        console.log("Starting calendar sync...");
        const sessionLogs: { type: 'create' | 'update' | 'info', message: string, details?: string }[] = [];

        // 1. Auth
        const SCOPES = ['https://www.googleapis.com/auth/calendar']; // Read/Write access needed
        const privateKey = CALENDAR_CONFIG.key.replace(/\\n/g, '\n');
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: CALENDAR_CONFIG.email,
                private_key: privateKey,
            },
            scopes: SCOPES,
        });
        const calendar = google.calendar({ version: 'v3', auth });

        // 2. Define Time Range (Next 6 Months)
        const now = new Date();
        const sixMonthsLater = new Date();
        sixMonthsLater.setMonth(now.getMonth() + 6);

        const timeMin = now.toISOString();
        const timeMax = sixMonthsLater.toISOString();

        // 3. Fetch "Ameliyat" events from SOURCE calendar
        console.log("Fetching source events...");
        const sourceResponse = await calendar.events.list({
            calendarId: CALENDAR_CONFIG.calendarId,
            timeMin,
            timeMax,
            maxResults: 2500,
            singleEvents: true,
            orderBy: 'startTime',
            // q: 'Ameliyat' // REMOVED: Filtering locally now
        });

        const sourceEvents = sourceResponse.data.items || [];
        console.log(`Found ${sourceEvents.length} source events.`);

        // Filter using shared classification logic
        // Filter using shared classification logic
        const syncEvents = sourceEvents.filter(ev => {
            if (!ev.summary || ev.status === 'cancelled') return false;

            const start = ev.start?.dateTime || ev.start?.date;
            const end = ev.end?.dateTime || ev.end?.date;

            // Use the shared classification logic
            const category = categorizeEvent(
                ev.summary,
                ev.colorId || undefined, // Pass colorId (logic handles '11' or hex)
                start || undefined,
                end || undefined
            );

            // Sync surgeries AND blocked events (izin, kongre, etc.)
            return category === 'surgery' || category === 'blocked';
        });
        console.log(`Filtered to ${syncEvents.length} events to sync (surgery + blocked).`);


        // 4. Fetch ALL events from TARGET calendar (to avoid duplicates)
        // We need check existing events to update/skip
        console.log("Fetching target events...");
        const targetResponse = await calendar.events.list({
            calendarId: CALENDAR_CONFIG.targetCalendarId,
            timeMin,
            timeMax,
            maxResults: 2500,
            singleEvents: true,
            orderBy: 'startTime',
        });
        const targetEvents = targetResponse.data.items || [];
        console.log(`Found ${targetEvents.length} target events.`);

        // 5. Sync Logic
        // Strategy: Match by start time + summary (fuzzy match or exact?)
        // Better: Use a custom property "sourceEventId" if possible, but we might not have set it before.
        // Fallback: Match by Start Time exactly. If multiple, match Title.

        let createdCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;

        const FIXED_DESCRIPTION = "Bu takvim etkinliği orijinal etkinliğin bir kopyasıdır ve bir otomasyon ile mevcut takvime aktarılmaktadır.";

        const usedEventIds = new Set<string>();

        for (const srcEv of syncEvents) {
            if (!srcEv.start?.dateTime || !srcEv.end?.dateTime) continue;

            const srcStart = new Date(srcEv.start.dateTime).toISOString();
            const srcRawTitle = srcEv.summary || "Etkinlik";

            // Recalculate category for title logic
            const category = categorizeEvent(
                srcRawTitle,
                srcEv.colorId || undefined,
                srcEv.start.dateTime,
                srcEv.end.dateTime
            );

            let targetTitle = srcRawTitle;
            let targetDescription = srcEv.description || ""; // Default to source description
            let targetColorId = srcEv.colorId; // Default to source color

            if (category === 'surgery') {
                // New Title Format: "Surgery Name Surname"
                const cleanedName = cleanDisplayName(srcRawTitle);
                targetTitle = `Surgery ${cleanedName}`;
                targetDescription = FIXED_DESCRIPTION; // Override for surgeries
                targetColorId = '5'; // Force Yellow for surgeries (User Request)
            }
            // For 'blocked', we keep the original title, description, and color

            const srcLocation = srcEv.location || "";

            // Improved Matching Logic
            // 1. Filter out already matched events
            const availableTargets = targetEvents.filter(t => t.id && !usedEventIds.has(t.id));

            // 2. Try Exact Match First (Title + Start Time)
            let existing = availableTargets.find(tgt => {
                const tgtStart = tgt.start?.dateTime ? new Date(tgt.start.dateTime).toISOString() : null;
                return tgtStart === srcStart && (tgt.summary === targetTitle || tgt.summary === srcRawTitle);
            });

            // 3. If no exact match, Try Name Match Only (e.g. event moved to new time)
            if (!existing) {
                existing = availableTargets.find(tgt => {
                    return tgt.summary === targetTitle || tgt.summary === srcRawTitle;
                });
            }

            if (existing && existing.id) {
                // Mark this target event as handled so it's not matched again
                usedEventIds.add(existing.id);

                // Check if update needed (Title, Description, Color, or Time)
                const tgtStart = existing.start?.dateTime ? new Date(existing.start.dateTime).toISOString() : null;
                const tgtEnd = existing.end?.dateTime ? new Date(existing.end.dateTime).toISOString() : null;
                const srcEnd = new Date(srcEv.end.dateTime).toISOString();

                // Normalization helper for comparison
                const normalizeStr = (str: string | undefined | null) => (str || "").trim();

                const needsTitleUpdate = existing.summary !== targetTitle;
                const needsDescUpdate = normalizeStr(existing.description) !== normalizeStr(targetDescription);
                // Handle colorId comparison (treat null/undefined as same)
                const existingColor = existing.colorId || undefined;
                const targetColor = targetColorId || undefined;
                const needsColorUpdate = existingColor !== targetColor;

                const needsTimeUpdate = tgtStart !== srcStart || tgtEnd !== srcEnd;
                const needsLocationUpdate = normalizeStr(existing.location) !== normalizeStr(srcLocation);

                if (needsTitleUpdate || needsDescUpdate || needsColorUpdate || needsTimeUpdate || needsLocationUpdate) {
                    const changes = [];
                    if (needsTitleUpdate) changes.push(`İsim: ${existing.summary} -> ${targetTitle}`);
                    if (needsTimeUpdate) changes.push(`Saat: ${new Date(tgtStart!).toLocaleString('tr-TR')} -> ${new Date(srcStart).toLocaleString('tr-TR')}`);
                    if (needsColorUpdate) changes.push(`Renk değişimi`);
                    if (needsDescUpdate) changes.push(`Açıklama değişimi`);
                    if (needsLocationUpdate) changes.push(`Konum değişimi`);

                    sessionLogs.push({
                        type: 'update',
                        message: targetTitle,
                        details: changes.length > 0 ? changes.join(', ') : 'Detay güncellendi'
                    });

                    console.log(`Updating event: ${targetTitle} (Time changed: ${needsTimeUpdate})`);
                    await calendar.events.patch({
                        calendarId: CALENDAR_CONFIG.targetCalendarId,
                        eventId: existing.id,
                        requestBody: {
                            summary: targetTitle,
                            description: targetDescription,
                            colorId: targetColorId,
                            start: srcEv.start,
                            end: srcEv.end,
                            location: srcLocation
                        }
                    });
                    updatedCount++;
                } else {
                    skippedCount++;
                }
                continue;
            }

            // Insert new event
            sessionLogs.push({
                type: 'create',
                message: targetTitle,
                details: `${new Date(srcStart).toLocaleDateString('tr-TR')} - ${srcEv.start.dateTime.split('T')[1].slice(0, 5)}`
            });
            const newEvent = await calendar.events.insert({
                calendarId: CALENDAR_CONFIG.targetCalendarId,
                requestBody: {
                    summary: targetTitle,
                    description: targetDescription,
                    location: srcLocation,
                    start: srcEv.start,
                    end: srcEv.end,
                    colorId: targetColorId,
                    reminders: {
                        useDefault: true
                    }
                }
            });

            if (newEvent.data.id) {
                usedEventIds.add(newEvent.data.id);
            }
            createdCount++;
        }

        // SAVE LOGS
        if (sessionLogs.length > 0) {
            addLogs(sessionLogs);
        }

        // Fetch Calendar Details for UI
        const [sourceCalInfo, targetCalInfo] = await Promise.all([
            calendar.calendars.get({ calendarId: CALENDAR_CONFIG.calendarId }).catch(() => ({ data: { summary: 'Source Calendar' } })),
            calendar.calendars.get({ calendarId: CALENDAR_CONFIG.targetCalendarId }).catch(() => ({ data: { summary: 'Target Calendar' } }))
        ]);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            logs: getLogs(), // Return all logs (last 100)
            stats: {
                foundTotal: syncEvents.length,
                created: createdCount,
                updated: updatedCount,
                skipped: skippedCount,
                source: {
                    name: sourceCalInfo.data.summary,
                    futureEvents: syncEvents.length
                },
                target: {
                    name: targetCalInfo.data.summary,
                    totalEvents: targetEvents.length
                }
            }
        });

    } catch (error: any) {
        console.error("Sync Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
