/**
 * INSTANT UNDO - Popup Script
 * Handles popup UI interactions and data display
 * Fetches real-time stats and logs from server filtered by userId
 */

const SERVER_URL = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', () => {
    // Load real-time data from server
    loadStats();
    loadRecentLogs();

    // Check connection status
    checkStatus();

    // Open dashboard button
    document.getElementById('openDashboard').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
        window.close();
    });
});

// Fetch real-time stats from server (filtered by userId)
async function loadStats() {
    const preventedCount = document.getElementById('preventedCount');
    const totalCount = document.getElementById('totalCount');

    try {
        const storage = await chrome.storage.local.get(['userId']);
        const userId = storage.userId || '';

        const response = await fetch(`${SERVER_URL}/api/stats?userId=${encodeURIComponent(userId)}`);
        const data = await response.json();

        if (data.success && data.stats) {
            preventedCount.textContent = data.stats.mistakesPrevented || 0;
            totalCount.textContent = data.stats.totalActions || 0;
        }
    } catch (error) {
        console.error('Failed to fetch stats:', error);
        // Fallback: show 0
        preventedCount.textContent = '0';
        totalCount.textContent = '0';
    }
}

// Fetch recent logs from server (shows actual REVERSED/COMMITTED status)
async function loadRecentLogs() {
    const listElement = document.getElementById('recentList');

    try {
        const storage = await chrome.storage.local.get(['userId']);
        const userId = storage.userId || '';

        const response = await fetch(`${SERVER_URL}/api/logs?userId=${encodeURIComponent(userId)}`);
        const data = await response.json();

        if (data.success && data.logs && data.logs.length > 0) {
            const logs = data.logs.slice(0, 5); // Show last 5

            listElement.innerHTML = logs.map(log => `
                <div class="recent-item">
                    <div>
                        <div class="recent-label">${log.label || 'Unknown Action'}</div>
                        <div class="recent-platform">${log.platform || 'Unknown'}</div>
                    </div>
                    <span class="recent-status ${(log.status || 'pending').toLowerCase()}">${log.status || 'Pending'}</span>
                </div>
            `).join('');
        } else {
            // Fallback to local storage if server has no logs
            loadLocalRecentActions();
        }
    } catch (error) {
        console.error('Failed to fetch logs from server:', error);
        // Fallback to local storage
        loadLocalRecentActions();
    }
}

// Fallback: load from chrome.storage.local
function loadLocalRecentActions() {
    chrome.storage.local.get(['recentActions'], (data) => {
        const actions = data.recentActions || [];
        const listElement = document.getElementById('recentList');

        if (actions.length === 0) {
            listElement.innerHTML = '<div class="empty-state">No recent interceptions</div>';
            return;
        }

        listElement.innerHTML = actions.slice(0, 5).map(action => `
            <div class="recent-item">
                <div>
                    <div class="recent-label">${action.label || 'Unknown Action'}</div>
                    <div class="recent-platform">${action.platform || action.type || 'Unknown'}</div>
                </div>
                <span class="recent-status ${(action.status || 'pending').toLowerCase()}">${action.status || 'Pending'}</span>
            </div>
        `).join('');
    });
}

function checkStatus() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
        const statusText = document.getElementById('statusText');
        if (response && response.connected) {
            statusText.textContent = 'Protection Active';
        } else {
            statusText.textContent = 'Connecting...';
        }
    });
}

// Listen for local storage updates (refresh when new actions are cached)
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.recentActions) {
        loadStats();
        loadRecentLogs();
    }
});
