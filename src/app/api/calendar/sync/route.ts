
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { CALENDAR_CONFIG } from '@/lib/calendarConfig';

import { categorizeEvent, cleanDisplayName } from '@/lib/classification';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    return handleSync(request);
}

export async function GET(request: NextRequest) {
    return handleSync(request);
}

async function handleSync(request: NextRequest) {
    try {
        console.log("Starting calendar sync...");

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

            if (category === 'surgery') {
                // New Title Format: "Surgery Name Surname"
                const cleanedName = cleanDisplayName(srcRawTitle);
                targetTitle = `Surgery ${cleanedName}`;
                targetDescription = FIXED_DESCRIPTION; // Override for surgeries
            }
            // For 'blocked', we keep the original title and description

            const srcLocation = srcEv.location || "";
            const srcColorId = srcEv.colorId;

            // Check if exists in target
            // Match by Start Time AND (Title == NewTitle OR Title == OldRawTitle)
            const existing = targetEvents.find(tgt => {
                const tgtStart = tgt.start?.dateTime ? new Date(tgt.start.dateTime).toISOString() : null;
                return tgtStart === srcStart && (tgt.summary === targetTitle || tgt.summary === srcRawTitle);
            });

            if (existing) {
                // Check if update needed (Title, Description, or Color)
                const needsTitleUpdate = existing.summary !== targetTitle;
                const needsDescUpdate = existing.description !== targetDescription;
                const needsColorUpdate = existing.colorId !== srcColorId;

                if (needsTitleUpdate || needsDescUpdate || needsColorUpdate) {
                    await calendar.events.patch({
                        calendarId: CALENDAR_CONFIG.targetCalendarId,
                        eventId: existing.id || undefined,
                        requestBody: {
                            summary: targetTitle, // Force new title
                            description: targetDescription,
                            colorId: srcColorId
                        }
                    });
                    updatedCount++;
                } else {
                    skippedCount++;
                }
                continue;
            }

            // Insert new event
            await calendar.events.insert({
                calendarId: CALENDAR_CONFIG.targetCalendarId,
                requestBody: {
                    summary: targetTitle,
                    description: targetDescription,
                    location: srcLocation,
                    start: srcEv.start,
                    end: srcEv.end,
                    colorId: srcColorId,
                    reminders: {
                        useDefault: true
                    }
                }
            });
            createdCount++;
        }

        return NextResponse.json({
            success: true,
            message: "Sync completed",
            stats: {
                foundTotal: syncEvents.length,
                created: createdCount,
                updated: updatedCount,
                skipped: skippedCount
            }
        });

    } catch (error: any) {
        console.error("Sync Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
