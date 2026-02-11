/**
 * INSTANT UNDO - Backend Server
 * Elvion Guard Engine v2.0
 * 
 * Main server with Express REST API, Socket.io, and Firebase Firestore
 */

const express = require('express');

const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const { initializeFirebase } = require('./db');
const { store } = require('./store');
const adapters = require('./adapters');

// Initialize Express
const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (frontend)
app.use(express.static(path.join(__dirname, '..')));

// Active timers for pending actions
const actionTimers = new Map();

// ============================================
// REST API ENDPOINTS
// ============================================

/**
 * POST /api/action - Create a new intercepted action
 */
app.post('/api/action', async (req, res) => {
    const { type, label, metadata, graceWindow = 15, userId } = req.body;

    // Use user's saved setting from dashboard (takes priority)
    const userSetting = userId ? userSettings.get(userId) : null;
    const effectiveGraceWindow = userSetting ? userSetting.graceWindow : graceWindow;

    const action = {
        id: uuidv4().substring(0, 8).toUpperCase(),
        type: type || 'unknown',
        label: label || 'Unknown Action',
        metadata: metadata || {},
        platform: adapters.getAdapterName(type),
        graceWindow: Math.min(Math.max(effectiveGraceWindow, 5), 30),
        userId: userId || null,
        createdAt: Date.now()
    };

    console.log(`📝 [DEBUG] Received action from userId: "${userId}" (grace: ${effectiveGraceWindow}s)`);

    await store.addPendingAction(action);

    // Start countdown timer
    const timer = setTimeout(() => {
        commitAction(action.id, true);
    }, action.graceWindow * 1000);

    actionTimers.set(action.id, timer);

    // Broadcast to relevant user
    broadcastToUser(action.userId, 'action:intercepted', action);

    console.log(`⚡ [INTERCEPTED] ${action.label} (${action.platform}) - ${action.graceWindow}s grace window`);

    res.json({ success: true, action });
});

/**
 * POST /api/action/:id/undo - Undo/Cancel an action
 */
app.post('/api/action/:id/undo', async (req, res) => {
    const { id } = req.params;
    const action = await store.getPendingAction(id);

    if (!action) {
        return res.status(404).json({ success: false, error: 'Action not found or already processed' });
    }

    // Clear the auto-commit timer
    if (actionTimers.has(id)) {
        clearTimeout(actionTimers.get(id));
        actionTimers.delete(id);
    }

    // Cancel through adapter
    await adapters.cancelAction(action);

    // Log the reversal
    const logEntry = await store.addLog({
        id: action.id,
        label: action.label,
        platform: action.platform,
        meta: JSON.stringify(action.metadata),
        status: 'REVERSED',
        userId: action.userId || null
    });

    await store.removePendingAction(id);

    // Broadcast resolution
    broadcastToUser(action.userId, 'action:resolved', { id, status: 'REVERSED', log: logEntry });

    console.log(`🔄 [REVERSED] ${action.label} - Action undone successfully`);

    res.json({ success: true, status: 'REVERSED', log: logEntry });
});

/**
 * POST /api/action/:id/commit - Commit/Execute an action
 */
app.post('/api/action/:id/commit', async (req, res) => {
    const result = await commitAction(req.params.id, false);

    if (!result.success) {
        return res.status(404).json(result);
    }

    res.json(result);
});

// ============================================
// SETTINGS API
// ============================================

// In-memory settings (persisted across requests while server running)
// Map<userId, { graceWindow: number }>
const userSettings = new Map();
const DEFAULT_SETTINGS = { graceWindow: 15 };

/**
 * GET /api/settings - Get current settings for user
 */
app.get('/api/settings', (req, res) => {
    const userId = req.query.userId;
    const settings = (userId && userSettings.get(userId)) || DEFAULT_SETTINGS;
    res.json(settings);
});

/**
 * POST /api/settings - Update settings for user
 */
app.post('/api/settings', (req, res) => {
    const { graceWindow, userId } = req.body;

    if (userId && graceWindow !== undefined) {
        const current = userSettings.get(userId) || { ...DEFAULT_SETTINGS };
        current.graceWindow = Math.min(Math.max(parseInt(graceWindow) || 15, 5), 30);
        userSettings.set(userId, current);

        console.log(`⏱️ Settings updated for user ${userId}: graceWindow = ${current.graceWindow}s`);
        res.json({ success: true, ...current });
    } else {
        // Fallback or error if no userId
        console.log('⚠️ Settings update attempt without userId');
        res.status(400).json({ success: false, error: 'UserId required' });
    }
});

/**
 * Helper function to commit an action
 */
async function commitAction(id, isAutoCommit = false) {
    const action = await store.getPendingAction(id);

    if (!action) {
        return { success: false, error: 'Action not found or already processed' };
    }

    // Clear any existing timer
    if (actionTimers.has(id)) {
        clearTimeout(actionTimers.get(id));
        actionTimers.delete(id);
    }

    // Execute through adapter
    await adapters.executeAction(action);

    // Log the commit
    const logEntry = await store.addLog({
        id: action.id,
        label: action.label,
        platform: action.platform,
        meta: JSON.stringify(action.metadata),
        status: 'COMMITTED',
        userId: action.userId || null
    });

    await store.removePendingAction(id);

    // Broadcast resolution
    broadcastToUser(action.userId, 'action:resolved', { id, status: 'COMMITTED', log: logEntry, auto: isAutoCommit });

    console.log(`✅ [COMMITTED] ${action.label} - Action executed${isAutoCommit ? ' (auto)' : ''}`);

    return { success: true, status: 'COMMITTED', log: logEntry };
}

/**
 * GET /api/logs - Get activity logs (optionally filtered by userId)
 */
app.get('/api/logs', async (req, res) => {
    const userId = req.query.userId;
    const logs = await store.getAllLogs(userId);
    res.json({ success: true, logs });
});

/**
 * GET /api/stats - Get statistics (optionally filtered by userId)
 */
app.get('/api/stats', async (req, res) => {
    const userId = req.query.userId;
    const stats = await store.getStats(userId);
    res.json({ success: true, stats });
});

/**
 * DELETE /api/logs - Clear all logs
 */
app.delete('/api/logs', async (req, res) => {
    await store.clearLogs();
    io.emit('logs:cleared');
    res.json({ success: true, message: 'Logs cleared' });
});



/**
 * GET /api/pending - Get all pending actions
 */
app.get('/api/pending', async (req, res) => {
    const actions = await store.getAllPendingActions();
    res.json({ success: true, actions });
});

// ============================================
// SOCKET.IO EVENT HANDLERS
// ============================================

io.on('connection', async (socket) => {
    const userId = socket.handshake.query.userId;
    console.log(`🔌 Client connected: ${socket.id} (User: ${userId || 'Anonymous'})`);

    // Join room for this user
    if (userId) {
        socket.join(`user:${userId}`);
    }

    // Send current state to newly connected client (filtered by userId)
    // Note: Pending actions might need filtering strategy update if not storing userId yet
    // For now assuming pending actions are relevant to user
    const [pending, logs, stats] = await Promise.all([
        store.getAllPendingActions(), // TODO: Filter pending by userId if needed
        store.getAllLogs(userId),
        store.getStats(userId)
    ]);

    // Filter pending actions manually if store doesn't support it yet
    const userPending = userId ? pending.filter(p => p.userId === userId) : pending;

    socket.emit('init', { pending: userPending, logs, stats });

    // Handle action interception from extension
    socket.on('intercept', async (data) => {
        const { type, label, metadata, graceWindow } = data;

        const action = {
            id: uuidv4().substring(0, 8).toUpperCase(),
            type: type || 'unknown',
            label: label || 'Unknown Action',
            metadata: metadata || {},
            platform: adapters.getAdapterName(type),
            graceWindow: Math.min(Math.max(graceWindow || 15, 5), 30),
            createdAt: Date.now()
        };

        await store.addPendingAction(action);

        // Start countdown timer
        const timer = setTimeout(() => {
            commitAction(action.id, true);
        }, action.graceWindow * 1000);

        actionTimers.set(action.id, timer);

        // Broadcast to relevant user only
        broadcastToUser(action.userId, 'action:intercepted', action);

        console.log(`⚡ [INTERCEPTED via WS] ${action.label} (${action.platform})`);
    });

    // Handle undo request from dashboard
    socket.on('undo', async (id) => {
        const action = await store.getPendingAction(id);
        if (!action) return;

        if (actionTimers.has(id)) {
            clearTimeout(actionTimers.get(id));
            actionTimers.delete(id);
        }

        await adapters.cancelAction(action);

        const logEntry = await store.addLog({
            id: action.id,
            label: action.label,
            platform: action.platform,
            meta: JSON.stringify(action.metadata),
            status: 'REVERSED',
            userId: action.userId || null
        });

        await store.removePendingAction(id);
        broadcastToUser(action.userId, 'action:resolved', { id, status: 'REVERSED', log: logEntry });

        console.log(`🔄 [REVERSED via WS] ${action.label}`);
    });

    // Handle commit request from dashboard
    socket.on('commit', async (id) => {
        await commitAction(id, false);
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// Broadcast event to a specific user's room, or globally if no userId
function broadcastToUser(userId, event, data) {
    if (userId) {
        io.to(`user:${userId}`).emit(event, data);
    } else {
        io.emit(event, data);
    }
}

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

async function startServer() {
    let dbConnected = false;

    // Try to load Firebase service account
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

    if (fs.existsSync(serviceAccountPath)) {
        try {
            const serviceAccount = require(serviceAccountPath);
            dbConnected = initializeFirebase(serviceAccount);
        } catch (error) {
            console.error('❌ Failed to load Firebase service account:', error.message);
        }
    } else {
        console.log('⚠️  Firebase service account not found: serviceAccountKey.json');
        console.log('   Using in-memory storage (data will not persist)');
        console.log('   To enable Firebase, add your serviceAccountKey.json to the server folder');
    }

    server.listen(PORT, () => {
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('   ⚡ INSTANT UNDO - Elvion Guard Engine v2.0');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`   🌐 Server running at: http://localhost:${PORT}`);
        console.log(`   📡 WebSocket ready for connections`);
        console.log(`   📦 Database: ${dbConnected ? 'Firebase Firestore' : 'In-Memory (fallback)'}`);
        console.log(`   🛡️  Protection Status: ACTIVE`);
        console.log('═══════════════════════════════════════════════════════════');
        console.log('');
    });
}

startServer();
