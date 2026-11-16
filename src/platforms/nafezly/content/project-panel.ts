import type { PlatformContentServices, PlatformDisposer, PlatformPage } from '../../contracts';
import { getDirection, getLanguage, t, onLanguageChange } from '../../../shared/i18n';
import { extractNafezlyProposalSource } from './data';

type ProjectPage = Extract<PlatformPage, { readonly kind: 'project' }>;

interface MountNafezlyProjectPanelInput {
    readonly page: ProjectPage;
    readonly document: Document;
    readonly services: PlatformContentServices;
}

function getCurrentUrl(doc: Document): URL {
    return new URL(doc.defaultView?.location.href ?? globalThis.location.href);
}

function createPanelRoot(doc: Document): HTMLElement {
    doc.getElementById('rasid-nafezly-panel')?.remove();

    const root = doc.createElement('aside');
    root.id = 'rasid-nafezly-panel';
    root.className = 'rasid-nafezly-panel';
    return root;
}

export function mountNafezlyProjectPanel(input: MountNafezlyProjectPanelInput): PlatformDisposer {
    const root = createPanelRoot(input.document);
    root.dir = getDirection();
    root.lang = getLanguage();
    const title = input.document.createElement('h3');
    title.className = 'rasid-nafezly-panel__title';
    title.textContent = t('app.title');

    const subtitle = input.document.createElement('p');
    subtitle.className = 'rasid-nafezly-panel__subtitle';
    subtitle.textContent = t('content.nafezly.subtitle');

    const promptLabel = input.document.createElement('label');
    promptLabel.className = 'rasid-nafezly-panel__label';
    promptLabel.textContent = t('content.nafezly.prompt_label');

    const promptSelect = input.document.createElement('select');
    promptSelect.className = 'rasid-nafezly-panel__select';
    promptSelect.disabled = true;

    const actions = input.document.createElement('div');
    actions.className = 'rasid-nafezly-panel__actions';

    const trackButton = input.document.createElement('button');
    trackButton.type = 'button';
    trackButton.className = 'rasid-nafezly-panel__button rasid-nafezly-panel__button--ghost';
    trackButton.textContent = t('common.track');

    const generateButton = input.document.createElement('button');
    generateButton.type = 'button';
    generateButton.className = 'rasid-nafezly-panel__button rasid-nafezly-panel__button--primary';
    generateButton.textContent = t('content.nafezly.generate_proposal');
    generateButton.disabled = true;

    const status = input.document.createElement('p');
    status.className = 'rasid-nafezly-panel__status';
    status.dataset.tone = 'info';
    status.textContent = t('content.nafezly.loading_templates');

    actions.appendChild(trackButton);
    actions.appendChild(generateButton);

    root.appendChild(title);
    root.appendChild(subtitle);
    root.appendChild(promptLabel);
    root.appendChild(promptSelect);
    root.appendChild(actions);
    root.appendChild(status);
    input.document.body.appendChild(root);

    let disposed = false;

    function setStatus(message: string, tone: 'info' | 'success' | 'error' = 'info'): void {
        status.textContent = message;
        status.dataset.tone = tone;
    }

    function setTrackedState(tracked: boolean): void {
        trackButton.dataset.tracked = tracked ? 'true' : 'false';
        trackButton.textContent = tracked ? t('common.untrack') : t('common.track');
    }

    function setBusy(busy: boolean): void {
        trackButton.disabled = busy;
        generateButton.disabled = busy || promptSelect.options.length === 0;
        promptSelect.disabled = busy || promptSelect.options.length === 0;
    }

    async function refreshTrackingState(): Promise<void> {
        const tracked = await input.services.tracking.isTracked(input.page.projectId, 'nafezly');

        if (!disposed) {
            setTrackedState(tracked);
        }
    }

    async function loadPrompts(): Promise<void> {
        const prompts = await input.services.prompts.list();

        if (disposed) {
            return;
        }

        promptSelect.replaceChildren();

        for (const prompt of prompts) {
            const option = input.document.createElement('option');
            option.value = prompt.id;
            option.textContent = prompt.title;
            promptSelect.appendChild(option);
        }

        const preferredPrompt =
            prompts.find((prompt) => prompt.id === 'default_proposal') ?? prompts[0] ?? null;

        if (preferredPrompt) {
            promptSelect.value = preferredPrompt.id;
            generateButton.disabled = false;
            promptSelect.disabled = false;
            setStatus(t('content.nafezly.ready'), 'info');
            return;
        }

        setStatus(t('content.nafezly.no_templates'), 'error');
    }

    async function handleTrackClick(): Promise<void> {
        const source = extractNafezlyProposalSource({
            page: input.page,
            document: input.document,
            url: getCurrentUrl(input.document),
        });

        if (!source) {
            setStatus(t('content.nafezly.track_error'), 'error');
            return;
        }

        setBusy(true);

        try {
            const result = await input.services.tracking.toggle(source.trackedProject);
            setTrackedState(result === 'tracked');
            setStatus(
                result === 'tracked'
                    ? t('content.nafezly.tracked_toast')
                    : t('content.nafezly.untracked_toast'),
                'success'
            );
        } catch (error) {
            setStatus(
                error instanceof Error ? error.message : t('content.nafezly.track_update_error'),
                'error'
            );
        } finally {
            if (!disposed) {
                setBusy(false);
            }
        }
    }

    async function handleGenerateClick(): Promise<void> {
        const promptId = promptSelect.value;

        if (!promptId) {
            setStatus(t('content.nafezly.select_template'), 'error');
            return;
        }

        const source = extractNafezlyProposalSource({
            page: input.page,
            document: input.document,
            url: getCurrentUrl(input.document),
        });

        if (!source) {
            setStatus(t('content.nafezly.extract_error'), 'error');
            return;
        }

        setBusy(true);
        setStatus(t('content.nafezly.generating'), 'info');

        try {
            const result = await input.services.proposals.generate(promptId, source.aiContext);

            if (result.kind === 'error') {
                setStatus(result.message, 'error');
                return;
            }

            if (result.kind === 'bridge') {
                await input.services.proposals.openBridgePrompt(result.prompt, result.chatUrl);
                setStatus(t('content.nafezly.bridge_opened'), 'success');
                return;
            }

            await input.services.proposals.queueAutofill({
                platformId: 'nafezly',
                projectId: input.page.projectId,
                proposal: result.proposal,
                amount: source.minBudget,
                durationDays: source.durationDays,
                createdAt: Date.now(),
            });

            setStatus(t('content.nafezly.autofill_queued'), 'success');
        } catch (error) {
            setStatus(
                error instanceof Error ? error.message : t('content.nafezly.generate_error'),
                'error'
            );
        } finally {
            if (!disposed) {
                setBusy(false);
            }
        }
    }

    trackButton.addEventListener('click', () => {
        void handleTrackClick();
    });

    generateButton.addEventListener('click', () => {
        void handleGenerateClick();
    });

    void Promise.all([loadPrompts(), refreshTrackingState()]).catch((error) => {
        setStatus(
            error instanceof Error ? error.message : t('content.nafezly.init_error'),
            'error'
        );
    });

    const unsubscribeLang = onLanguageChange(() => {
        if (disposed) {
            return;
        }
        root.dir = getDirection();
        root.lang = getLanguage();
        title.textContent = t('app.title');
        subtitle.textContent = t('content.nafezly.subtitle');
        promptLabel.textContent = t('content.nafezly.prompt_label');
        setTrackedState(trackButton.dataset.tracked === 'true');
        generateButton.textContent = t('content.nafezly.generate_proposal');
    });

    return () => {
        disposed = true;
        unsubscribeLang();
        root.remove();
    };
}
