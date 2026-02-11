/**
 * Firebase Firestore Store for INSTANT UNDO
 * Uses per-user subcollections for natural data isolation
 * 
 * Firestore Structure:
 *   users/{userId}/logs/{actionId}     → { label, platform, meta, status, timestamp, createdAt }
 *   pendingActions/{actionId}          → { type, label, metadata, platform, graceWindow, userId, status, createdAt }
 */

const { getDB, isFirebaseConnected } = require('./db');

// Fallback in-memory storage (used if Firebase is not connected)
const memoryPendingActions = new Map();
const memoryActivityLogs = [];

// Collection names
const PENDING_COLLECTION = 'pendingActions';

const store = {
    // ==========================================
    // PENDING ACTIONS (global collection, tagged with userId)
    // ==========================================

    async addPendingAction(action) {
        if (!isFirebaseConnected()) {
            memoryPendingActions.set(action.id, {
                ...action,
                createdAt: Date.now(),
                status: 'PENDING'
            });
            return action;
        }

        try {
            const db = getDB();
            await db.collection(PENDING_COLLECTION).doc(action.id).set({
                actionId: action.id,
                type: action.type,
                label: action.label,
                metadata: action.metadata,
                platform: action.platform,
                graceWindow: action.graceWindow,
                userId: action.userId || null,
                status: 'PENDING',
                createdAt: Date.now()
            });
            return action;
        } catch (error) {
            console.error('Error saving pending action:', error.message);
            memoryPendingActions.set(action.id, action);
            return action;
        }
    },

    async getPendingAction(id) {
        if (!isFirebaseConnected()) {
            return memoryPendingActions.get(id);
        }

        try {
            const db = getDB();
            const doc = await db.collection(PENDING_COLLECTION).doc(id).get();

            if (!doc.exists) return null;

            const data = doc.data();
            return {
                id: data.actionId,
                type: data.type,
                label: data.label,
                metadata: data.metadata,
                platform: data.platform,
                graceWindow: data.graceWindow,
                userId: data.userId || null,
                createdAt: data.createdAt
            };
        } catch (error) {
            console.error('Error getting pending action:', error.message);
            return memoryPendingActions.get(id);
        }
    },

    async removePendingAction(id) {
        if (!isFirebaseConnected()) {
            return memoryPendingActions.delete(id);
        }

        try {
            const db = getDB();
            await db.collection(PENDING_COLLECTION).doc(id).delete();
            return true;
        } catch (error) {
            console.error('Error removing pending action:', error.message);
            return memoryPendingActions.delete(id);
        }
    },

    async getAllPendingActions() {
        if (!isFirebaseConnected()) {
            return Array.from(memoryPendingActions.values());
        }

        try {
            const db = getDB();
            const snapshot = await db.collection(PENDING_COLLECTION)
                .orderBy('createdAt', 'desc')
                .get();

            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: data.actionId,
                    type: data.type,
                    label: data.label,
                    metadata: data.metadata,
                    platform: data.platform,
                    graceWindow: data.graceWindow,
                    userId: data.userId || null,
                    createdAt: data.createdAt
                };
            });
        } catch (error) {
            console.error('Error getting all pending actions:', error.message);
            return Array.from(memoryPendingActions.values());
        }
    },

    // ==========================================
    // ACTIVITY LOGS (per-user subcollections)
    // Path: users/{userId}/logs/{actionId}
    // ==========================================

    async addLog(logEntry) {
        const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false }) + ':' +
            String(Math.floor(Math.random() * 99)).padStart(2, '0');

        console.log(`💾 [DEBUG] Saving log: "${logEntry.label}" -> users/${logEntry.userId || 'anonymous'}/logs`);

        const entry = {
            ...logEntry,
            timestamp
        };

        if (!isFirebaseConnected()) {
            memoryActivityLogs.unshift(entry);
            if (memoryActivityLogs.length > 100) {
                memoryActivityLogs.pop();
            }
            return entry;
        }

        try {
            const db = getDB();
            const userId = logEntry.userId || 'anonymous';

            // Store in per-user subcollection: users/{userId}/logs/{actionId}
            await db.collection('users').doc(userId).collection('logs').doc(logEntry.id).set({
                actionId: logEntry.id,
                label: logEntry.label,
                platform: logEntry.platform,
                meta: logEntry.meta,
                status: logEntry.status,
                timestamp,
                createdAt: Date.now()
            });

            return { id: logEntry.id, ...entry };
        } catch (error) {
            console.error('Error saving log:', error.message);
            memoryActivityLogs.unshift(entry);
            return entry;
        }
    },

    async getAllLogs(userId = null) {
        if (!isFirebaseConnected()) {
            if (userId) return memoryActivityLogs.filter(l => l.userId === userId);
            return memoryActivityLogs;
        }

        try {
            const db = getDB();

            if (!userId) {
                // No userId, return empty (each user sees only their own)
                return [];
            }

            // Query from per-user subcollection: users/{userId}/logs
            const snapshot = await db.collection('users').doc(userId).collection('logs')
                .orderBy('createdAt', 'desc')
                .limit(100)
                .get();

            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: data.actionId,
                    label: data.label,
                    platform: data.platform,
                    meta: data.meta,
                    status: data.status,
                    timestamp: data.timestamp
                };
            });
        } catch (error) {
            console.error('Error getting logs:', error.message);
            return [];
        }
    },

    async clearLogs(userId = null) {
        if (!isFirebaseConnected()) {
            if (userId) {
                // Remove only this user's logs from memory
                for (let i = memoryActivityLogs.length - 1; i >= 0; i--) {
                    if (memoryActivityLogs[i].userId === userId) {
                        memoryActivityLogs.splice(i, 1);
                    }
                }
            } else {
                memoryActivityLogs.length = 0;
            }
            return;
        }

        try {
            const db = getDB();

            if (userId) {
                // Clear only this user's logs
                const snapshot = await db.collection('users').doc(userId).collection('logs').get();
                const batch = db.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
        } catch (error) {
            console.error('Error clearing logs:', error.message);
        }
    },

    // ==========================================
    // STATISTICS (per-user)
    // ==========================================

    async getStats(userId = null) {
        if (!isFirebaseConnected()) {
            const relevantLogs = userId ? memoryActivityLogs.filter(l => l.userId === userId) : memoryActivityLogs;
            const reversed = relevantLogs.filter(l => l.status === 'REVERSED').length;
            const committed = relevantLogs.filter(l => l.status === 'COMMITTED').length;

            return {
                totalActions: relevantLogs.length,
                mistakesPrevented: reversed,
                actionsCommitted: committed,
                pendingCount: memoryPendingActions.size
            };
        }

        try {
            const db = getDB();

            if (!userId) {
                return {
                    totalActions: 0,
                    mistakesPrevented: 0,
                    actionsCommitted: 0,
                    pendingCount: 0
                };
            }

            // Get stats from per-user subcollection
            const logsSnapshot = await db.collection('users').doc(userId).collection('logs').get();

            let reversed = 0;
            let committed = 0;

            logsSnapshot.docs.forEach(doc => {
                const status = doc.data().status;
                if (status === 'REVERSED') reversed++;
                if (status === 'COMMITTED') committed++;
            });

            // Count pending actions for this user
            const pendingSnapshot = await db.collection(PENDING_COLLECTION)
                .where('userId', '==', userId)
                .get();

            return {
                totalActions: logsSnapshot.size,
                mistakesPrevented: reversed,
                actionsCommitted: committed,
                pendingCount: pendingSnapshot.size
            };
        } catch (error) {
            console.error('Error getting stats:', error.message);
            return {
                totalActions: 0,
                mistakesPrevented: 0,
                actionsCommitted: 0,
                pendingCount: 0
            };
        }
    }
};

module.exports = { store };
