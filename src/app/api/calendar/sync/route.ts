
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { CALENDAR_CONFIG } from '@/lib/calendarConfig';

import { categorizeEvent, cleanDisplayName } from '@/lib/classification';

export const dynamic = 'force-dynamic';

import { addLogs, getLogs, addHistoryLog, getHistoryLogs, acquireLock, releaseLock } from '@/lib/syncLogger';

export async function POST(request: NextRequest) {
    // Try to acquire distributed lock for 60 seconds
    const locked = await acquireLock('kommo:sync-lock', 60);
    if (!locked) {
        console.warn("⚠️ Sync skipped: Another instance holds the lock.");
        return NextResponse.json({ success: false, error: "Sync already in progress (Locked)" }, { status: 429 });
    }

    try {
        return await handleSync(request);
    } finally {
        await releaseLock('kommo:sync-lock');
    }
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

        // Get trigger from URL (manual vs auto)
        const { searchParams } = new URL(request.url);
        const trigger = (searchParams.get('trigger') as 'manual' | 'auto') || 'auto';

        const sessionLogs: { type: 'create' | 'update' | 'delete' | 'info', message: string, details?: string, trigger: 'manual' | 'auto' }[] = [];

        // ... (Auth and Fetch Logic - UNCHANGED)
        const SCOPES = ['https://www.googleapis.com/auth/calendar'];
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

        // 3. Fetch source events
        const sourceResponse = await calendar.events.list({
            calendarId: CALENDAR_CONFIG.calendarId,
            timeMin, timeMax, maxResults: 2500, singleEvents: true, orderBy: 'startTime',
        });
        const sourceEvents = sourceResponse.data.items || [];

        // Filter events
        const syncEvents = sourceEvents.filter(ev => {
            if (!ev.summary || ev.status === 'cancelled') return false;
            const start = ev.start?.dateTime || ev.start?.date;
            const end = ev.end?.dateTime || ev.end?.date;
            const category = categorizeEvent(ev.summary, ev.colorId || undefined, start || undefined, end || undefined);
            return category === 'surgery' || category === 'blocked' || category === 'info';
        });

        // 4. Fetch target events
        const targetResponse = await calendar.events.list({
            calendarId: CALENDAR_CONFIG.targetCalendarId,
            timeMin, timeMax, maxResults: 2500, singleEvents: true, orderBy: 'startTime',
        });
        const targetEvents = targetResponse.data.items || [];

        // 5. Sync Logic
        let createdCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;
        const usedEventIds = new Set<string>();

        const NEW_DESCRIPTION = `-µπ-
👉🏻 Bu randevu, orijinal takvimden bir kopyasıdır ve bir otomasyon ile mevcut takvime aktarılmaktadır.
İmza: i.yağcı`;

        const OLD_DESCRIPTION = "Bu takvim etkinliği orijinal etkinliğin bir kopyasıdır ve bir otomasyon ile mevcut takvime aktarılmaktadır.";

        // Helper to check if an event is managed by us
        const isManagedEvent = (desc: string | undefined | null) => {
            if (!desc) return false;
            return desc === NEW_DESCRIPTION || desc === OLD_DESCRIPTION || desc.includes("-µπ-");
        };

        for (const srcEv of syncEvents) {
            if (!srcEv.start?.dateTime || !srcEv.end?.dateTime) continue;

            const srcStart = new Date(srcEv.start.dateTime).toISOString();
            const srcRawTitle = srcEv.summary || "Etkinlik";
            const category = categorizeEvent(srcRawTitle, srcEv.colorId || undefined, srcEv.start.dateTime, srcEv.end.dateTime);

            let targetTitle = srcRawTitle;
            let targetDescription = srcEv.description || "";
            let targetColorId = srcEv.colorId;
            let logTitle = srcRawTitle; // Default log title

            if (category === 'surgery') {
                const cleanedName = cleanDisplayName(srcRawTitle);
                targetTitle = `Surgery ${cleanedName}`;
                logTitle = cleanedName; // Log only the name for surgeries
                targetDescription = NEW_DESCRIPTION;
                targetColorId = '5';
            } else if (category === 'info') {
                // Info events: Keep title, description, and color as is
                targetTitle = srcRawTitle;
                logTitle = srcRawTitle;
                // Append signature to description for management tracking if not already present
                if (!isManagedEvent(targetDescription)) {
                    targetDescription = `${targetDescription || ''}\n\n${NEW_DESCRIPTION}`;
                }
                // Keep original color (targetColorId is already set to srcEv.colorId)
            }

            const srcLocation = srcEv.location || "";

            // MATCHING LOGIC (ROBUST ID-BASED)
            // 1. Try to find by Source ID (Best)
            // 2. Fallback to Time + Title (Legacy)

            const availableTargets = targetEvents.filter(t => t.id && !usedEventIds.has(t.id));
            let existing = availableTargets.find(tgt => {
                return tgt.extendedProperties?.shared?.sourceId === srcEv.id;
            });

            if (!existing) {
                // FALLBACK: Legacy matching for events created before this update
                existing = availableTargets.find(tgt => {
                    const tgtStart = tgt.start?.dateTime ? new Date(tgt.start.dateTime).toISOString() : null;
                    const timeMatch = tgtStart === srcStart;
                    const titleMatch = (tgt.summary === targetTitle || tgt.summary === srcRawTitle);

                    // Debug matching if titles are remarkably similar but fail
                    if (!titleMatch && tgt.summary?.includes(targetTitle.replace('Surgery ', ''))) {
                        console.log(`[MATCH DEBUG] Fail: '${tgt.summary}' vs '${targetTitle}' | TimeMatch: ${timeMatch}`);
                    }

                    return timeMatch && titleMatch;
                });
            }

            // Common Properties for Insert/Patch
            const extendedProperties = {
                shared: {
                    sourceId: srcEv.id!,
                    managedBy: 'kommo-sync'
                }
            };

            if (existing && existing.id) {
                usedEventIds.add(existing.id);

                const tgtStart = existing.start?.dateTime ? new Date(existing.start.dateTime).toISOString() : null;
                const tgtEnd = existing.end?.dateTime ? new Date(existing.end.dateTime).toISOString() : null;
                const srcEnd = new Date(srcEv.end.dateTime).toISOString();

                const normalizeStr = (str: string | undefined | null) => (str || "").trim().replace(/\r\n/g, '\n');

                const needsTitleUpdate = existing.summary !== targetTitle;
                const needsDescUpdate = normalizeStr(existing.description) !== normalizeStr(targetDescription);
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
                        message: logTitle,
                        details: changes.length > 0 ? changes.join(', ') : 'Detay güncellendi',
                        trigger
                    });

                    await calendar.events.patch({
                        calendarId: CALENDAR_CONFIG.targetCalendarId,
                        eventId: existing.id,
                        requestBody: {
                            summary: targetTitle,
                            description: targetDescription,
                            colorId: targetColorId,
                            start: srcEv.start,
                            end: srcEv.end,
                            location: srcLocation,
                            extendedProperties // Ensure ID is saved
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
                message: logTitle,
                details: `${new Date(srcStart).toLocaleDateString('tr-TR')} - ${srcEv.start.dateTime.split('T')[1].slice(0, 5)}`,
                trigger
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
                    reminders: { useDefault: true },
                    extendedProperties // Save Source ID
                }
            });

            if (newEvent.data.id) usedEventIds.add(newEvent.data.id);
            createdCount++;
        }

        // DELETE LOGIC (Handle cancelled/deleted events)
        const deletionCandidates = targetEvents.filter(t => t.id && !usedEventIds.has(t.id));
        let deletedCount = 0;

        for (const candidate of deletionCandidates) {
            // Safety Check: Only delete if description matches our signature (new or old)
            // OR if it has our sourceId property
            const hasSourceId = !!candidate.extendedProperties?.shared?.sourceId;

            if (isManagedEvent(candidate.description) || hasSourceId) {
                try {
                    await calendar.events.delete({
                        calendarId: CALENDAR_CONFIG.targetCalendarId,
                        eventId: candidate.id!,
                    });

                    sessionLogs.push({
                        type: 'delete',
                        message: candidate.summary || 'Bilinmeyen Etkinlik',
                        details: 'Kaynak takvimden silindiği için kaldırıldı',
                        trigger
                    });

                    deletedCount++;
                } catch (e) {
                    console.error(`Failed to delete event ${candidate.id}:`, e);
                }
            }
        }

        // SAVE LOGS
        if (sessionLogs.length > 0) {
            await addLogs(sessionLogs);
        }

        // Fetch Calendar Details for UI
        const [sourceCalInfo, targetCalInfo] = await Promise.all([
            calendar.calendars.get({ calendarId: CALENDAR_CONFIG.calendarId }).catch(() => ({ data: { summary: 'Source Calendar' } })),
            calendar.calendars.get({ calendarId: CALENDAR_CONFIG.targetCalendarId }).catch(() => ({ data: { summary: 'Target Calendar' } }))
        ]);

        // Generate Upcoming Surgeries List (from Target Calendar)
        const finalTargetResponse = await calendar.events.list({
            calendarId: CALENDAR_CONFIG.targetCalendarId,
            timeMin, timeMax, maxResults: 2500, singleEvents: true, orderBy: 'startTime',
        });
        const finalTargetEvents = finalTargetResponse.data.items || [];

        const upcomingSurgeries = finalTargetEvents
            .filter(ev => ev.summary?.startsWith('Surgery') && ev.start?.dateTime)
            .map(ev => ({
                id: ev.id,
                name: ev.summary?.replace('Surgery', '').trim(),
                date: ev.start?.dateTime,
            }))
            .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());

        // ... (end of sync logic)

        // Record HISTORY Log (Success)
        const hasChanges = createdCount > 0 || updatedCount > 0 || deletedCount > 0;
        const msg = hasChanges
            ? `Senkronizasyon başarılı. (${createdCount} yeni, ${updatedCount} güncel, ${deletedCount} silindi)`
            : "Senkronizasyon başarılı. (Değişiklik yok)";

        await addHistoryLog('success', trigger, msg);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            logs: await getLogs(), // Data changes
            history: await getHistoryLogs(), // Sync history
            upcomingSurgeries,
            stats: {
                foundTotal: syncEvents.length,
                created: createdCount,
                updated: updatedCount,
                skipped: skippedCount,
                deleted: deletedCount,
                source: {
                    name: sourceCalInfo.data.summary,
                    futureEvents: syncEvents.length
                },
                target: {
                    name: targetCalInfo.data.summary,
                    totalEvents: finalTargetEvents.length
                }
            }
        });

    } catch (error: unknown) {
        console.error("Sync Error:", error);

        const errorMessage = error instanceof Error ? error.message : "Bilinmeyen Hata";

        // Record HISTORY Log (Error)
        // We need to re-parse trigger here or pass it down? 
        // For simplicity, we can't easily access 'trigger' in catch block without moving var decl up.
        // Let's rely on default 'auto' if undefined or try to extract again.
        let trigger: 'manual' | 'auto' = 'auto';
        try {
            const { searchParams } = new URL(request.url);
            trigger = (searchParams.get('trigger') as 'manual' | 'auto') || 'auto';
        } catch { }

        await addHistoryLog('error', trigger, `Senkronizasyon HATASI. (sebep: ${errorMessage})`);

        return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
}
