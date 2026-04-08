import {
    extractProjectData as extractProjectDataUnsafe,
    getBudgetFromPage as getBudgetFromPageUnsafe,
    getProjectDescription as getProjectDescriptionUnsafe,
} from './content/data';
import {
    injectMessageExporter as injectMessageExporterUnsafe,
    injectProjectExporter as injectProjectExporterUnsafe,
} from './content/export';
import {
    injectDashboardStats as injectDashboardStatsUnsafe,
    injectMonitoredProjects as injectMonitoredProjectsUnsafe,
} from './content/home';
import { injectProfileTools as injectProfileToolsUnsafe } from './content/profile';
import { injectTrackButton as injectTrackButtonUnsafe } from './content/project-sidebar';
import {
    getProjectId as getProjectIdUnsafe,
    isContextValid as isContextValidUnsafe,
} from './content/runtime';
import { MOSTAQL_SELECTORS } from './selectors';
import type { ProjectAttachment } from '../../models/jobs';
import { setFormControlValue } from '../../shared/dom/form-events';
import { parseDurationDays } from '../../shared/parsing/duration';
import { parseBudgetFloor } from '../../shared/parsing/numbers';
import type {
    AutofillApplyResult,
    PlatformAdapter,
    PlatformAutofillDraft,
    PlatformContributionMountResult,
    PlatformContentServices,
    PlatformPage,
    PlatformProposalSource,
    PlatformUiContribution,
} from '../contracts';

const MOSTAQL_MATCHES = ['https://mostaql.com/*'] as const;
const MOSTAQL_AUTOFILLED_CLASS = 'mostaql-autofilled';
const PROJECT_PATH_PATTERN = /\/project[s]?\/(\d+)/;

interface MostaqlProjectData {
    readonly id?: string;
    readonly title?: string;
    readonly url?: string;
    readonly status?: string;
    readonly communications?: string;
    readonly duration?: string;
    readonly budget?: string;
    readonly publishDate?: string;
    readonly clientName?: string;
    readonly tags?: string | string[];
    readonly category?: string;
    readonly hiringRate?: string;
    readonly openProjects?: string;
    readonly underwayProjects?: string;
    readonly clientJoined?: string;
    readonly clientType?: string;
    readonly attachments?: ProjectAttachment[];
}

const injectMessageExporter: (downloads: PlatformContentServices['downloads']) => void =
    injectMessageExporterUnsafe;
const injectProjectExporter: (downloads: PlatformContentServices['downloads']) => void =
    injectProjectExporterUnsafe;
const injectDashboardStats: (tracking: PlatformContentServices['tracking']) => void =
    injectDashboardStatsUnsafe;
const injectMonitoredProjects: (tracking: PlatformContentServices['tracking']) => void =
    injectMonitoredProjectsUnsafe;
const injectProfileTools: () => void = injectProfileToolsUnsafe;
const injectTrackButton: (services: PlatformContentServices) => void = injectTrackButtonUnsafe;
const isContextValid: () => boolean = isContextValidUnsafe;
const getProjectId: () => string = getProjectIdUnsafe;
const getBudgetFromPage: () => number = getBudgetFromPageUnsafe;
const getProjectDescription: () => string = getProjectDescriptionUnsafe;

function normalizeText(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeProjectData(value: unknown): MostaqlProjectData {
    if (!value || typeof value !== 'object') {
        return {};
    }

    const candidate = value as Record<string, unknown>;

    return {
        id: normalizeText(candidate.id),
        title: normalizeText(candidate.title),
        url: normalizeText(candidate.url),
        status: normalizeText(candidate.status),
        communications: normalizeText(candidate.communications),
        duration: normalizeText(candidate.duration),
        budget: normalizeText(candidate.budget),
        publishDate: normalizeText(candidate.publishDate),
        clientName: normalizeText(candidate.clientName),
        tags:
            typeof candidate.tags === 'string' || Array.isArray(candidate.tags)
                ? (candidate.tags as string | string[])
                : '',
        category: normalizeText(candidate.category),
        hiringRate: normalizeText(candidate.hiringRate),
        openProjects: normalizeText(candidate.openProjects),
        underwayProjects: normalizeText(candidate.underwayProjects),
        clientJoined: normalizeText(candidate.clientJoined),
        clientType: normalizeText(candidate.clientType),
        attachments: Array.isArray(candidate.attachments)
            ? candidate.attachments
                  .filter(
                      (attachment): attachment is ProjectAttachment =>
                          Boolean(attachment) &&
                          typeof attachment === 'object' &&
                          typeof (attachment as ProjectAttachment).url === 'string'
                  )
                  .map((attachment) => ({
                      name: normalizeText(attachment.name),
                      url: normalizeText(attachment.url),
                  }))
            : [],
    };
}

function extractProjectData(): MostaqlProjectData {
    return normalizeProjectData(extractProjectDataUnsafe());
}

function getCurrentProjectId(url: URL): string {
    return url.pathname.match(PROJECT_PATH_PATTERN)?.[1] ?? getProjectId();
}

function findInput(doc: Document, selectors: readonly string[]): HTMLInputElement | null {
    for (const selector of selectors) {
        const element = doc.querySelector(selector);

        if (element instanceof HTMLInputElement) {
            return element;
        }
    }

    return null;
}

function findTextarea(doc: Document, selectors: readonly string[]): HTMLTextAreaElement | null {
    for (const selector of selectors) {
        const element = doc.querySelector(selector);

        if (element instanceof HTMLTextAreaElement) {
            return element;
        }
    }

    return null;
}

function findElement(doc: Document, selectors: readonly string[]): Element | null {
    for (const selector of selectors) {
        const element = doc.querySelector(selector);

        if (element) {
            return element;
        }
    }

    return null;
}

const mostaqlUi = [
    {
        id: 'mostaql.project',
        pages: ['project'],
        mount(input) {
            if (!input.document.querySelector(MOSTAQL_SELECTORS.sidebar.metaPanel)) {
                return {
                    kind: 'deferred',
                } satisfies PlatformContributionMountResult;
            }

            injectTrackButton(input.services);
            injectProjectExporter(input.services.downloads);

            return {
                kind: 'mounted',
            } satisfies PlatformContributionMountResult;
        },
    },
    {
        id: 'mostaql.message',
        pages: ['message'],
        mount(input) {
            if (!input.document.querySelector(MOSTAQL_SELECTORS.messages.metaPanel)) {
                return {
                    kind: 'deferred',
                } satisfies PlatformContributionMountResult;
            }

            injectMessageExporter(input.services.downloads);

            return {
                kind: 'mounted',
            } satisfies PlatformContributionMountResult;
        },
    },
    {
        id: 'mostaql.home',
        pages: ['home'],
        mount(input) {
            if (!input.document.querySelector(MOSTAQL_SELECTORS.home.target)) {
                return {
                    kind: 'deferred',
                } satisfies PlatformContributionMountResult;
            }

            injectDashboardStats(input.services.tracking);
            injectMonitoredProjects(input.services.tracking);

            return {
                kind: 'mounted',
            } satisfies PlatformContributionMountResult;
        },
    },
    {
        id: 'mostaql.profile',
        pages: ['profile'],
        mount(input) {
            if (!findElement(input.document, MOSTAQL_SELECTORS.profile.targets)) {
                return {
                    kind: 'deferred',
                } satisfies PlatformContributionMountResult;
            }

            injectProfileTools();

            return {
                kind: 'mounted',
            } satisfies PlatformContributionMountResult;
        },
    },
] as const satisfies readonly PlatformUiContribution[];

function matchPage(url: URL): PlatformPage {
    const path = url.pathname;
    const projectMatch = path.match(PROJECT_PATH_PATTERN);

    if (projectMatch) {
        return {
            kind: 'project',
            key: `project:${projectMatch[1]}`,
            projectId: projectMatch[1],
        };
    }

    if (/\/message\//.test(path)) {
        const threadId = path.split('/').at(-1) ?? null;

        return {
            kind: 'message',
            key: `message:${threadId ?? 'unknown'}`,
            threadId,
        };
    }

    if (/\/profile/.test(path)) {
        return {
            kind: 'profile',
            key: `profile:${path}`,
            profileId: null,
        };
    }

    if (path === '/' || path === '') {
        return {
            kind: 'home',
            key: 'home',
        };
    }

    return {
        kind: 'other',
        key: path || 'other',
    };
}

function extractProposalSource(input: {
    readonly page: Extract<PlatformPage, { readonly kind: 'project' }>;
    readonly document: Document;
    readonly url: URL;
}): PlatformProposalSource | null {
    const projectData = extractProjectData();
    const description = getProjectDescription();
    const projectId = input.page.projectId || projectData.id || getCurrentProjectId(input.url);
    const title = projectData.title || input.document.title || 'مشروع غير معنون';
    const budget = projectData.budget || '';
    const duration = projectData.duration || '';

    if (!projectId || !title) {
        return null;
    }

    return {
        trackedProject: {
            id: projectId,
            platformId: 'mostaql',
            title,
            url: projectData.url || input.url.href,
            status: projectData.status || undefined,
            communications: projectData.communications || undefined,
            lastChecked: new Date().toISOString(),
            budget: budget || undefined,
            duration: duration || undefined,
            clientName: projectData.clientName || undefined,
            publishDate: projectData.publishDate || undefined,
        },
        aiContext: {
            title,
            description,
            url: projectData.url || input.url.href,
            tags: projectData.tags || '',
            clientName: projectData.clientName || undefined,
            budget: budget || undefined,
            duration: duration || undefined,
            publishDate: projectData.publishDate || undefined,
            projectStatus: projectData.status || undefined,
            projectId,
            category: projectData.category || undefined,
            hiringRate: projectData.hiringRate || undefined,
            openProjects: projectData.openProjects || undefined,
            underwayProjects: projectData.underwayProjects || undefined,
            clientJoined: projectData.clientJoined || undefined,
            clientType: projectData.clientType || undefined,
            communications: projectData.communications || undefined,
        },
        minBudget: parseBudgetFloor(budget) || getBudgetFromPage(),
        durationDays: parseDurationDays(duration),
    };
}

async function applyProposalAutofill(input: {
    readonly page: Extract<PlatformPage, { readonly kind: 'project' }>;
    readonly document: Document;
    readonly draft: PlatformAutofillDraft;
}): Promise<AutofillApplyResult> {
    if (input.draft.projectId !== input.page.projectId) {
        return {
            kind: 'not-available',
            reason: 'Autofill draft does not belong to the current project page.',
        };
    }

    const amountInput = findInput(input.document, MOSTAQL_SELECTORS.autofill.amountInputs);
    const durationInput = findInput(input.document, MOSTAQL_SELECTORS.autofill.durationInputs);

    if (!amountInput || !durationInput) {
        return {
            kind: 'retry',
            reason: 'Bid amount and duration inputs are not ready yet.',
        };
    }

    if (input.draft.amount > 0) {
        setFormControlValue(amountInput, String(input.draft.amount), {
            highlightClassName: MOSTAQL_AUTOFILLED_CLASS,
        });
    }

    if (input.draft.durationDays > 0) {
        setFormControlValue(durationInput, String(input.draft.durationDays), {
            highlightClassName: MOSTAQL_AUTOFILLED_CLASS,
        });
    }

    if (input.draft.proposal) {
        const proposalTextarea = findTextarea(
            input.document,
            MOSTAQL_SELECTORS.autofill.proposalTextareas
        );

        if (!proposalTextarea) {
            return {
                kind: 'retry',
                reason: 'Proposal text area is not ready yet.',
            };
        }

        setFormControlValue(proposalTextarea, input.draft.proposal, {
            highlightClassName: MOSTAQL_AUTOFILLED_CLASS,
        });
    }

    const targetContainer = amountInput.closest('form') ?? amountInput.parentElement;

    if (targetContainer instanceof HTMLElement) {
        targetContainer.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }

    return {
        kind: 'applied',
    };
}

export const mostaqlAdapter = {
    id: 'mostaql',
    displayName: 'Mostaql',
    matches: MOSTAQL_MATCHES,
    isContextValid,
    matchPage({ url }) {
        return matchPage(url);
    },
    extractProposalSource,
    ui: mostaqlUi,
    applyProposalAutofill,
} satisfies PlatformAdapter;
