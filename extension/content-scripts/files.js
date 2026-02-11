/**
 * INSTANT UNDO - File Operations Content Script
 * Intercepts file deletion on cloud storage sites (Google Drive, Dropbox)
 * 
 * Uses shared overlay UI from overlay.js
 */

(function () {
    'use strict';

    console.log('🛡️ INSTANT UNDO: File operations interceptor loaded');

    let isIntercepting = false;

    // Delete action patterns
    const DELETE_PATTERNS = [
        'delete', 'remove', 'trash',
        'permanently delete', 'move to trash', 'delete forever'
    ];

    // ==========================================
    // DETECTION
    // ==========================================

    function isDeleteAction(element) {
        const text = (element.textContent || '').toLowerCase();
        const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
        const title = (element.getAttribute('title') || '').toLowerCase();

        for (const pattern of DELETE_PATTERNS) {
            if (text.includes(pattern) || ariaLabel.includes(pattern) || title.includes(pattern)) {
                return pattern;
            }
        }

        return false;
    }

    function getFileInfo() {
        const selectedFiles = document.querySelectorAll('[data-is-doc-name], [aria-selected="true"], .a-n-N');
        let fileName = 'Selected file(s)';

        if (selectedFiles.length > 0) {
            const names = Array.from(selectedFiles).map(el => el.textContent?.trim()).filter(Boolean);
            if (names.length > 0) {
                fileName = names.join(', ');
            }
        }

        return {
            fileName: fileName.substring(0, 50) + (fileName.length > 50 ? '...' : ''),
            location: window.location.hostname,
            action: 'Delete'
        };
    }

    // ==========================================
    // CLICK HANDLER (using shared overlay)
    // ==========================================

    function handleClick(event) {
        if (isIntercepting) return;

        const target = event.target;
        const clickable = target.closest('button, [role="button"], [role="menuitem"], .btn, [data-action]');

        if (!clickable) return;

        const deleteAction = isDeleteAction(clickable);

        if (deleteAction) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            isIntercepting = true;

            const fileData = getFileInfo();
            fileData.action = deleteAction;

            window.ElvionOverlay.safeSendMessage({
                type: 'INTERCEPT_ACTION',
                actionType: 'file',
                label: 'File Deletion',
                metadata: fileData
            }, (response) => {
                const actionId = response?.action?.id || null;
                const graceWindow = response?.action?.graceWindow || 15;

                window.ElvionOverlay.create({
                    actionTitle: 'FILE DELETE',
                    metaLines: [
                        `FILE: ${fileData.fileName}`,
                        `LOCATION: ${fileData.location}`
                    ],
                    actionId: actionId,
                    graceWindow: graceWindow,
                    isDestructive: true,
                    onUndo: () => {
                        isIntercepting = false;
                        window.ElvionOverlay.showToast('File preserved! Delete cancelled.', 'success');
                    },
                    onCommit: () => {
                        isIntercepting = false;
                        document.removeEventListener('click', handleClick, true);
                        clickable.click();
                        setTimeout(() => document.addEventListener('click', handleClick, true), 1000);
                        window.ElvionOverlay.showToast('File deleted', 'info');
                    }
                });
            });
        }
    }

    // Initialize
    document.addEventListener('click', handleClick, true);

    console.log('✅ File deletion interception active');
})();
