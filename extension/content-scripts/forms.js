/**
 * INSTANT UNDO - Universal Form Submission Content Script
 * Intercepts ALL form submissions on ANY website in Chrome
 * 
 * Uses shared overlay UI from overlay.js
 * 
 * Works on: Google Forms, Typeform, JotForm, Microsoft Forms,
 *           custom forms, and ANY website with submit/send buttons
 * 
 * Skips: Gmail, GitHub, Drive, Dropbox (have their own scripts)
 */

(function () {
    'use strict';

    console.log('🛡️ INSTANT UNDO: Universal form interceptor loaded');

    let isIntercepting = false;

    // Skip these domains (handled by their own specific scripts)
    const SKIP_DOMAINS = [
        'mail.google.com',
        'github.com',
        'drive.google.com',
        'dropbox.com'
    ];

    // Submit-related keywords
    const SUBMIT_KEYWORDS = [
        'submit', 'send', 'confirm', 'place order', 'pay now',
        'checkout', 'complete', 'finish', 'register', 'sign up',
        'subscribe', 'apply', 'book now', 'reserve', 'enroll',
        'post', 'publish', 'save', 'update profile',
        'जमा करें', 'सबमिट', 'भेजें',
        'enviar', 'soumettre', 'envoyer', 'senden', 'absenden'
    ];

    // Destructive keywords
    const DESTRUCTIVE_KEYWORDS = [
        'delete', 'remove', 'cancel', 'unsubscribe',
        'terminate', 'close account', 'deactivate',
        'revoke', 'reset', 'clear all'
    ];

    function shouldSkip() {
        return SKIP_DOMAINS.some(domain => window.location.hostname.includes(domain));
    }

    // ==========================================
    // DETECTION
    // ==========================================

    function isSubmitButton(element) {
        if (!element) return false;

        const btn = element.closest(
            'button, [role="button"], input[type="submit"], input[type="button"], a.btn, [type="submit"]'
        );
        if (!btn) return false;

        const text = (btn.textContent || '').toLowerCase().trim();
        const value = (btn.value || '').toLowerCase().trim();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const type = (btn.getAttribute('type') || '').toLowerCase();
        const allText = text + ' ' + value + ' ' + ariaLabel;

        if (type === 'submit') return true;

        for (const keyword of SUBMIT_KEYWORDS) {
            if (allText.includes(keyword)) return true;
        }

        return false;
    }

    function isDestructiveButton(element) {
        if (!element) return false;

        const btn = element.closest(
            'button, [role="button"], input[type="submit"], input[type="button"]'
        );
        if (!btn) return false;

        const text = (btn.textContent || '').toLowerCase().trim();
        const value = (btn.value || '').toLowerCase().trim();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const allText = text + ' ' + value + ' ' + ariaLabel;

        for (const keyword of DESTRUCTIVE_KEYWORDS) {
            if (allText.includes(keyword)) return true;
        }

        return false;
    }

    function getFormTitle() {
        const heading = document.querySelector('h1, h2, [role="heading"]');
        const title = document.title || '';
        return heading?.textContent?.trim()?.substring(0, 50) || title.substring(0, 50) || 'Web Form';
    }

    // ==========================================
    // BLOCK ALL EVENTS during interception
    // ==========================================

    function blockAllEvents(event) {
        if (!isIntercepting) return;

        // Allow clicks on the overlay itself (marked by overlay.js)
        if (event._elvionOverlayEvent) return;

        const overlayEl = document.getElementById('elvion-intercept-overlay');
        if (overlayEl && overlayEl.contains(event.target)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }

    function startBlocking() {
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'submit'].forEach(evt => {
            document.addEventListener(evt, blockAllEvents, true);
        });
    }

    function stopBlocking() {
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'submit'].forEach(evt => {
            document.removeEventListener(evt, blockAllEvents, true);
        });
    }

    // ==========================================
    // INTERCEPT ACTION (using shared overlay)
    // ==========================================

    function interceptAction(target, isDestructive) {
        isIntercepting = true;

        const btn = target.closest(
            'button, [role="button"], input[type="submit"], input[type="button"], [type="submit"]'
        ) || target;

        const formTitle = getFormTitle();

        // Detect specific action word from the button text
        // Detect specific action word from the button text
        let actionLabel = 'FORM ACTION';
        const btnText = (btn.textContent || btn.value || '').trim();

        if (btnText && btnText.length < 30) {
            actionLabel = btnText.toUpperCase();
        } else {
            // Fallback keywords if text is too long or empty
            const lowerText = btnText.toLowerCase();
            if (isDestructive) {
                if (lowerText.includes('delete')) actionLabel = 'DELETE';
                else if (lowerText.includes('remove')) actionLabel = 'REMOVE';
                else if (lowerText.includes('cancel')) actionLabel = 'CANCEL';
                else actionLabel = 'DESTRUCTIVE ACTION';
            } else {
                if (lowerText.includes('login') || lowerText.includes('sign in')) actionLabel = 'LOGIN ATTEMPT';
                else if (lowerText.includes('sign up') || lowerText.includes('register')) actionLabel = 'REGISTRATION';
                else if (lowerText.includes('search')) actionLabel = 'SEARCH';
                else actionLabel = 'FORM SUBMISSION';
            }
        }

        const formData = {
            formName: formTitle,
            action: actionLabel,
            site: window.location.hostname,
            url: window.location.href,
            isDestructive: isDestructive
        };

        console.log('🛡️ Form action intercepted:', formData);

        startBlocking();

        window.ElvionOverlay.safeSendMessage({
            type: 'INTERCEPT_ACTION',
            actionType: 'form',
            label: actionLabel,
            metadata: formData
        }, (response) => {
            const actionId = response?.action?.id || null;
            const graceWindow = response?.action?.graceWindow || 15;

            window.ElvionOverlay.create({
                actionTitle: actionLabel,
                metaLines: [
                    `FORM: ${formTitle}`,
                    `SITE: ${window.location.hostname}`
                ],
                actionId: actionId,
                graceWindow: graceWindow,
                isDestructive: isDestructive,
                onUndo: () => {
                    isIntercepting = false;
                    stopBlocking();
                    window.ElvionOverlay.showToast('Submission prevented!', 'success');
                },
                onCommit: () => {
                    isIntercepting = false;
                    stopBlocking();

                    // Remove listeners, click, re-add
                    document.removeEventListener('pointerdown', handleEarlyEvent, true);
                    document.removeEventListener('mousedown', handleEarlyEvent, true);
                    document.removeEventListener('click', handleClickEvent, true);
                    document.removeEventListener('submit', handleFormSubmit, true);

                    btn.click();

                    setTimeout(() => {
                        document.addEventListener('pointerdown', handleEarlyEvent, true);
                        document.addEventListener('mousedown', handleEarlyEvent, true);
                        document.addEventListener('click', handleClickEvent, true);
                        document.addEventListener('submit', handleFormSubmit, true);
                    }, 1500);

                    window.ElvionOverlay.showToast('Form submitted', 'info');
                }
            });
        });
    }

    // ==========================================
    // EVENT HANDLERS
    // ==========================================

    function handleEarlyEvent(event) {
        if (shouldSkip() || isIntercepting) return;

        const target = event.target;

        if (isSubmitButton(target)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            console.log('🛡️ Submit intercepted at', event.type, 'on', window.location.hostname);
            interceptAction(target, false);
            return;
        }

        if (isDestructiveButton(target)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            console.log('🛡️ Destructive action intercepted at', event.type);
            interceptAction(target, true);
            return;
        }
    }

    function handleClickEvent(event) {
        if (shouldSkip() || isIntercepting) return;

        const target = event.target;

        if (isSubmitButton(target)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            console.log('🛡️ Submit intercepted at click on', window.location.hostname);
            interceptAction(target, false);
            return;
        }

        if (isDestructiveButton(target)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            interceptAction(target, true);
            return;
        }
    }

    function handleFormSubmit(event) {
        if (shouldSkip() || isIntercepting) return;

        event.preventDefault();
        event.stopPropagation();

        isIntercepting = true;

        const form = event.target;
        const formName = form.getAttribute('name') || form.id || getFormTitle();

        startBlocking();

        window.ElvionOverlay.safeSendMessage({
            type: 'INTERCEPT_ACTION',
            actionType: 'form',
            actionType: 'form',
            label: formName.toUpperCase() || 'FORM SUBMISSION', // Use form title as fallback label
            metadata: { formName, site: window.location.hostname, url: window.location.href }
        }, (response) => {
            const actionId = response?.action?.id || null;
            const graceWindow = response?.action?.graceWindow || 15;

            // Try to find a submit button to get a better label
            const submitBtn = form.querySelector('[type="submit"], button:not([type="button"])');
            const btnLabel = submitBtn ? (submitBtn.textContent || submitBtn.value || '').trim().toUpperCase() : '';
            const finalLabel = btnLabel && btnLabel.length < 25 ? btnLabel : 'FORM SUBMISSION';

            window.ElvionOverlay.create({
                actionTitle: finalLabel,
                metaLines: [
                    `FORM: ${formName}`,
                    `SITE: ${window.location.hostname}`
                ],
                actionId: actionId,
                graceWindow: graceWindow,
                onUndo: () => {
                    isIntercepting = false;
                    stopBlocking();
                    window.ElvionOverlay.showToast('Submission prevented!', 'success');
                },
                onCommit: () => {
                    isIntercepting = false;
                    stopBlocking();
                    form.submit();
                    window.ElvionOverlay.showToast('Form submitted', 'info');
                }
            });
        });
    }

    // ==========================================
    // INITIALIZE
    // ==========================================

    if (!shouldSkip()) {
        document.addEventListener('pointerdown', handleEarlyEvent, true);
        document.addEventListener('mousedown', handleEarlyEvent, true);
        document.addEventListener('click', handleClickEvent, true);
        document.addEventListener('submit', handleFormSubmit, true);

        console.log('✅ Universal form interception active on', window.location.hostname);
        console.log('   Intercepting: Submit, Send, Confirm, Delete, Remove, and more');
    } else {
        console.log('⏭️ Form interception skipped (handled by specific script)');
    }
})();
