
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'sync-logs.json');
const HISTORY_FILE = path.join(process.cwd(), 'sync-history.json');

// Helper to get writable path in Vercel
const getWritablePath = (filename: string) => {
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        return path.join('/tmp', filename);
    }
    return path.join(process.cwd(), filename);
};

const LOG_PATH = getWritablePath('sync-logs.json');
const HISTORY_PATH = getWritablePath('sync-history.json');
const MAX_LOGS = 100;

export interface SyncLog {
    id: string;
    timestamp: string;
    type: 'create' | 'update' | 'delete' | 'info';
    message: string;
    details?: string;
    trigger?: 'manual' | 'auto';
}

export interface SyncHistoryLog {
    id: string;
    timestamp: string;
    status: 'success' | 'error';
    message?: string;
    trigger: 'manual' | 'auto';
}

export function getLogs(): SyncLog[] {
    try {
        if (!fs.existsSync(LOG_PATH)) {
            return [];
        }
        const data = fs.readFileSync(LOG_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Failed to read logs:", error);
        return [];
    }
}

export function getHistoryLogs(): SyncHistoryLog[] {
    try {
        if (!fs.existsSync(HISTORY_PATH)) {
            return [];
        }
        const data = fs.readFileSync(HISTORY_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Failed to read history logs:", error);
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

        fs.writeFileSync(LOG_PATH, JSON.stringify(updatedLogs, null, 2));
        return updatedLogs;
    } catch (error) {
        console.error("Failed to write logs:", error);
        return [];
    }
}

export function addHistoryLog(status: 'success' | 'error', trigger: 'manual' | 'auto', message?: string) {
    try {
        const logs = getHistoryLogs();
        const timestamp = new Date().toISOString();

        const newLog: SyncHistoryLog = {
            id: Math.random().toString(36).substring(7),
            timestamp,
            status,
            trigger,
            message
        };

        // Add new log to the beginning
        const updatedLogs = [newLog, ...logs].slice(0, MAX_LOGS);

        fs.writeFileSync(HISTORY_PATH, JSON.stringify(updatedLogs, null, 2));
        return updatedLogs;
    } catch (error) {
        console.error("Failed to write history log:", error);
        return [];
    }
}
