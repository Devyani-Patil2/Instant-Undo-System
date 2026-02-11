/**
 * INSTANT UNDO - Gmail Content Script
 * Intercepts email send AND delete actions in Gmail
 * 
 * Uses shared overlay UI from overlay.js
 * IMPORTANT: Only intercepts ACTUAL delete actions on emails, 
 * NOT navigation to folders like Trash, Spam, etc.
 */

(function () {
    'use strict';

    console.log('🛡️ INSTANT UNDO: Gmail interceptor loaded');

    let isIntercepting = false;
    let currentActionType = 'send'; // 'send' or 'delete'

    // ==========================================
    // EMAIL DATA EXTRACTION
    // ==========================================

    function extractEmailData() {
        const toField = document.querySelector('input[name="to"], [aria-label*="To"]');
        const subjectField = document.querySelector('input[name="subjectbox"], input[aria-label*="Subject"]');

        return {
            to: toField?.value || 'Unknown recipient',
            subject: subjectField?.value || 'No subject'
        };
    }

    function extractSelectedEmailData(clickedElement) {
        const row = clickedElement.closest('tr') || clickedElement.closest('[role="row"]') || clickedElement.closest('.zA');

        if (row) {
            const senderEl = row.querySelector('.yX span[email], .yP, .zF, [email]');
            const sender = senderEl?.getAttribute('email') || senderEl?.textContent || 'Unknown sender';

            const subjectEl = row.querySelector('.bog, .y2, [data-legacy-thread-id] span');
            const subject = subjectEl?.textContent || 'Selected email';

            return { from: sender, subject: subject };
        }

        return { from: 'Unknown sender', subject: 'Selected email' };
    }

    // ==========================================
    // SMART DETECTION: Navigation vs Delete
    // ==========================================

    function isInSidebar(element) {
        if (element.closest('[role="navigation"]')) return true;
        if (element.closest('.wT')) return true;
        if (element.closest('.aim')) return true;
        if (element.closest('.TO')) return true;
        if (element.closest('.aj9')) return true;
        if (element.closest('.nU')) return true;

        const link = element.closest('a[href]');
        if (link) {
            const href = link.getAttribute('href') || '';
            if (href.includes('#trash') || href.includes('#spam') ||
                href.includes('#inbox') || href.includes('#sent') ||
                href.includes('#drafts') || href.includes('#starred') ||
                href.includes('#label') || href.includes('#all') ||
                href.includes('#snoozed') || href.includes('#scheduled') ||
                href.includes('#imp') || href.includes('#chats')) {
                return true;
            }
        }

        return false;
    }

    function isDeleteAction(element) {
        if (!element) return false;

        if (isInSidebar(element)) {
            console.log('🛡️ INSTANT UNDO: Sidebar click ignored');
            return false;
        }

        const button = element.closest(
            '[role="button"][aria-label], [data-tooltip], button[aria-label], [act]'
        );
        if (!button) return false;

        const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
        const dataTooltip = (button.getAttribute('data-tooltip') || '').toLowerCase();
        const act = button.getAttribute('act') || '';

        const deletePatterns = ['delete', 'trash', 'remove', 'discard'];
        const isDelete = deletePatterns.some(
            pattern => ariaLabel.includes(pattern) || dataTooltip.includes(pattern)
        );

        const deleteActs = ['10', '7'];
        const isDeleteAct = deleteActs.includes(act);

        return isDelete || isDeleteAct;
    }

    function isSendButton(element) {
        const button = element.closest('[role="button"][aria-label], [data-tooltip], button[aria-label]');
        if (!button) return false;

        const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
        const dataTooltip = (button.getAttribute('data-tooltip') || '').toLowerCase();

        return ariaLabel.includes('send') || dataTooltip.includes('send');
    }

    // ==========================================
    // MAIN CLICK HANDLER
    // ==========================================

    function handleClick(event) {
        if (isIntercepting) return;

        const target = event.target;

        // Check for SEND button
        if (isSendButton(target)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            handleSendAction(target.closest('[aria-label*="Send"], [data-tooltip*="Send"]'));
            return;
        }

        // Check for DELETE action (NOT sidebar navigation)
        if (isDeleteAction(target)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            handleDeleteAction(target, event);
            return;
        }
    }

    // ==========================================
    // ACTION HANDLERS (using shared overlay)
    // ==========================================

    function handleSendAction(sendButton) {
        isIntercepting = true;
        currentActionType = 'send';

        const emailData = extractEmailData();

        window.ElvionOverlay.safeSendMessage({
            type: 'INTERCEPT_ACTION',
            actionType: 'email',
            label: 'Email Sent',
            metadata: emailData
        }, (response) => {
            const actionId = response?.action?.id || null;
            const graceWindow = response?.action?.graceWindow || 15;

            window.ElvionOverlay.create({
                actionTitle: 'EMAIL SENT',
                metaLines: [
                    `TO: ${emailData.to}`,
                    `SUBJECT: ${emailData.subject}`
                ],
                actionId: actionId,
                graceWindow: graceWindow,
                onUndo: () => {
                    isIntercepting = false;
                    console.log('🚫 Email sending cancelled by user');
                    window.ElvionOverlay.showToast('Email sending prevented!', 'success');
                },
                onCommit: () => {
                    isIntercepting = false;
                    document.removeEventListener('click', handleClick, true);
                    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                    sendButton.dispatchEvent(clickEvent);
                    setTimeout(() => document.addEventListener('click', handleClick, true), 1000);
                    window.ElvionOverlay.showToast('Email sent', 'info');
                }
            });
        });
    }

    function handleDeleteAction(deleteButton, originalEvent) {
        isIntercepting = true;
        currentActionType = 'delete';

        const actionButton = deleteButton.closest(
            '[role="button"][aria-label], [data-tooltip], button[aria-label]'
        ) || deleteButton;

        const emailData = extractSelectedEmailData(actionButton);

        window.ElvionOverlay.safeSendMessage({
            type: 'INTERCEPT_ACTION',
            actionType: 'email',
            label: 'Email Deleted',
            metadata: emailData
        }, (response) => {
            const actionId = response?.action?.id || null;
            const graceWindow = response?.action?.graceWindow || 15;

            window.ElvionOverlay.create({
                actionTitle: 'EMAIL DELETE',
                metaLines: [
                    `FROM: ${emailData.from || 'Unknown'}`,
                    `SUBJECT: ${emailData.subject || 'Selected email'}`
                ],
                actionId: actionId,
                graceWindow: graceWindow,
                isDestructive: true,
                onUndo: () => {
                    isIntercepting = false;
                    console.log('🚫 Email delete cancelled by user');
                    window.ElvionOverlay.showToast('Email delete prevented!', 'success');
                },
                onCommit: () => {
                    isIntercepting = false;
                    document.removeEventListener('click', handleClick, true);
                    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                    actionButton.dispatchEvent(clickEvent);
                    setTimeout(() => document.addEventListener('click', handleClick, true), 1000);
                    window.ElvionOverlay.showToast('Email deleted', 'info');
                }
            });
        });
    }

    // ==========================================
    // INITIALIZE
    // ==========================================

    document.addEventListener('click', handleClick, true);

    console.log('✅ Gmail interception active: Send ✓ | Delete ✓ | Sidebar nav excluded ✓');
})();
