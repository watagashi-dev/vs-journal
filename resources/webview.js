(function(){
    const vscode = acquireVsCodeApi();

    // ===== header auto hide =====
    const header = document.querySelector('.edit-hint');
    let hideTimer = null;
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
        const link = e.target.closest('a');
        if (link) {
            const href = link.getAttribute('data-href');
            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                e.preventDefault();
                vscode.postMessage({ type: 'openExternal', url: href });
            }
            return;
        }

        const targetLineDiv = e.target.closest('.vjs-line');
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

        const fileRoot = e.target.closest('[data-file]');
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

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
            vscode.postMessage({ type: 'edit' });
        }
    });

    // ===== interaction detection =====
    window.addEventListener('scroll', resetHeaderTimer, { passive: true });
    window.addEventListener('wheel', resetHeaderTimer, { passive: true });

    window.addEventListener('keydown', (e) => {
        const keys = [
            'ArrowUp','ArrowDown',
            'PageUp','PageDown',
            'Home','End',' '
        ];
        if (keys.includes(e.key)) {
            resetHeaderTimer();
        }
    });

    // マウスは軽く間引く
    let lastMove = 0;
    window.addEventListener('mousemove', () => {
        const now = Date.now();
        if (now - lastMove > 200) {
            resetHeaderTimer();
            lastMove = now;
        }
    });
})();
