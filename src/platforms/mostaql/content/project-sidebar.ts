import type { PromptTemplate } from '../../../models/prompts';
import type { PlatformContentServices } from '../../contracts';
import { parseDurationDays } from '../../../shared/parsing/duration';
import { MOSTAQL_SELECTORS } from '../selectors';
import { handleQuickBidClick, queueProposalAutofill } from './autofill';
import { extractProjectData, getProjectDescription } from './data';
import { createPromptModal, loadPrompts } from './prompts';
import { getProjectId, isContextValid } from './runtime';

// ==========================================
// mostaql/project-sidebar.js — Sidebar button injection
// ==========================================

function createIcon(iconClassName: string): HTMLElement {
    const icon = document.createElement('i');
    icon.className = iconClassName;
    return icon;
}

function createActionText(text: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'action-text';
    span.textContent = text;
    return span;
}

function setActionButtonContent(element: HTMLElement, iconClassName: string, label: string): void {
    element.replaceChildren(createIcon(iconClassName), document.createTextNode(' '), createActionText(label));
}

function setInlineIconText(element: HTMLElement, iconClassName: string, text: string): void {
    element.replaceChildren(createIcon(iconClassName), document.createTextNode(` ${text}`));
}

function setIconOnlyContent(element: HTMLElement, iconClassName: string): void {
    element.replaceChildren(createIcon(iconClassName));
}

export function injectTrackButton(services: PlatformContentServices) {
    const metaCardBody = document.querySelector(MOSTAQL_SELECTORS.sidebar.metaPanel);
    if (!metaCardBody) {
        return;
    }

    let buttonContainer = document.getElementById(MOSTAQL_SELECTORS.sidebar.buttonContainerId);

    if (buttonContainer && buttonContainer.parentElement !== metaCardBody) {
        buttonContainer.remove();
        buttonContainer = null;
    }

    if (!buttonContainer) {
        if (!metaCardBody.querySelector(MOSTAQL_SELECTORS.sidebar.separator)) {
            const hr = document.createElement('hr');
            hr.className = `separator ${MOSTAQL_SELECTORS.sidebar.separator.slice(1)}`;
            metaCardBody.appendChild(hr);
        }

        buttonContainer = document.createElement('div');
        buttonContainer.id = MOSTAQL_SELECTORS.sidebar.buttonContainerId;
        buttonContainer.className = 'mostaql-ext-sidebar-container';
        metaCardBody.appendChild(buttonContainer);
    }

    if (buttonContainer && !document.getElementById(MOSTAQL_SELECTORS.sidebar.promptGroupId)) {
        buttonContainer.replaceChildren();
    }

    // --- Track Button ---
    if (!document.getElementById('track-project-btn')) {
        const trackBtn = document.createElement('button');
        trackBtn.id = 'track-project-btn';
        trackBtn.className = 'btn btn-success';
        setActionButtonContent(trackBtn, 'fa fa-fw fa-eye', 'مراقبة');
        trackBtn.title = 'مراقبة المشروع';

        const projectId = getProjectId();
        if (isContextValid()) {
            services.tracking
                .isTracked(projectId, 'mostaql')
                .then((tracked) => {
                    if (tracked) {
                        setButtonTracked(trackBtn);
                    }
                })
                .catch(console.error);
        }

        trackBtn.addEventListener('click', () => {
            void handleTrackClick(services, trackBtn);
        });

        buttonContainer.appendChild(trackBtn);
    }

    // --- Fast Apply (Quick) Button ---
    if (!document.getElementById('header-quick-bid-btn')) {
        const quickBtn = document.createElement('button');
        quickBtn.id = 'header-quick-bid-btn';
        quickBtn.className = 'btn btn-success';
        setActionButtonContent(quickBtn, 'fa fa-fw fa-bolt', 'سريع');
        quickBtn.title = 'تعبئة العرض الافتراضي والميزانية الدنيا';

        quickBtn.addEventListener('click', () => {
            void handleQuickBidClick(services.proposals);
        });

        buttonContainer.appendChild(quickBtn);
    }

    // --- ChatGPT Split Button ---
    if (!document.getElementById(MOSTAQL_SELECTORS.sidebar.promptGroupId)) {
        const group = document.createElement('div');
        group.id = MOSTAQL_SELECTORS.sidebar.promptGroupId;
        group.className = 'btn-group dropdown mostaql-custom-dropdown';

        const mainBtn = document.createElement('a');
        mainBtn.id = 'chatgpt-main-btn';
        mainBtn.className = 'btn btn-primary';
        mainBtn.href = 'javascript:void(0);';
        setActionButtonContent(mainBtn, 'fa fa-fw fa-magic', 'ذكاء');
        mainBtn.title = 'استشارة الذكاء الاصطناعي';
        mainBtn.dataset.promptId = 'default_proposal';

        mainBtn.addEventListener('click', (e) => {
            e.preventDefault();
            mainBtn.style.opacity = '0.8';
            setTimeout(() => (mainBtn.style.opacity = '1'), 200);
            void handleChatGptClick(services, mainBtn.dataset.promptId);
        });

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'chatgpt-dropdown-toggle';
        toggleBtn.className = 'btn btn-primary dropdown-toggle';
        setIconOnlyContent(toggleBtn, 'fa fa-caret-down');
        toggleBtn.setAttribute('data-toggle', 'dropdown');

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            group.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!(e.target instanceof Node) || !group.contains(e.target)) {
                group.classList.remove('open');
            }
        });

        const menuList = document.createElement('ul');
        menuList.className = 'dropdown-menu dropdown-left dropdown-menu-left';
        menuList.setAttribute('role', 'menu');

        const renderMenu = () => {
            loadPrompts(services.prompts, (prompts: readonly PromptTemplate[]) => {
                menuList.replaceChildren();

                prompts.forEach((p: PromptTemplate) => {
                    const li = document.createElement('li');
                    li.className = 'prompt-li';
                    if (mainBtn.dataset.promptId === p.id) {
                        li.classList.add('active');
                    }

                    const itemContainer = document.createElement('div');
                    itemContainer.style.display = 'flex';
                    itemContainer.style.alignItems = 'center';
                    itemContainer.style.justifyContent = 'space-between';
                    itemContainer.style.width = '100%';

                    const a = document.createElement('a');
                    a.href = 'javascript:void(0);';
                    a.textContent = p.title;
                    a.style.flex = '1';
                    a.style.padding = '5px 10px';
                    a.style.color = 'inherit';
                    a.style.textDecoration = 'none';
                    a.onclick = (e) => {
                        e.preventDefault();
                        void handleChatGptClick(services, p.id);
                        group.classList.remove('open');
                        renderMenu();
                    };

                    const editBtn = document.createElement('span');
                    setIconOnlyContent(editBtn, 'fa fa-pencil');
                    editBtn.style.cursor = 'pointer';
                    editBtn.style.padding = '5px 10px';
                    editBtn.style.color = '#777';
                    editBtn.title = 'تعديل القالب';
                    editBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        group.classList.remove('open');
                        createPromptModal(services.prompts, renderMenu, p);
                    };
                    editBtn.onmouseover = () => (editBtn.style.color = '#2386c8');
                    editBtn.onmouseout = () => (editBtn.style.color = '#777');

                    itemContainer.appendChild(a);
                    itemContainer.appendChild(editBtn);

                    li.appendChild(itemContainer);
                    menuList.appendChild(li);
                });

                const divLi = document.createElement('li');
                divLi.className = 'divider';
                menuList.appendChild(divLi);

                const addLi = document.createElement('li');
                const addLink = document.createElement('a');
                addLink.href = 'javascript:void(0);';
                setInlineIconText(addLink, 'fa fa-plus', 'إضافة قالب جديد');
                addLink.onclick = (e) => {
                    e.preventDefault();
                    group.classList.remove('open');
                    createPromptModal(
                        services.prompts,
                        (newId: string) => {
                            if (newId) {
                                mainBtn.dataset.promptId = newId;
                                loadPrompts(
                                    services.prompts,
                                    (prompts: readonly PromptTemplate[]) => {
                                        const p = prompts.find((x) => x.id === newId);
                                        if (p) {
                                            mainBtn.title = `استخدام القالب: ${p.title}`;
                                        }
                                        renderMenu();
                                    }
                                );
                            } else {
                                renderMenu();
                            }
                        },
                        null
                    );
                };
                addLi.appendChild(addLink);
                menuList.appendChild(addLi);
            });
        };

        renderMenu();

        group.appendChild(mainBtn);
        group.appendChild(toggleBtn);
        group.appendChild(menuList);

        buttonContainer.appendChild(group);
    }
}

async function handleTrackClick(
    services: PlatformContentServices,
    btn: HTMLButtonElement
): Promise<void> {
    if (!isContextValid()) {
        console.warn('Mostaql Ext: Extension context invalidated. Please refresh the page.');
        return;
    }
    const projectId = getProjectId();
    if (!projectId) {
        return;
    }

    const result = await services.tracking.toggle({
        ...extractProjectData(),
        id: projectId,
        platformId: 'mostaql',
    });

    if (result === 'untracked') {
        setButtonUntracked(btn);
    } else {
        setButtonTracked(btn);
    }
}

function setButtonTracked(btn: HTMLButtonElement): void {
    setActionButtonContent(btn, 'fa fa-fw fa-check-circle', 'مُراقبة');
    btn.className = 'btn btn-warning';
    btn.title = 'إلغاء المراقبة';
}

function setButtonUntracked(btn: HTMLButtonElement): void {
    setActionButtonContent(btn, 'fa fa-fw fa-eye', 'مراقبة');
    btn.className = 'btn btn-success';
    btn.title = 'مراقبة هذا المشروع';
}

function handleChatGptClick(
    services: PlatformContentServices,
    promptId?: string
): void {
    if (!isContextValid()) {
        console.warn('Mostaql Ext: Extension context invalidated. Please refresh the page.');
        return;
    }

    const projectData = extractProjectData();
    const description = getProjectDescription();

    if (!description) {
        alert('لم يتم العثور على وصف المشروع.');
        return;
    }

    loadPrompts(services.prompts, (prompts: readonly PromptTemplate[]) => {
        const selectedPrompt = prompts.find((p) => p.id === promptId);

        if (selectedPrompt) {
            processPrompt(selectedPrompt.id);
            return;
        }

        if (promptId !== 'default_proposal') {
            console.error('Prompt ID not found:', promptId);
            alert(
                'خطأ: لم يتم العثور على القالب المحدد (ID: ' +
                    promptId +
                    '). تحقق من قائمة الأوامر.'
            );
            return;
        }

        processPrompt('default_proposal');
    });

    async function processPrompt(templateId: string): Promise<void> {
        try {
            const result = await services.proposals.generate(templateId, {
                title: projectData.title,
                url: projectData.url,
                description,
                tags: projectData.tags,
                clientName: projectData.clientName,
                budget: projectData.budget,
                duration: projectData.duration,
                publishDate: projectData.publishDate,
                projectStatus: projectData.status,
                projectId: projectData.id,
                category: projectData.category,
                hiringRate: projectData.hiringRate,
                openProjects: projectData.openProjects,
                underwayProjects: projectData.underwayProjects,
                clientJoined: projectData.clientJoined,
                clientType: projectData.clientType,
                communications: projectData.communications,
                attachments: projectData.attachments,
            });

            if (result.kind === 'direct') {
                await queueProposalAutofill({
                    proposals: services.proposals,
                    projectId: projectData.id,
                    proposal: result.proposal,
                    duration: parseDurationDays(projectData.duration),
                });
                return;
            }

            if (result.kind === 'bridge') {
                await services.proposals.setPendingBridgePrompt(result.prompt);
                window.open(result.chatUrl || 'https://chatgpt.com/', 'mostaql_ai_chat');
                return;
            }

            throw new Error(result.message);
        } catch (error) {
            console.error('Error generating proposal:', error);
            alert(
                `خطأ: تعذر إنشاء العرض. ${error instanceof Error ? error.message : 'حاول مرة أخرى.'}`
            );
        }
    }
}
