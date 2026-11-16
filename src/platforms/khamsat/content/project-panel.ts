import type { PlatformContentServices, PlatformDisposer, PlatformPage } from '../../contracts';
import { getDirection, getLanguage, t, onLanguageChange } from '../../../shared/i18n';
import { KHAMSAT_SELECTORS } from '../selectors';
import { extractKhamsatProposalSource } from './data';

type ProjectPage = Extract<PlatformPage, { readonly kind: 'project' }>;

interface MountKhamsatProjectPanelInput {
    readonly page: ProjectPage;
    readonly document: Document;
    readonly services: PlatformContentServices;
}

function getCurrentUrl(doc: Document): URL {
    return new URL(doc.defaultView?.location.href ?? globalThis.location.href);
}

function createPanelRoot(doc: Document): HTMLElement {
    const existingRoot = doc.getElementById(KHAMSAT_SELECTORS.panel.rootId);
    existingRoot?.remove();

    const root = doc.createElement('aside');
    root.id = KHAMSAT_SELECTORS.panel.rootId;
    root.className = 'rasid-khamsat-panel';
    return root;
}

export function mountKhamsatProjectPanel(input: MountKhamsatProjectPanelInput): PlatformDisposer {
    const root = createPanelRoot(input.document);
    root.dir = getDirection();
    root.lang = getLanguage();
    const title = input.document.createElement('h3');
    title.className = 'rasid-khamsat-panel__title';
    title.textContent = t('app.title');

    const subtitle = input.document.createElement('p');
    subtitle.className = 'rasid-khamsat-panel__subtitle';
    subtitle.textContent = t('content.khamsat.subtitle');

    const promptLabel = input.document.createElement('label');
    promptLabel.className = 'rasid-khamsat-panel__label';
    promptLabel.textContent = t('content.khamsat.prompt_label');

    const promptSelect = input.document.createElement('select');
    promptSelect.className = 'rasid-khamsat-panel__select';
    promptSelect.disabled = true;

    const actions = input.document.createElement('div');
    actions.className = 'rasid-khamsat-panel__actions';

    const trackButton = input.document.createElement('button');
    trackButton.type = 'button';
    trackButton.className = 'rasid-khamsat-panel__button rasid-khamsat-panel__button--ghost';
    trackButton.textContent = t('common.track');

    const generateButton = input.document.createElement('button');
    generateButton.type = 'button';
    generateButton.className = 'rasid-khamsat-panel__button rasid-khamsat-panel__button--primary';
    generateButton.textContent = t('content.khamsat.generate_proposal');
    generateButton.disabled = true;

    const status = input.document.createElement('p');
    status.className = 'rasid-khamsat-panel__status';
    status.dataset.tone = 'info';
    status.textContent = t('content.khamsat.loading_templates');

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
        const tracked = await input.services.tracking.isTracked(input.page.projectId, 'khamsat');

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
            setStatus(t('content.khamsat.ready'), 'info');
            return;
        }

        setStatus(t('content.khamsat.no_templates'), 'error');
    }

    async function handleTrackClick(): Promise<void> {
        const source = extractKhamsatProposalSource({
            page: input.page,
            document: input.document,
            url: getCurrentUrl(input.document),
        });

        if (!source) {
            setStatus(t('content.khamsat.track_error'), 'error');
            return;
        }

        setBusy(true);

        try {
            const result = await input.services.tracking.toggle(source.trackedProject);
            setTrackedState(result === 'tracked');
            setStatus(
                result === 'tracked'
                    ? t('content.khamsat.tracked_toast')
                    : t('content.khamsat.untracked_toast'),
                'success'
            );
        } catch (error) {
            setStatus(
                error instanceof Error ? error.message : t('content.khamsat.track_update_error'),
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
            setStatus(t('content.khamsat.select_template'), 'error');
            return;
        }

        const source = extractKhamsatProposalSource({
            page: input.page,
            document: input.document,
            url: getCurrentUrl(input.document),
        });

        if (!source) {
            setStatus(t('content.khamsat.extract_error'), 'error');
            return;
        }

        setBusy(true);
        setStatus(t('content.khamsat.generating'), 'info');

        try {
            const result = await input.services.proposals.generate(promptId, source.aiContext);

            if (result.kind === 'error') {
                setStatus(result.message, 'error');
                return;
            }

            if (result.kind === 'bridge') {
                await input.services.proposals.openBridgePrompt(result.prompt, result.chatUrl);
                setStatus(t('content.khamsat.bridge_opened'), 'success');
                return;
            }

            await input.services.proposals.queueAutofill({
                platformId: 'khamsat',
                projectId: input.page.projectId,
                proposal: result.proposal,
                amount: source.minBudget,
                durationDays: source.durationDays,
                createdAt: Date.now(),
            });

            setStatus(t('content.khamsat.autofill_queued'), 'success');
        } catch (error) {
            setStatus(
                error instanceof Error ? error.message : t('content.khamsat.generate_error'),
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
            error instanceof Error ? error.message : t('content.khamsat.init_error'),
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
        subtitle.textContent = t('content.khamsat.subtitle');
        promptLabel.textContent = t('content.khamsat.prompt_label');
        setTrackedState(trackButton.dataset.tracked === 'true');
        generateButton.textContent = t('content.khamsat.generate_proposal');
    });

    return () => {
        disposed = true;
        unsubscribeLang();
        root.remove();
    };
}
