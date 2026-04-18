declare function acquireVsCodeApi(): any;

(function () {
    // =========================================================
    // VSCode API
    // =========================================================
    const vscode = acquireVsCodeApi();

    type VsCodeMessage =
    | { type: 'openExternal'; url: string }
    | { type: 'jumpToLine'; filePath: string; line: number }
    | { type: 'jumpToFile'; filePath: string }
    | { type: 'edit' };

    function postMessage(msg: VsCodeMessage): void {
        vscode.postMessage(msg);
    }

    // =========================================================
    // State
    // =========================================================
    type State = {
        hideTimer: ReturnType<typeof setTimeout> | null;
        lastMouseMove: number;
    };

    const state: State = {
        hideTimer: null,
        lastMouseMove: 0
    };

    const HIDE_DELAY = 1500;

    // =========================================================
    // DOM
    // =========================================================
    const header = document.querySelector('.edit-hint') as HTMLElement | null;

    // =========================================================
    // DOM helpers
    // =========================================================
    function getHeader(): Element | null {
        return header;
    }

    function getFileBlock(filePath: string): HTMLElement | undefined {
        return Array.from(document.querySelectorAll<HTMLElement>('.file-block'))
            .find((el) => el.getAttribute('data-file') === filePath);
    }

    function getLineElement(fileBlock: Element, line: number): HTMLElement | null {
        return fileBlock.querySelector<HTMLElement>(
            '.vjs-line[data-line="' + line + '"]'
        );
    }

    // =========================================================
    // Header control
    // =========================================================
    function showHeader(): void {
        if (!header) {
            return;
        }
        header.classList.remove('hidden');
    }

    function hideHeader(): void {
        if (!header) {
            return;
        }
        header.classList.add('hidden');
    }

    function resetHeaderTimer(): void {
        showHeader();

        if (state.hideTimer) {
            clearTimeout(state.hideTimer);
        }

        state.hideTimer = setTimeout(() => {
            hideHeader();
        }, HIDE_DELAY);
    }

    // =========================================================
    // Click handling
    // =========================================================



    function handleClick(e: MouseEvent): void {
        const target = e.target as HTMLElement | null;

        if (!target) {
            return;
        }

        // External link
        const link = target.closest('a');

        if (link) {
            const href = link.getAttribute('data-href');

            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                e.preventDefault();
                postMessage({ type: 'openExternal', url: href });
            }

            return;
        }

        // Line jump
        const lineEl = target.closest('.vjs-line');

        if (lineEl) {
            const lineStr = lineEl.getAttribute('data-line');
            const fileContainer = lineEl.closest('[data-file]');
            const filePath = fileContainer?.getAttribute('data-file');

            if (lineStr && filePath) {
                postMessage({
                    type: 'jumpToLine',
                    filePath,
                    line: parseInt(lineStr, 10)
                });

                return;
            }
        }

        // File jump
        const fileRoot = target.closest('[data-file]');

        if (fileRoot) {
            const filePath = fileRoot.getAttribute('data-file');

            if (filePath) {
                postMessage({
                    type: 'jumpToFile',
                    filePath
                });
            }

            return;
        }
    }

    function setupClickHandler(): void {
        document.body.addEventListener('click', handleClick);
    }

    // =========================================================
    // Keyboard handling
    // =========================================================
    function handleKeydown(e: KeyboardEvent): void {
        if (e.key === 'Enter' || e.key === 'Escape') {
            postMessage({ type: 'edit' });
            return;
        }

        const keys = [
            'ArrowUp',
            'ArrowDown',
            'PageUp',
            'PageDown',
            'Home',
            'End',
            ' '
        ];

        if (keys.includes(e.key)) {
            resetHeaderTimer();
            return;
        }
    }

    function setupKeyHandler(): void {
        window.addEventListener('keydown', handleKeydown);
    }

    // =========================================================
    // Window interaction
    // =========================================================
    function setupWindowHandlers(): void {
        window.addEventListener('scroll', resetHeaderTimer, { passive: true });
        window.addEventListener('wheel', resetHeaderTimer, { passive: true });

        window.addEventListener('mousemove', () => {
            const now = Date.now();

            if (now - state.lastMouseMove > 200) {
                resetHeaderTimer();
                state.lastMouseMove = now;
            }
        });
    }

    // =========================================================
    // Message handling
    // =========================================================
    function setupMessageHandler(): void {
        window.addEventListener('message', (event) => {
            type IncomingMessage =
                | { type: 'scrollToTop' }
                | { type: 'scrollToLine'; filePath: string; line: number };

            const msg = event.data as IncomingMessage | null;

            if (!msg || typeof msg !== 'object') {
                return;
            }

            if (msg.type === 'scrollToTop') {
                window.scrollTo({ top: 0, behavior: 'auto' });
                return;
            }

            if (msg.type === 'scrollToLine') {
                const { filePath, line } = msg;

                if (typeof line !== 'number') {
                    return;
                }

                const fileBlock = getFileBlock(filePath);

                if (!fileBlock) {
                    return;
                }

                const target = getLineElement(fileBlock, line);

                if (!target) {
                    return;
                }

                target.scrollIntoView({ block: 'center' });
                return;
            }
        });
    }

    // =========================================================
    // Init
    // =========================================================
    function init(): void {
        setupClickHandler();
        setupKeyHandler();
        setupWindowHandlers();
        setupMessageHandler();
    }

    init();
})();
