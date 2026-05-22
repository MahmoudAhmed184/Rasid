interface TabControllerOptions {
    onTabActivated?: (tabId: string) => void;
}

export function createTabController(root: Document, options: TabControllerOptions = {}) {
    let isBound = false;

    function activateTab(tabId: string) {
        root.querySelectorAll<HTMLElement>('.tab-container').forEach((container) => {
            const isActive = container.id === `${tabId}-tab`;

            container.classList.toggle('hidden', !isActive);
            container.hidden = !isActive;
            container.setAttribute('aria-hidden', String(!isActive));
        });

        root.querySelectorAll<HTMLButtonElement>('.sidebar-nav .nav-item').forEach((item) => {
            const isActive = item.dataset.tab === tabId;

            item.classList.toggle('active', isActive);
            item.setAttribute('aria-selected', String(isActive));
            item.tabIndex = isActive ? 0 : -1;
        });
    }

    function activateFromButton(item: HTMLButtonElement) {
        const { tab } = item.dataset;

        if (!tab) {
            return;
        }

        activateTab(tab);
        options.onTabActivated?.(tab);
    }

    function focusRelativeTab(currentItem: HTMLButtonElement, direction: 1 | -1) {
        const items = Array.from(
            root.querySelectorAll<HTMLButtonElement>('.sidebar-nav .nav-item')
        );
        const currentIndex = items.indexOf(currentItem);

        if (currentIndex === -1 || items.length === 0) {
            return;
        }

        const nextIndex = (currentIndex + direction + items.length) % items.length;
        items[nextIndex]?.focus();
    }

    function focusEdgeTab(edge: 'first' | 'last') {
        const items = Array.from(
            root.querySelectorAll<HTMLButtonElement>('.sidebar-nav .nav-item')
        );
        const target = edge === 'first' ? items[0] : items.at(-1);

        target?.focus();
    }

    function bind() {
        if (isBound) {
            return;
        }

        isBound = true;

        root.querySelectorAll<HTMLButtonElement>('.sidebar-nav .nav-item').forEach((item) => {
            item.addEventListener('click', () => {
                activateFromButton(item);
            });

            item.addEventListener('keydown', (event) => {
                switch (event.key) {
                    case 'ArrowRight':
                    case 'ArrowUp':
                        event.preventDefault();
                        focusRelativeTab(item, -1);
                        break;
                    case 'ArrowLeft':
                    case 'ArrowDown':
                        event.preventDefault();
                        focusRelativeTab(item, 1);
                        break;
                    case 'Home':
                        event.preventDefault();
                        focusEdgeTab('first');
                        break;
                    case 'End':
                        event.preventDefault();
                        focusEdgeTab('last');
                        break;
                    case 'Enter':
                    case ' ':
                        event.preventDefault();
                        activateFromButton(item);
                        break;
                    default:
                        break;
                }
            });
        });

        activateTab('overview');
    }

    return {
        bind,
        activateTab,
    };
}
