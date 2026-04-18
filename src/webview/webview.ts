declare function acquireVsCodeApi(): any;

(function(){
    const vscode = acquireVsCodeApi();

    // ===== header auto hide =====
    const header = document.querySelector('.edit-hint');
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const HIDE_DELAY = 1500;

    function showHeader() {
        if (!header) { return; }
        header.classList.remove('hidden');
    }

    function hideHeader() {
        if (!header) { return; }
        header.classList.add('hidden');
    }

    function resetHeaderTimer() {
        showHeader();

        if (hideTimer) {
            clearTimeout(hideTimer);
        }

        hideTimer = setTimeout(() => {
            hideHeader();
        }, HIDE_DELAY);
    }

    document.body.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        if (!target) { return; }

        const link = target.closest('a');
        if (link) {
            const href = link.getAttribute('data-href');
            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                e.preventDefault();
                vscode.postMessage({ type: 'openExternal', url: href });
            }
            return;
        }

        const targetLineDiv = target.closest('.vjs-line');
        if (targetLineDiv) {
            const lineStr = targetLineDiv.getAttribute('data-line');
            const fileContainer = targetLineDiv.closest('[data-file]');
            const filePath = fileContainer?.getAttribute('data-file');
            if (lineStr && filePath) {
                vscode.postMessage({
                    type: 'jumpToLine',
                    filePath,
                    line: parseInt(lineStr, 10)
                });
                return;
            }
        }

        const fileRoot = target.closest('[data-file]');
        if (fileRoot) {
            const filePath = fileRoot.getAttribute('data-file');
            if (filePath) {
                vscode.postMessage({
                    type: 'jumpToFile',
                    filePath
                });
                return;
            }
        }
    });

    window.addEventListener('keydown', handleKeydown);

    function handleKeydown(e: KeyboardEvent) {

        // --- edit系 ---
        if (e.key === 'Enter' || e.key === 'Escape') {
            vscode.postMessage({ type: 'edit' });
            return;
        }

        // --- interaction系 ---
        const keys = [
            'ArrowUp','ArrowDown',
            'PageUp','PageDown',
            'Home','End',' '
        ];

        if (keys.includes(e.key)) {
            resetHeaderTimer();
        }
    }

    // ===== interaction detection =====
    window.addEventListener('scroll', resetHeaderTimer, { passive: true });
    window.addEventListener('wheel', resetHeaderTimer, { passive: true });

    // マウスは軽く間引く
    let lastMove = 0;
    window.addEventListener('mousemove', () => {
        const now = Date.now();
        if (now - lastMove > 200) {
            resetHeaderTimer();
            lastMove = now;
        }
    });

    window.addEventListener('message', event => {
        const msg = event.data;

        if (msg.type === 'scrollToTop') {
            window.scrollTo({ top: 0, behavior: 'auto' });
            return;
        }

        if (msg.type === 'scrollToLine') {
            const { filePath, line } = msg;
            if (typeof line !== 'number') { return; }

            const fileBlock = Array.from(document.querySelectorAll('.file-block'))
                .find(el => el.getAttribute('data-file') === filePath);

            if (!fileBlock) { return; }

            const el = fileBlock.querySelector(
                '.vjs-line[data-line="' + line + '"]'
            );

            if (!el) { return; }

            el.scrollIntoView({ block: 'center' });
        }
    });
})();
