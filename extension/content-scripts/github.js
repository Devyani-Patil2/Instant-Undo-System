/**
 * INSTANT UNDO - GitHub Content Script
 * Intercepts dangerous actions on GitHub (delete, merge, close, revert, etc.)
 * 
 * Uses shared overlay UI from overlay.js
 */

(function () {
    'use strict';

    console.log('🛡️ INSTANT UNDO: GitHub interceptor loaded');

    let isIntercepting = false;

    // Dangerous text patterns
    const DANGEROUS_TEXT = [
        'force push', 'delete branch', 'delete this branch',
        'delete repository', 'delete', 'merge pull request',
        'confirm merge', 'revert', 'close pull request',
        'close issue', 'close with comment', 'merge',
        'squash and merge', 'rebase and merge', 'confirm'
    ];

    // ========================================
    // UTILITIES
    // ========================================
    function getRepoInfo() {
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        return {
            owner: pathParts[0] || 'unknown',
            repo: pathParts[1] || 'unknown',
            branch: document.querySelector('[data-ref]')?.getAttribute('data-ref') || 'main'
        };
    }

    function getAllAttributes(el) {
        if (!el || !el.getAttribute) return '';
        const attrs = [];
        for (const attr of el.attributes || []) {
            attrs.push(attr.name + '=' + attr.value);
        }
        return attrs.join(' ').toLowerCase();
    }

    function gatherElementContext(element) {
        const info = {
            tagName: element.tagName,
            text: (element.textContent || '').trim().substring(0, 100),
            ariaLabel: '',
            title: '',
            dataTooltip: '',
            className: '',
            allAttrs: '',
            parentInfo: ''
        };

        let el = element;
        for (let i = 0; i < 6 && el; i++) {
            const ariaLabel = el.getAttribute?.('aria-label') || '';
            const title = el.getAttribute?.('title') || '';
            const tooltip = el.getAttribute?.('data-tooltip') || '';
            const className = (el.className || '').toString();

            info.allAttrs += ' ' + getAllAttributes(el);

            if (ariaLabel) info.ariaLabel += ariaLabel + ' ';
            if (title) info.title += title + ' ';
            if (tooltip) info.dataTooltip += tooltip + ' ';
            if (className) info.className += className + ' ';

            el = el.parentElement;
        }

        return info;
    }

    // ========================================
    // DETECTION
    // ========================================

    function detectDangerousAction(clickTarget) {
        const ctx = gatherElementContext(clickTarget);
        const allText = (
            ctx.text + ' ' + ctx.ariaLabel + ' ' + ctx.title +
            ' ' + ctx.dataTooltip + ' ' + ctx.allAttrs
        ).toLowerCase();

        // DEBUG
        console.log('🔍 GitHub click:', {
            tag: ctx.tagName,
            text: ctx.text.substring(0, 50),
            ariaLabel: ctx.ariaLabel.trim(),
            title: ctx.title.trim(),
            allAttrs: allText.substring(0, 200)
        });

        // Check 1: aria-label or title contains "delete"
        if (ctx.ariaLabel.toLowerCase().includes('delete') ||
            ctx.title.toLowerCase().includes('delete') ||
            ctx.dataTooltip.toLowerCase().includes('delete')) {
            return 'DELETE BRANCH';
        }

        // Check 2: Danger-class buttons
        if (ctx.className.includes('btn-danger') ||
            ctx.className.includes('color-fg-danger') ||
            ctx.className.includes('color-danger') ||
            ctx.className.includes('Button--danger')) {
            return ctx.text || 'DANGEROUS ACTION';
        }

        // Check 3: data-testid with "delete"
        if (allText.includes('data-testid') && allText.includes('delete')) {
            return 'DELETE';
        }

        // Check 4: Text-based pattern matching on interactive elements
        const interactiveEl = clickTarget.closest(
            'button, [role="button"], summary, a.btn, input[type="submit"], [data-testid]'
        );

        if (interactiveEl) {
            const btnText = (interactiveEl.textContent || '').toLowerCase().trim();
            const btnAriaLabel = (interactiveEl.getAttribute('aria-label') || '').toLowerCase();
            const btnAll = btnText + ' ' + btnAriaLabel;

            for (const pattern of DANGEROUS_TEXT) {
                if (btnAll.includes(pattern)) {
                    return pattern.toUpperCase();
                }
            }
        }

        // Check 5: SVG octicon for trash/delete
        const svg = clickTarget.closest('svg') || clickTarget.querySelector('svg');
        if (svg) {
            const svgParent = svg.closest(
                'button, a, [role="button"], summary, [data-testid], td, li'
            );

            if (svgParent) {
                const parentLabel = (svgParent.getAttribute('aria-label') || '').toLowerCase();
                const parentTitle = (svgParent.getAttribute('title') || '').toLowerCase();
                const parentTooltip = (svgParent.getAttribute('data-tooltip') || '').toLowerCase();
                const parentTestId = (svgParent.getAttribute('data-testid') || '').toLowerCase();
                const parentAll = parentLabel + ' ' + parentTitle + ' ' + parentTooltip + ' ' + parentTestId;

                if (parentAll.includes('delete') || parentAll.includes('trash') || parentAll.includes('remove')) {
                    return 'DELETE BRANCH';
                }
            }

            const svgClass = (svg.getAttribute('class') || '').toLowerCase();
            if (svgClass.includes('trash') || svgClass.includes('delete') || svgClass.includes('octicon-trash')) {
                return 'DELETE';
            }
        }

        // Check 6: octicon-trash class
        const octiconTrash = clickTarget.closest('.octicon-trash, [data-testid*="delete"], [data-testid*="trash"]');
        if (octiconTrash) {
            return 'DELETE BRANCH';
        }

        // Check 7: Walk up parents
        let walker = clickTarget;
        for (let i = 0; i < 5 && walker; i++) {
            const cl = (walker.getAttribute?.('class') || '').toLowerCase();
            const dl = (walker.getAttribute?.('data-testid') || '').toLowerCase();

            if (cl.includes('octicon-trash') || dl.includes('delete') || dl.includes('trash')) {
                return 'DELETE BRANCH';
            }
            walker = walker.parentElement;
        }

        return false;
    }

    // ========================================
    // MAIN HANDLER (using shared overlay)
    // ========================================

    function handleClick(event) {
        if (isIntercepting) return;

        const target = event.target;
        const detectedAction = detectDangerousAction(target);

        if (detectedAction) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            console.log('🛡️ INTERCEPTED GitHub action:', detectedAction);
            isIntercepting = true;

            const repoInfo = getRepoInfo();
            const actionData = {
                action: typeof detectedAction === 'string' ? detectedAction : 'DANGEROUS ACTION',
                repo: `${repoInfo.owner}/${repoInfo.repo}`,
                branch: repoInfo.branch,
                url: window.location.href
            };

            const clickableEl = target.closest(
                'button, a, [role="button"], summary, [data-testid]'
            ) || target;

            window.ElvionOverlay.safeSendMessage({
                type: 'INTERCEPT_ACTION',
                actionType: 'github',
                label: actionData.action,
                metadata: actionData
            }, (response) => {
                const actionId = response?.action?.id || null;
                const graceWindow = response?.action?.graceWindow || 15;

                window.ElvionOverlay.create({
                    actionTitle: actionData.action,
                    metaLines: [
                        `REPOSITORY: ${actionData.repo}`,
                        `BRANCH: ${actionData.branch}`,
                        `ACTION: ${actionData.action}`
                    ],
                    actionId: actionId,
                    graceWindow: graceWindow,
                    isDestructive: actionData.action.toLowerCase().includes('delete'),
                    onUndo: () => {
                        isIntercepting = false;
                        window.ElvionOverlay.showToast('Action cancelled! Branch is safe.', 'success');
                    },
                    onCommit: () => {
                        isIntercepting = false;
                        document.removeEventListener('click', handleClick, true);
                        clickableEl.click();
                        setTimeout(() => document.addEventListener('click', handleClick, true), 1000);
                        window.ElvionOverlay.showToast('Action executed', 'info');
                    }
                });
            });
        }
    }

    // Initialize
    document.addEventListener('click', handleClick, true);

    console.log('✅ GitHub dangerous action interception active');
    console.log('   Watching: Delete branch, Delete repo, Merge PR, Close PR, Revert, Force push');
    console.log('   🔍 Debug mode: All clicks are being logged to console');
})();
