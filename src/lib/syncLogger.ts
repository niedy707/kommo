
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'sync-logs.json');
const MAX_LOGS = 100;

export interface SyncLog {
    id: string;
    timestamp: string;
    type: 'create' | 'update' | 'delete' | 'info';
    message: string;
    details?: string;
}

export function getLogs(): SyncLog[] {
    try {
        if (!fs.existsSync(LOG_FILE)) {
            return [];
        }
        const data = fs.readFileSync(LOG_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Failed to read logs:", error);
        return [];
    }
}

export function addLogs(newLogs: Omit<SyncLog, 'id' | 'timestamp'>[]) {
    try {
        const logs = getLogs();
        const timestamp = new Date().toISOString();

        const formattedLogs: SyncLog[] = newLogs.map(log => ({
            id: Math.random().toString(36).substring(7),
            timestamp,
            ...log
        }));

        // Add new logs to the beginning
        const updatedLogs = [...formattedLogs, ...logs].slice(0, MAX_LOGS);

        fs.writeFileSync(LOG_FILE, JSON.stringify(updatedLogs, null, 2));
        return updatedLogs;
    } catch (error) {
        console.error("Failed to write logs:", error);
        return [];
    }
}
