/**
 * INSTANT UNDO - Shared Overlay UI
 * Unified grace window overlay used by ALL content scripts
 * matches the dashboard demo overlay exactly.
 * 
 * Usage:
 *   window.ElvionOverlay.create({
 *       actionTitle: 'EMAIL SENT',
 *       metaLines: ['TO: someone@email.com', 'SUBJECT: Hello'],
 *       onUndo: () => { ... },
 *       onCommit: () => { ... },
 *       actionId: 'ABC123',
 *       isDestructive: false   // true = RED theme, false = ORANGE theme
 *   });
 */

(function () {
    'use strict';

    if (window.ElvionOverlay) return;

    // =========================================================
    // OVERLAY CLICK PROTECTION
    // Register capture-phase handlers BEFORE any other content script.
    // This ensures overlay buttons remain clickable even when
    // forms.js or other scripts block page events.
    // =========================================================
    ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(eventType => {
        document.addEventListener(eventType, function (e) {
            const overlay = document.getElementById('elvion-intercept-overlay');
            if (overlay && overlay.contains(e.target)) {
                // Let the event reach the overlay buttons — do NOT stopPropagation.
                // Instead mark the event so forms.js blockAllEvents skips it.
                e._elvionOverlayEvent = true;
            }
        }, true);
    });

    // =========================================================
    // SAFE MESSAGE WRAPPER
    // =========================================================
    function safeSendMessage(data, callback) {
        try {
            if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage(data, (response) => {
                    if (callback) callback(response);
                });
            } else {
                console.warn('🛡️ INSTANT UNDO: Extension context invalid, refresh the page');
                if (callback) callback(null);
            }
        } catch (e) {
            console.warn('🛡️ INSTANT UNDO: Could not send message:', e.message);
            if (callback) callback(null);
        }
    }

    // =========================================================
    // CREATE OVERLAY
    // =========================================================
    function createOverlay(options) {
        const {
            actionTitle = 'ACTION INTERCEPTED',
            metaLines = [],
            onUndo = () => { },
            onCommit = () => { },
            actionId = null,
            graceWindow = 15,
            isDestructive = false
        } = options;

        // Remove any existing overlay
        const existing = document.getElementById('elvion-intercept-overlay');
        if (existing) existing.remove();

        // Color theme: RED for destructive, ORANGE for normal
        const accentColor = isDestructive ? '#ef4444' : '#f59e0b';
        const accentRGB = isDestructive ? '239, 68, 68' : '245, 158, 11';
        const btnTextColor = isDestructive ? 'white' : 'black';

        // Build metadata HTML
        const metaHTML = metaLines
            .map(line => `<div>${line}</div>`)
            .join('');

        const overlay = document.createElement('div');
        overlay.id = 'elvion-intercept-overlay';
        overlay.innerHTML = `
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap');

                #elvion-intercept-overlay,
                #elvion-intercept-overlay * {
                    font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif !important;
                    box-sizing: border-box;
                }

                #elvion-intercept-overlay {
                    position: fixed !important;
                    inset: 0 !important;
                    background: rgba(0, 0, 0, 0.90) !important;
                    backdrop-filter: blur(20px) !important;
                    -webkit-backdrop-filter: blur(20px) !important;
                    z-index: 999999 !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    animation: elvion-fadeIn 0.3s ease;
                }

                @keyframes elvion-fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                /* ---- Modal Card ---- */
                .elvion-modal {
                    background: rgba(15, 15, 15, 0.7) !important;
                    backdrop-filter: blur(12px) !important;
                    -webkit-backdrop-filter: blur(12px) !important;
                    border: 1px solid rgba(${accentRGB}, 0.3) !important;
                    border-radius: 12px !important;
                    max-width: 460px !important;
                    width: 90% !important;
                    text-align: center !important;
                    box-shadow: 0 0 100px rgba(${accentRGB}, 0.15) !important;
                    position: relative !important;
                    overflow: visible !important;
                    animation: elvion-slideUp 0.4s ease;
                }

                @keyframes elvion-slideUp {
                    from { transform: translateY(30px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }

                .elvion-modal-inner {
                    padding: 32px 32px 24px !important;
                    margin-top: 40px !important;
                }

                /* ---- Countdown Circle ---- */
                .elvion-countdown-wrap {
                    position: absolute !important;
                    top: -48px !important;
                    left: 50% !important;
                    transform: translateX(-50%) !important;
                    width: 96px !important;
                    height: 96px !important;
                    border-radius: 50% !important;
                    border: 1px solid rgba(${accentRGB}, 0.2) !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    background: #000 !important;
                }

                /* Spinning border ring */
                .elvion-countdown-ring {
                    position: absolute !important;
                    width: 80px !important;
                    height: 80px !important;
                    border: 2px solid rgba(${accentRGB}, 0.3) !important;
                    border-top-color: ${accentColor} !important;
                    border-radius: 50% !important;
                    animation: elvion-spin 1s linear infinite;
                }

                /* Static countdown number — NOT inside the spinning ring */
                .elvion-countdown-text {
                    position: absolute !important;
                    font-size: 24px !important;
                    font-weight: 900 !important;
                    font-style: italic !important;
                    color: ${accentColor} !important;
                    text-shadow: 0 0 10px rgba(${accentRGB}, 0.5) !important;
                    letter-spacing: -1px !important;
                    z-index: 2 !important;
                }

                @keyframes elvion-spin {
                    to { transform: rotate(360deg); }
                }

                /* ---- Bouncing Dots ---- */
                .elvion-dots {
                    display: flex !important;
                    justify-content: center !important;
                    gap: 4px !important;
                    margin-bottom: 20px !important;
                }
                .elvion-dot {
                    width: 8px !important;
                    height: 8px !important;
                    background: ${accentColor} !important;
                    border-radius: 50% !important;
                    animation: elvion-bounce 0.6s ease-in-out infinite;
                }
                .elvion-dot:nth-child(2) { animation-delay: 0.1s; }
                .elvion-dot:nth-child(3) { animation-delay: 0.2s; }

                @keyframes elvion-bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-6px); }
                }

                /* ---- Title & Action ---- */
                .elvion-title {
                    font-size: 10px !important;
                    font-weight: 900 !important;
                    letter-spacing: 0.4em !important;
                    color: ${accentColor} !important;
                    margin: 0 0 12px 0 !important;
                    text-transform: uppercase !important;
                }

                .elvion-action {
                    font-size: 28px !important;
                    font-weight: 900 !important;
                    font-style: italic !important;
                    color: white !important;
                    margin: 0 0 8px 0 !important;
                    text-transform: uppercase !important;
                    letter-spacing: -1px !important;
                }

                /* ---- Metadata Box ---- */
                .elvion-meta {
                    background: rgba(0, 0, 0, 0.4) !important;
                    border: 1px solid rgba(255, 255, 255, 0.05) !important;
                    border-radius: 8px !important;
                    padding: 16px !important;
                    margin: 24px 0 32px 0 !important;
                    font-size: 12px !important;
                    color: #94a3b8 !important;
                    text-align: center !important;
                    font-family: 'JetBrains Mono', monospace !important;
                    font-style: italic !important;
                    line-height: 1.8 !important;
                }

                /* ---- Buttons ---- */
                .elvion-btn-undo {
                    display: block !important;
                    width: 100% !important;
                    padding: 18px !important;
                    background: ${accentColor} !important;
                    border: none !important;
                    border-radius: 8px !important;
                    color: ${btnTextColor} !important;
                    font-weight: 900 !important;
                    font-size: 13px !important;
                    cursor: pointer !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.15em !important;
                    margin-bottom: 8px !important;
                    transition: transform 0.2s, box-shadow 0.2s;
                    box-shadow: 0 10px 20px rgba(${accentRGB}, 0.3) !important;
                    position: relative !important;
                    overflow: hidden !important;
                    pointer-events: auto !important;
                }
                .elvion-btn-undo:hover {
                    transform: scale(1.02);
                    box-shadow: 0 10px 30px rgba(${accentRGB}, 0.4) !important;
                }
                .elvion-btn-undo:active {
                    transform: scale(0.98);
                }

                .elvion-btn-commit {
                    display: block !important;
                    width: 100% !important;
                    background: none !important;
                    border: none !important;
                    color: #64748b !important;
                    font-size: 10px !important;
                    cursor: pointer !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.3em !important;
                    padding: 10px !important;
                    font-weight: 900 !important;
                    transition: color 0.2s;
                    pointer-events: auto !important;
                }
                .elvion-btn-commit:hover { color: white !important; }

                /* ---- Footer ---- */
                .elvion-footer {
                    padding: 14px 32px !important;
                    background: rgba(255, 255, 255, 0.03) !important;
                    border-top: 1px solid rgba(255, 255, 255, 0.05) !important;
                    border-radius: 0 0 12px 12px !important;
                    font-size: 9px !important;
                    font-weight: 900 !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.2em !important;
                    text-align: center !important;
                    color: ${accentColor} !important;
                }
            </style>

            <div class="elvion-modal">
                <div class="elvion-countdown-wrap">
                    <div class="elvion-countdown-ring"></div>
                    <span class="elvion-countdown-text" id="elvion-timer">${graceWindow}</span>
                </div>
                <div class="elvion-modal-inner">
                    <div class="elvion-dots">
                        <div class="elvion-dot"></div>
                        <div class="elvion-dot"></div>
                        <div class="elvion-dot"></div>
                    </div>
                    <p class="elvion-title">Interception Protocol</p>
                    <h2 class="elvion-action">${actionTitle}</h2>
                    <div class="elvion-meta">
                        ${metaHTML || 'Action details unavailable'}
                    </div>
                    <button class="elvion-btn-undo" id="elvion-undo">Prevent Mistake (Undo)</button>
                    <button class="elvion-btn-commit" id="elvion-commit">I am sure, continue execution</button>
                </div>
                <div class="elvion-footer">Action paused — review before it's too late</div>
            </div>
        `;

        document.body.appendChild(overlay);

        // ---- Timer ----
        let timeLeft = graceWindow;
        const timerElement = document.getElementById('elvion-timer');

        const countdown = setInterval(() => {
            timeLeft--;
            if (timerElement) timerElement.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(countdown);
                doCommit();
            }
        }, 1000);

        // ---- Undo ----
        const undoBtn = document.getElementById('elvion-undo');
        undoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            clearInterval(countdown);
            overlay.remove();

            if (actionId) {
                safeSendMessage({ type: 'REVERSE_ACTION', actionId: actionId });
                console.log('🔄 Sent REVERSE_ACTION for:', actionId);
            }

            onUndo();
            showToast('INTERCEPTION SUCCESSFUL', 'success');
        });

        // ---- Commit ----
        const commitBtn = document.getElementById('elvion-commit');
        commitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            clearInterval(countdown);
            doCommit();
        });

        function doCommit() {
            overlay.remove();
            onCommit();
            // Pass true if destructive, false if safe. This determines the toast color.
            showToast(actionTitle + ' COMMITTED', isDestructive);
        }

        return overlay;
    }

    // =========================================================
    // TOAST NOTIFICATION — CYBERPUNK STYLE
    // =========================================================
    // type: 'success' | true (destructive) | false (safe)
    function showToast(message, type = 'success') {
        const existing = document.getElementById('elvion-toast');
        if (existing) existing.remove();

        // Logic:
        // type === 'success' -> Interception (GREEN)
        // type === true      -> Destructive Action Executed (RED)
        // type === false     -> Safe Action Executed (GREEN)

        let isGreen, accentColor, glowColor, title, subtitle;

        if (type === 'success') {
            isGreen = true;
            title = 'INTERCEPTION SUCCESSFUL';
            subtitle = 'Action reversed. No data was changed.'; // Fixed subtitle for success
        } else if (type === true) {
            // Destructive Action
            isGreen = false;
            title = 'ACTION EXECUTED';
            subtitle = message || 'Process has been committed permanently.';
        } else {
            // Safe Action (type === false or 'info' or undefined)
            isGreen = true;
            title = 'ACTION EXECUTED';
            subtitle = message || 'Process has been committed.';
        }

        // Green: #10b981, Red: #f43f5e
        accentColor = isGreen ? '#10b981' : '#f43f5e';
        glowColor = isGreen ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)';

        // Icon is always a checkmark in the design
        const checkIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

        const toast = document.createElement('div');
        toast.id = 'elvion-toast';
        toast.innerHTML = `
            <style>
                #elvion-toast {
                    position: fixed !important;
                    bottom: 24px !important;
                    right: 24px !important;
                    background: #09090b !important; /* Zinc 950 */
                    border: 1px solid rgba(255, 255, 255, 0.08) !important;
                    border-radius: 12px !important;
                    padding: 16px 20px !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 16px !important;
                    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.9) !important;
                    z-index: 2147483647 !important;
                    font-family: 'Space Grotesk', system-ui, sans-serif !important;
                    animation: elvion-slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
                    min-width: 320px !important;
                    max-width: 450px !important;
                    pointer-events: none !important;
                }
                
                @keyframes elvion-slideIn {
                    from { transform: translateX(40px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }

                @keyframes elvion-slideOut {
                    to { transform: translateX(40px); opacity: 0; }
                }

                .elvion-toast-icon-box {
                    position: relative !important;
                    width: 44px !important;
                    height: 44px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    flex-shrink: 0 !important;
                }

                .elvion-toast-icon-bg {
                    position: absolute !important;
                    inset: 0 !important;
                    background: ${accentColor} !important;
                    border-radius: 10px !important;
                    box-shadow: 0 0 25px ${glowColor} !important;
                }

                .elvion-toast-icon-svg {
                    position: relative !important;
                    z-index: 2 !important;
                    line-height: 0 !important;
                }

                .elvion-toast-content {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 5px !important;
                }

                .elvion-toast-title {
                    font-size: 13px !important;
                    font-weight: 800 !important;
                    font-style: italic !important;
                    color: white !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.05em !important;
                    line-height: 1.1 !important;
                    text-shadow: 0 2px 4px rgba(0,0,0,0.5) !important;
                }

                .elvion-toast-message {
                    font-family: 'Courier New', monospace !important;
                    font-size: 11px !important;
                    color: #94a3b8 !important; /* Slate 400 */
                    font-weight: 600 !important;
                    letter-spacing: -0.02em !important;
                    opacity: 0.8 !important;
                }
            </style>
            
            <div class="elvion-toast-icon-box">
                <div class="elvion-toast-icon-bg"></div>
                <div class="elvion-toast-icon-svg">${checkIcon}</div>
            </div>
            <div class="elvion-toast-content">
                <div class="elvion-toast-title">${title}</div>
                <div class="elvion-toast-message">${subtitle}</div>
            </div>
        `;

        document.body.appendChild(toast);

        // Remove after 4 seconds
        setTimeout(() => {
            const t = document.getElementById('elvion-toast');
            if (t) {
                t.style.animation = 'elvion-slideOut 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
                setTimeout(() => t.remove(), 400);
            }
        }, 4000);
    }

    // =========================================================
    // EXPORT
    // =========================================================
    window.ElvionOverlay = {
        create: createOverlay,
        showToast: showToast,
        safeSendMessage: safeSendMessage
    };

    console.log('🛡️ INSTANT UNDO: Shared overlay UI loaded');
})();
