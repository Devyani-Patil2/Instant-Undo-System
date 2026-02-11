/**
 * INSTANT UNDO - Background Service Worker
 * Handles communication between content scripts and the server
 */

// Server configuration
const SERVER_URL = 'http://localhost:3000';
let socket = null;
let isConnected = false;

// Pending actions waiting for server connection
const pendingQueue = [];

// Initialize connection
function connectToServer() {
    console.log('🛡️ INSTANT UNDO Background Service Started');
    isConnected = true;

    // Ensure we have a userId, then fetch settings and process queue
    chrome.storage.local.get(['userId'], (data) => {
        if (chrome.runtime.lastError) {
            console.error('❌ Storage Error:', chrome.runtime.lastError?.message || chrome.runtime.lastError);
            return;
        }

        // Safety check: data might be undefined in edge cases
        let userId = (data && data.userId);

        if (!userId) {
            userId = 'user_' + Math.random().toString(36).substr(2, 9);
            chrome.storage.local.set({ userId });
            console.log('🆔 Generated new User ID:', userId);
        } else {
            console.log('🆔 User ID loaded:', userId);
        }

        // Fetch user-specific settings
        fetchGraceWindowFromServer(userId);

        // Process any pending actions
        while (pendingQueue.length > 0) {
            const action = pendingQueue.shift();
            sendActionToServer(action);
        }
    });
}

// Fetch grace window from server and store in chrome.storage
async function fetchGraceWindowFromServer(userId) {
    try {
        const response = await fetch(`${SERVER_URL}/api/settings?userId=${userId}`);
        if (response.ok) {
            const data = await response.json();
            if (data.graceWindow) {
                chrome.storage.local.set({ graceWindow: data.graceWindow });
                console.log('⏱️ Grace window synced from server:', data.graceWindow);
            }
        }
    } catch (e) {
        console.log('⏱️ Using default grace window (server unavailable)');
    }
}

// Send intercepted action to server
async function sendActionToServer(actionData) {
    if (!isConnected) {
        pendingQueue.push(actionData);
        connectToServer();
        return;
    }

    try {
        // Get current userId before sending
        const storage = await chrome.storage.local.get(['userId']);
        const userId = storage.userId || 'anonymous';

        const response = await fetch(`${SERVER_URL}/api/action`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ...actionData, userId })
        });

        const result = await response.json();
        console.log('⚡ Action sent to server:', result);

        // Store the action ID for reference
        if (result.success && result.action) {
            chrome.storage.local.get(['recentActions'], (data) => {
                const actions = data.recentActions || [];
                actions.unshift({
                    ...result.action,
                    timestamp: Date.now()
                });
                // Keep only last 10 actions
                chrome.storage.local.set({ recentActions: actions.slice(0, 10) });
            });
        }

        return result;
    } catch (error) {
        console.error('❌ Failed to send action to server:', error);
        // Queue for retry
        pendingQueue.push(actionData);
        return { success: false, error: error.message };
    }
}

// Reverse an action on the server (call undo API)
async function reverseActionOnServer(actionId) {
    try {
        const response = await fetch(`${SERVER_URL}/api/action/${actionId}/undo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        console.log('🔄 Action reversed on server:', result);

        // Update cached action status so popup shows correct state
        if (result.success) {
            updateCachedActionStatus(actionId, 'REVERSED');
        }

        return result;
    } catch (error) {
        console.error('❌ Failed to reverse action on server:', error);
        return { success: false, error: error.message };
    }
}

// Update the status of a cached action in chrome.storage.local
function updateCachedActionStatus(actionId, newStatus) {
    chrome.storage.local.get(['recentActions'], (data) => {
        const actions = data.recentActions || [];
        const updated = actions.map(a => {
            if (a.id === actionId) {
                return { ...a, status: newStatus };
            }
            return a;
        });
        chrome.storage.local.set({ recentActions: updated });
    });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Message received:', message);

    if (message.type === 'INTERCEPT_ACTION') {
        // Send action to server
        sendActionToServer({
            type: message.actionType,
            label: message.label,
            metadata: message.metadata,
            graceWindow: message.graceWindow || 15
        }).then(result => {
            sendResponse(result);
        });

        // Return true to indicate async response
        return true;
    }

    if (message.type === 'REVERSE_ACTION') {
        // User clicked undo — tell the server to reverse it
        const actionId = message.actionId;
        if (actionId) {
            reverseActionOnServer(actionId).then(result => {
                sendResponse(result);
            });
        } else {
            console.warn('⚠️ REVERSE_ACTION received without actionId');
            sendResponse({ success: false, error: 'No actionId' });
        }
        return true;
    }

    if (message.type === 'GET_STATUS') {
        sendResponse({
            connected: isConnected,
            serverUrl: SERVER_URL
        });
        return false;
    }

    if (message.type === 'GET_GRACE_WINDOW') {
        chrome.storage.local.get(['graceWindow'], (data) => {
            sendResponse({ graceWindow: data.graceWindow || 15 });
        });
        return true;
    }

    if (message.type === 'SET_GRACE_WINDOW') {
        const gw = message.graceWindow || 15;
        chrome.storage.local.set({ graceWindow: gw });
        console.log('⏱️ Grace window updated to:', gw);
        sendResponse({ success: true, graceWindow: gw });
        return false;
    }

    if (message.type === 'OPEN_DASHBOARD') {
        chrome.storage.local.get(['userId'], (data) => {
            let userId = data.userId;

            // Generate userId if not yet created (fresh install)
            if (!userId) {
                userId = 'user_' + Math.random().toString(36).substr(2, 9);
                chrome.storage.local.set({ userId });
                console.log('🆔 Generated new User ID on dashboard open:', userId);
            }

            chrome.tabs.create({ url: `${SERVER_URL}?userId=${userId}` });
            sendResponse({ success: true });
        });
        return true; // Keep channel open for async callback
    }
});

// Initialize connection on startup
connectToServer();

// Keep service worker alive with periodic check
setInterval(() => {
    console.log('🔄 Background service heartbeat');
}, 25000);
