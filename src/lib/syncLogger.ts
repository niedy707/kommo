
import fs from 'fs';
import path from 'path';
import Redis from 'ioredis';

const LOG_FILE = path.join(process.cwd(), 'sync-logs.json');
const HISTORY_FILE = path.join(process.cwd(), 'sync-history.json');

// Helper to get writable path in Vercel (Fallback)
const getWritablePath = (filename: string) => {
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        return path.join('/tmp', filename);
    }
    return path.join(process.cwd(), filename);
};

const LOG_PATH = getWritablePath('sync-logs.json');
const HISTORY_PATH = getWritablePath('sync-history.json');
const MAX_LOGS = 100;

// Initialize Redis Client
const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
const redis = redisUrl ? new Redis(redisUrl) : null;

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

// --- Distributed Lock ---
export async function acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
    if (!redis) {
        console.warn("⚠️ Redis client not initialized. Falling back to local lock only.");
        return true; // If no Redis, rely on in-memory or ignore (local dev)
    }
    try {
        // SET key value NX EX ttl
        const result = await redis.set(lockKey, 'locked', 'EX', ttlSeconds, 'NX');
        if (result === 'OK') {
            return true;
        } else {
            console.warn(`🔒 Failed to acquire lock for ${lockKey}`);
            return false;
        }
    } catch (error) {
        console.error("Redis lock error:", error);
        return false; // Fail safe: assume locked if error
    }
}

export async function releaseLock(lockKey: string) {
    if (!redis) return;
    try {
        await redis.del(lockKey);
    } catch (error) {
        console.error("Redis unlock error:", error);
    }
}

// --- Redis Helpers ---
async function getRedisLogs(key: string): Promise<any[]> {
    if (!redis) return [];
    try {
        const data = await redis.get(key);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error(`Redis read error (${key}):`, error);
        return [];
    }
}

async function saveRedisLogs(key: string, logs: any[]) {
    if (!redis) return;
    try {
        await redis.set(key, JSON.stringify(logs));
    } catch (error) {
        console.error(`Redis write error (${key}):`, error);
    }
}

// --- Log Functions ---

export async function getLogs(): Promise<SyncLog[]> {
    if (redis) {
        return await getRedisLogs('kommo:logs');
    }
    // Fallback to File System
    try {
        if (!fs.existsSync(LOG_PATH)) return [];
        const data = fs.readFileSync(LOG_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Failed to read logs (FS):", error);
        return [];
    }
}

export async function getHistoryLogs(): Promise<SyncHistoryLog[]> {
    if (redis) {
        return await getRedisLogs('kommo:history');
    }
    // Fallback to File System
    try {
        if (!fs.existsSync(HISTORY_PATH)) return [];
        const data = fs.readFileSync(HISTORY_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Failed to read history logs (FS):", error);
        return [];
    }
}

export async function addLogs(newLogs: Omit<SyncLog, 'id' | 'timestamp'>[]) {
    const timestamp = new Date().toISOString();
    const formattedLogs: SyncLog[] = newLogs.map(log => ({
        id: Math.random().toString(36).substring(7),
        timestamp,
        ...log
    }));

    if (redis) {
        const currentLogs = await getRedisLogs('kommo:logs');
        const updatedLogs = [...formattedLogs, ...currentLogs].slice(0, MAX_LOGS);
        await saveRedisLogs('kommo:logs', updatedLogs);
        return updatedLogs;
    }

    // Fallback to File System
    try {
        let currentLogs: SyncLog[] = [];
        if (fs.existsSync(LOG_PATH)) {
            currentLogs = JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8'));
        }
        const updatedLogs = [...formattedLogs, ...currentLogs].slice(0, MAX_LOGS);
        fs.writeFileSync(LOG_PATH, JSON.stringify(updatedLogs, null, 2));
        return updatedLogs;
    } catch (error) {
        console.error("Failed to write logs (FS):", error);
        return [];
    }
}

export async function addHistoryLog(status: 'success' | 'error', trigger: 'manual' | 'auto', message?: string) {
    const timestamp = new Date().toISOString();
    const newLog: SyncHistoryLog = {
        id: Math.random().toString(36).substring(7),
        timestamp,
        status,
        trigger,
        message
    };

    if (redis) {
        const currentHistory = await getRedisLogs('kommo:history');
        const updatedHistory = [newLog, ...currentHistory].slice(0, MAX_LOGS);
        await saveRedisLogs('kommo:history', updatedHistory);
        return updatedHistory;
    }

    // Fallback to File System
    try {
        let currentHistory: SyncHistoryLog[] = [];
        if (fs.existsSync(HISTORY_PATH)) {
            currentHistory = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
        }
        const updatedHistory = [newLog, ...currentHistory].slice(0, MAX_LOGS);
        fs.writeFileSync(HISTORY_PATH, JSON.stringify(updatedHistory, null, 2));
        return updatedHistory;
    } catch (error) {
        console.error("Failed to write history log (FS):", error);
        return [];
    }
}
