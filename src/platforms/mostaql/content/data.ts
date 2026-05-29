import type { ProjectAttachment } from '../../../entities/job/model';
import { resolvePlatformUrl } from '../../../entities/platform/url';
import { MOSTAQL_SELECTORS, queryFirst } from '../selectors';
import { getProjectId } from './runtime';

// ==========================================
// mostaql/data.js — DOM scraping & project data extraction
// ==========================================

export interface MostaqlBidDetails {
    name: string;
    link: string;
    title: string;
    timeRaw: string | null;
    timeText: string;
    timeOffset: string | null;
    content: string;
}

export interface MostaqlProjectPageData {
    id: string;
    status: string;
    communications: string;
    title: string;
    url: string;
    lastChecked: string;
    duration: string;
    budget: string;
    publishDate: string;
    clientName: string;
    tags: string;
    category: string;
    hiringRate: string;
    openProjects: string;
    underwayProjects: string;
    clientJoined: string;
    clientType: string;
    attachments: ProjectAttachment[];
}

export interface MostaqlProjectDetailsData extends MostaqlProjectPageData {
    publishDatetime?: string | null;
    clientTitle?: string;
    ongoingCommunications?: string | null;
    description?: string;
    tagsList?: string[];
    bids?: MostaqlBidDetails[];
}

export interface MostaqlMyProposalData {
    bidderName: string;
    price: string;
    duration: string;
    content: string;
    attachments: ProjectAttachment[];
}

type MostaqlRemoteProjectData = Partial<MostaqlProjectDetailsData>;
const MOSTAQL_HOSTS = ['mostaql.com'] as const;
const MOSTAQL_BASE_URL = 'https://mostaql.com/';
const MOSTAQL_PROJECT_PATH_PATTERN = /^\/projects?\/\d+(?:[-/]|$)/;

function resolveMostaqlUrl(
    href: string | null | undefined,
    baseUrl = MOSTAQL_BASE_URL
): string | null {
    return resolvePlatformUrl(href, {
        baseUrl,
        allowedHosts: MOSTAQL_HOSTS,
    });
}

function resolveMostaqlProjectUrl(
    href: string | null | undefined,
    baseUrl = MOSTAQL_BASE_URL
): string | null {
    return resolvePlatformUrl(href, {
        baseUrl,
        allowedHosts: MOSTAQL_HOSTS,
        pathPattern: MOSTAQL_PROJECT_PATH_PATTERN,
    });
}

export function extractProjectData(): MostaqlProjectPageData {
    const statusLabel = document.querySelector(MOSTAQL_SELECTORS.project.statusLabel);
    const status = statusLabel ? statusLabel.textContent.trim().replace(/\s+/g, ' ') : 'غير معروف';

    let communications = '0';
    let duration = 'غير محدد';
    let budget = 'غير محدد';
    let publishDate = 'غير معروف';
    let hiringRate = 'غير معروف';
    let clientJoined = 'غير معروف';
    let openProjects = '0';
    let underwayProjects = '0';

    const metaRows = document.querySelectorAll<HTMLElement>(MOSTAQL_SELECTORS.project.metaRows);
    metaRows.forEach((row) => {
        const label =
            row
                .querySelector(MOSTAQL_SELECTORS.project.metaLabel)
                ?.textContent.trim()
                .replace(/\s+/g, ' ') ||
            row.innerText.split(/[:\n]/)[0]?.trim().replace(/\s+/g, ' ');
        const value =
            row
                .querySelector(MOSTAQL_SELECTORS.project.metaValue)
                ?.textContent.trim()
                .replace(/\s+/g, ' ') ||
            row.innerText.split(/[:\n]/).pop()?.trim().replace(/\s+/g, ' ');

        if (label && value) {
            if (label.includes('التواصلات') || label.includes('Communications')) {
                communications = value;
            } else if (label.includes('مدة التنفيذ') || label.includes('Duration')) {
                duration = value;
            } else if (label.includes('الميزانية') || label.includes('Budget')) {
                budget = value;
            } else if (label.includes('تاريخ النشر') || label.includes('Published')) {
                publishDate = value;
            } else if (label.includes('معدل التوظيف') || label.includes('Hiring')) {
                hiringRate = value;
            } else if (label.includes('تاريخ التسجيل') || label.includes('Joined')) {
                clientJoined = value;
            } else if (label.includes('المشاريع المفتوحة')) {
                openProjects = value;
            } else if (label.includes('مشاريع قيد التنفيذ')) {
                underwayProjects = value;
            }
        }
    });

    const budgetEl = document.querySelector(MOSTAQL_SELECTORS.project.budget);
    if (budgetEl) {
        budget = budgetEl.textContent.trim().replace(/\s+/g, ' ');
    }

    const timeEl = document.querySelector(MOSTAQL_SELECTORS.project.publishTime);
    if (timeEl) {
        publishDate = timeEl.textContent.trim().replace(/\s+/g, ' ');
    }

    const sideTags = document.querySelectorAll<HTMLElement>(MOSTAQL_SELECTORS.project.metaTags);
    let tagsStr = '';
    if (sideTags.length > 0) {
        tagsStr = Array.from(sideTags)
            .map((t) => t.innerText.trim())
            .join(', ');
    }

    const clientNameEl = document.querySelector(MOSTAQL_SELECTORS.project.clientName);
    const clientName = clientNameEl
        ? clientNameEl.textContent.trim().replace(/\s+/g, ' ')
        : 'غير معروف';

    const projectId = getProjectId();

    const categoryEl = document.querySelector(MOSTAQL_SELECTORS.project.category);
    const category = categoryEl ? categoryEl.textContent.trim() : 'غير معروف';

    let clientType = 'صاحب عمل';

    const clientCard = document.querySelector(MOSTAQL_SELECTORS.project.clientCard);
    if (clientCard) {
        const clientRows = clientCard.querySelectorAll(MOSTAQL_SELECTORS.project.clientRows);
        clientRows.forEach((row) => {
            const label = row.querySelector('td:first-child')?.textContent.trim();
            const value = row.querySelector('td:last-child')?.textContent.trim();
            if (label && value) {
                if (label.includes('معدل التوظيف')) {
                    hiringRate = value;
                } else if (label.includes('المشاريع المفتوحة')) {
                    openProjects = value;
                } else if (label.includes('مشاريع قيد التنفيذ')) {
                    underwayProjects = value;
                } else if (label.includes('تاريخ التسجيل')) {
                    clientJoined = value;
                }
            }
        });

        const typeEl = clientCard.querySelector(MOSTAQL_SELECTORS.project.clientType);
        if (typeEl) {
            clientType = typeEl.textContent.trim();
        }
    }

    const tags = Array.from(document.querySelectorAll<HTMLElement>(MOSTAQL_SELECTORS.project.tags))
        .map((tag) => tag.textContent.trim())
        .join(', ');

    const titleEl = queryFirst<HTMLElement>(document, MOSTAQL_SELECTORS.project.titleCandidates);
    const title = titleEl?.textContent.trim() || document.title || 'مشروع غير معنون';

    return {
        id: projectId || '',
        status: status || 'غير معروف',
        communications: communications || '0',
        title: title,
        url:
            resolveMostaqlProjectUrl(window.location.href, window.location.href) ??
            resolveMostaqlUrl(window.location.href, window.location.href) ??
            window.location.href,
        lastChecked: new Date().toISOString(),
        duration: duration || 'غير محدد',
        budget: budget || 'غير محدد',
        publishDate: publishDate || 'غير معروف',
        clientName: clientName || 'غير معروف',
        tags: tags || tagsStr || '',
        category: category || 'عام',
        hiringRate: hiringRate || 'غير متوفر',
        openProjects: openProjects || '0',
        underwayProjects: underwayProjects || '0',
        clientJoined: clientJoined || 'غير معروف',
        clientType: clientType || 'صاحب عمل',
        attachments: Array.from(
            document.querySelectorAll<HTMLAnchorElement>(MOSTAQL_SELECTORS.project.attachments)
        )
            .map((a): ProjectAttachment | null => {
                const url = resolveMostaqlUrl(a.getAttribute('href'), window.location.href);

                if (!url) {
                    return null;
                }

                return {
                    url,
                    name: a.getAttribute('title') || a.innerText.trim(),
                };
            })
            .filter((attachment): attachment is ProjectAttachment => attachment !== null),
    };
}

export function getProjectDescription() {
    let description = '';

    const container = queryFirst<HTMLElement>(document, MOSTAQL_SELECTORS.project.detailContainers);
    if (!container) {
        return '';
    }

    const mainText = container.querySelector<HTMLElement>(MOSTAQL_SELECTORS.project.detailMain);
    if (mainText) {
        description += mainText.innerText.trim() + '\n\n';
    }

    const detailRows = container.querySelectorAll<HTMLElement>(
        MOSTAQL_SELECTORS.project.detailRows
    );
    detailRows.forEach((row) => {
        const label = row.querySelector(MOSTAQL_SELECTORS.project.detailLabel)?.textContent.trim();
        const value = row.querySelector(MOSTAQL_SELECTORS.project.detailValue)?.textContent.trim();

        if (label && value && label !== value) {
            description += `${label}: ${value}\n`;
        }
    });

    if (!description.trim()) {
        description = container.innerText.trim();
    }

    return description.trim();
}

export function getBudgetFromPage() {
    const budgetEl = document.querySelector(MOSTAQL_SELECTORS.project.budgetOnly);
    if (!budgetEl) {
        return 0;
    }

    const text = budgetEl.textContent.trim();
    if (!text) {
        return 0;
    }

    const matches = text.replace(/,/g, '').match(/\d+(\.\d+)?/g);
    if (!matches || matches.length === 0) {
        return 0;
    }

    const values = matches.map((m) => parseFloat(m));
    return Math.min(...values);
}

export async function fetchDeepProjectData(url: string): Promise<MostaqlRemoteProjectData | null> {
    try {
        const projectUrl = resolveMostaqlProjectUrl(url);

        if (!projectUrl) {
            return null;
        }

        const response = await fetch(projectUrl);
        if (!response.ok) {
            return null;
        }
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const res: MostaqlRemoteProjectData = {};

        const tags = Array.from(
            doc.querySelectorAll<HTMLElement>(MOSTAQL_SELECTORS.project.remoteTags)
        );
        if (tags.length > 0) {
            res.tags = Array.from(new Set(tags.map((t) => t.innerText.trim()))).join(', ');
        }

        const getMetaValue = (label: string): string | null => {
            const rows = doc.querySelectorAll<HTMLElement>('.meta-row');
            for (const row of rows) {
                if (row.querySelector<HTMLElement>('.meta-label')?.innerText.includes(label)) {
                    return (
                        row
                            .querySelector<HTMLElement>('.meta-value')
                            ?.innerText.trim()
                            .replace(/\s+/g, ' ') ?? null
                    );
                }
            }
            const trs = doc.querySelectorAll<HTMLElement>('tr');
            for (const tr of trs) {
                if (tr.innerText.includes(label)) {
                    return (
                        tr
                            .querySelector<HTMLElement>('td:last-child')
                            ?.innerText.trim()
                            .replace(/\s+/g, ' ') ?? null
                    );
                }
            }
            return null;
        };

        res.title =
            doc
                .querySelector<HTMLElement>('.heada__title span[data-type="page-header-title"]')
                ?.innerText.trim() ||
            doc.querySelector<HTMLElement>('.page-title h1')?.innerText.trim() ||
            doc.title.split('-')[0].trim();

        res.category =
            doc
                .querySelector<HTMLElement>(MOSTAQL_SELECTORS.project.remoteCategoryBreadcrumb)
                ?.innerText.trim() ||
            doc
                .querySelector<HTMLElement>(MOSTAQL_SELECTORS.project.remoteCategoryFallback)
                ?.innerText.trim();

        res.status =
            getMetaValue('حالة المشروع') ||
            doc
                .querySelector<HTMLElement>(MOSTAQL_SELECTORS.project.remoteStatus)
                ?.innerText.trim()
                .replace(/\s+/g, ' ');
        res.budget = getMetaValue('الميزانية') ?? undefined;
        res.duration = getMetaValue('مدة التنفيذ') ?? undefined;
        res.publishDate =
            getMetaValue('تاريخ النشر') ||
            doc
                .querySelector<HTMLElement>(MOSTAQL_SELECTORS.project.publishTimeOnly)
                ?.innerText.trim()
                .replace(/\s+/g, ' ');
        const publishTimeEl = doc.querySelector<HTMLElement>(
            MOSTAQL_SELECTORS.project.publishTimeOnly
        );
        res.publishDatetime = publishTimeEl ? publishTimeEl.getAttribute('datetime') : null;

        const clientCard = doc.querySelector<HTMLElement>(MOSTAQL_SELECTORS.project.clientCard);
        if (clientCard) {
            const getClientVal = (label: string): string | null => {
                const trs = clientCard.querySelectorAll<HTMLElement>('tr');
                for (const tr of trs) {
                    if (tr.innerText.includes(label)) {
                        return (
                            tr
                                .querySelector<HTMLElement>('td:last-child')
                                ?.innerText.trim()
                                .replace(/\s+/g, ' ') ?? null
                        );
                    }
                }
                return null;
            };
            res.clientName =
                clientCard.querySelector<HTMLElement>('.profile__name')?.innerText.trim() ||
                clientCard.querySelector<HTMLElement>('h3, h4')?.innerText.trim();
            res.hiringRate = getClientVal('معدل التوظيف') ?? undefined;
            res.clientJoined = getClientVal('تاريخ التسجيل') ?? undefined;
            res.openProjects = getClientVal('المشاريع المفتوحة') ?? undefined;
            res.underwayProjects = getClientVal('مشاريع قيد التنفيذ') ?? undefined;
            res.ongoingCommunications = getClientVal('التواصلات الجارية');
            const specEl = clientCard.querySelector<HTMLElement>(
                MOSTAQL_SELECTORS.project.clientType
            );
            if (specEl) {
                res.clientTitle = specEl.innerText.trim();
            }
        }

        const container = queryFirst<HTMLElement>(doc, MOSTAQL_SELECTORS.project.detailContainers);
        let fullDesc = '';
        if (container) {
            const mainText = container.querySelector<HTMLElement>(
                MOSTAQL_SELECTORS.project.detailMain
            );
            if (mainText) {
                fullDesc += mainText.innerText.trim() + '\n\n';
            }
            const detailRows = container.querySelectorAll<HTMLElement>(
                MOSTAQL_SELECTORS.project.detailRows
            );
            detailRows.forEach((row) => {
                const label = row
                    .querySelector(MOSTAQL_SELECTORS.project.detailLabel)
                    ?.textContent.trim();
                const value = row
                    .querySelector(MOSTAQL_SELECTORS.project.detailValue)
                    ?.textContent.trim();
                if (label && value && label !== value) {
                    fullDesc += `${label}: ${value}\n`;
                }
            });
            if (!fullDesc.trim()) {
                fullDesc = container.innerText.trim();
            }
        }
        res.description = fullDesc.trim() || 'تعذر العثور على وصف تفصيلي.';

        res.attachments = Array.from(
            doc.querySelectorAll<HTMLAnchorElement>(MOSTAQL_SELECTORS.project.attachments)
        )
            .map((a): ProjectAttachment | null => {
                const attachmentUrl = resolveMostaqlUrl(a.getAttribute('href'), projectUrl);

                if (!attachmentUrl) {
                    return null;
                }

                return {
                    url: attachmentUrl,
                    name: a.getAttribute('title') || a.innerText.trim(),
                };
            })
            .filter((attachment): attachment is ProjectAttachment => attachment !== null);

        const bids: MostaqlBidDetails[] = [];
        res.bids = bids;
        const bidElements = doc.querySelectorAll<HTMLElement>(MOSTAQL_SELECTORS.project.bids);

        const formatDiff = (start: string | null, end: string | null): string | null => {
            if (!start || !end) {
                return null;
            }
            const d1 = new Date(start.replace(' ', 'T'));
            const d2 = new Date(end.replace(' ', 'T'));
            const diffMs = d2.getTime() - d1.getTime();
            if (diffMs < 0) {
                return 'مباشرة';
            }
            const diffMins = Math.floor(diffMs / 60000);
            if (diffMins < 60) {
                return `بعد ${diffMins} دقيقة`;
            }
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) {
                return `بعد ${diffHours} ساعة`;
            }
            const diffDays = Math.floor(diffHours / 24);
            return `بعد ${diffDays} يوم`;
        };

        bidElements.forEach((bid) => {
            const bidderNameEl = bid.querySelector<HTMLElement>(
                MOSTAQL_SELECTORS.project.bidderName
            );
            const bidderLinkEl = bid.querySelector<HTMLAnchorElement>(
                MOSTAQL_SELECTORS.project.bidderLink
            );
            const bidderTitleEl = bid.querySelector<HTMLElement>(
                MOSTAQL_SELECTORS.project.bidderTitle
            );
            const bidTimeEl = bid.querySelector<HTMLElement>(MOSTAQL_SELECTORS.project.bidTime);
            const bidContentEl = bid.querySelector<HTMLElement>(
                MOSTAQL_SELECTORS.project.bidContent
            );
            const bidTime = bidTimeEl ? bidTimeEl.getAttribute('datetime') : null;
            bids.push({
                name: bidderNameEl ? bidderNameEl.innerText.trim() : 'مجهول',
                link: resolveMostaqlUrl(bidderLinkEl?.getAttribute('href'), projectUrl) ?? '#',
                title: bidderTitleEl ? bidderTitleEl.innerText.trim() : '',
                timeRaw: bidTime,
                timeText: bidTimeEl ? bidTimeEl.innerText.trim() : '',
                timeOffset: formatDiff(res.publishDatetime ?? null, bidTime),
                content: bidContentEl ? bidContentEl.innerText.trim() : '',
            });
        });

        return res;
    } catch (err) {
        console.error('Deep fetch failed:', err);
        return null;
    }
}

export async function extractProjectDetailsFull(): Promise<{
    text: string;
    data: MostaqlProjectDetailsData;
} | null> {
    try {
        let data: MostaqlProjectDetailsData = extractProjectData();
        let description = '';

        const projectLinkSelectors = [
            'body > div.wrapper.hsoub-container > div > div.page-body > div > div.page-title > div:nth-child(2) > div > div > div > div > a',
            "a[href*='/project/']",
            ".page-title a[href*='/project/']",
        ];

        let projectLinkEl: HTMLAnchorElement | null = null;
        for (const sel of projectLinkSelectors) {
            projectLinkEl = document.querySelector<HTMLAnchorElement>(sel);
            if (
                resolveMostaqlProjectUrl(projectLinkEl?.getAttribute('href'), window.location.href)
            ) {
                break;
            }
        }

        const projectUrl = projectLinkEl
            ? resolveMostaqlProjectUrl(projectLinkEl.getAttribute('href'), window.location.href)
            : null;

        if (projectUrl) {
            const externalData = await fetchDeepProjectData(projectUrl);
            if (externalData) {
                description = externalData.description ?? '';
                data = { ...data, ...externalData };
            }
        }

        if (!description) {
            description = getProjectDescription();
        }

        const allTags = new Set<string>();
        if (data.tags) {
            data.tags.split(',').forEach((t: string) => {
                const cleaned = t.trim();
                if (cleaned && cleaned !== 'null') {
                    allTags.add(cleaned);
                }
            });
        }
        data.tagsList = Array.from(allTags);
        data.description = description || 'تعذر العثور على وصف تفصيلي.';

        if (!data.bids) {
            const bids: MostaqlBidDetails[] = [];
            data.bids = bids;
            const bidElements = document.querySelectorAll<HTMLElement>(
                MOSTAQL_SELECTORS.project.bids
            );
            if (bidElements.length > 0) {
                bidElements.forEach((bid) => {
                    const bidderNameEl = bid.querySelector<HTMLElement>(
                        MOSTAQL_SELECTORS.project.bidderName
                    );
                    const bidderLinkEl = bid.querySelector<HTMLAnchorElement>(
                        MOSTAQL_SELECTORS.project.bidderLink
                    );
                    const bidderTitleEl = bid.querySelector<HTMLElement>(
                        MOSTAQL_SELECTORS.project.bidderTitle
                    );
                    const bidTimeEl = bid.querySelector<HTMLElement>(
                        MOSTAQL_SELECTORS.project.bidTime
                    );
                    const bidContentEl = bid.querySelector<HTMLElement>(
                        MOSTAQL_SELECTORS.project.bidContent
                    );
                    const bidTime = bidTimeEl ? bidTimeEl.getAttribute('datetime') : null;
                    bids.push({
                        name: bidderNameEl ? bidderNameEl.innerText.trim() : 'مجهول',
                        link:
                            resolveMostaqlUrl(
                                bidderLinkEl?.getAttribute('href'),
                                window.location.href
                            ) ?? '#',
                        title: bidderTitleEl ? bidderTitleEl.innerText.trim() : '',
                        timeRaw: bidTime,
                        timeText: bidTimeEl ? bidTimeEl.innerText.trim() : '',
                        timeOffset: null,
                        content: bidContentEl ? bidContentEl.innerText.trim() : '',
                    });
                });
            }
        }

        let output = `تفاصيل المشروع:\n`;
        output += `العنوان: ${data.title}\n`;
        output += `الرابط: ${data.url}\n`;
        output += `الحالة: ${data.status}\n`;
        output += `الميزانية: ${data.budget}\n`;
        output += `مدة التنفيذ: ${data.duration}\n`;
        if (data.category && data.category !== 'غير معروف' && data.category !== 'Unknown') {
            output += `القسم: ${data.category}\n`;
        }
        output += `الوسوم: ${data.tagsList.join(', ')}\n\n`;
        output += `معلومات صاحب العمل:\n`;
        output += `الاسم: ${data.clientName}\n`;
        if (data.clientTitle) {
            output += `الدور/التخصص: ${data.clientTitle}\n`;
        }
        output += `معدل التوظيف: ${data.hiringRate || 'غير معروف'}\n`;
        output += `تاريخ التسجيل: ${data.clientJoined || 'غير معروف'}\n`;
        output += `المشاريع المفتوحة: ${data.openProjects || '0'}\n`;
        output += `مشاريع قيد التنفيذ: ${data.underwayProjects || '0'}\n`;
        output += `التواصلات الجارية: ${data.ongoingCommunications || '0'}\n\n`;
        output += `وصف المشروع:\n${data.description}\n\n`;

        return { text: output, data: data };
    } catch (e) {
        console.error('Error extracting project details:', e);
        return null;
    }
}

export function extractMyProposalFull(
    externalProjectData: MostaqlProjectDetailsData | null = null
): { text: string; data: MostaqlMyProposalData } | null {
    try {
        const myName =
            queryFirst<HTMLElement>(
                document,
                MOSTAQL_SELECTORS.project.currentUserCandidates
            )?.innerText.trim() || 'غير معروف';

        if (externalProjectData && externalProjectData.bids) {
            const myBid = externalProjectData.bids.find((bid) => bid.name.includes(myName));
            if (myBid) {
                const data: MostaqlMyProposalData = {
                    bidderName: myBid.name,
                    price: externalProjectData.budget || '-',
                    duration: externalProjectData.duration || '-',
                    content: myBid.content || 'نص العرض غير متوفر',
                    attachments: [],
                };
                const output = `عرضي الخاص (تم العثور عليه من صفحة المشروع):\nالمتقدم: ${data.bidderName}\nنص العرض:\n${data.content}\n`;
                return { text: output, data: data };
            }
        }

        const bidTab = document.querySelector<HTMLElement>(MOSTAQL_SELECTORS.project.bidTab);
        const targetProposal =
            bidTab?.querySelector<HTMLElement>('.bid') ||
            queryFirst<HTMLElement>(document, MOSTAQL_SELECTORS.project.proposalCandidates);

        if (!targetProposal) {
            return null;
        }

        const nameNode = targetProposal
            .querySelector<HTMLElement>(MOSTAQL_SELECTORS.project.proposalProfileName)
            ?.cloneNode(true) as HTMLElement | null;
        if (nameNode) {
            const extra = nameNode.querySelector<HTMLElement>(
                MOSTAQL_SELECTORS.project.proposalProfileNameExtras
            );
            if (extra) {
                extra.remove();
            }
        }
        const name = nameNode ? nameNode.innerText.trim() : 'غير معروف';

        let price = '';
        let duration = '';

        const metaCols = targetProposal.querySelectorAll<HTMLElement>(
            MOSTAQL_SELECTORS.project.proposalMetaColumns
        );
        metaCols.forEach((col) => {
            const title = col
                .querySelector<HTMLElement>(MOSTAQL_SELECTORS.project.proposalMetaTitle)
                ?.innerText.trim();
            const contentEl = col
                .querySelector<HTMLElement>(MOSTAQL_SELECTORS.project.proposalMetaContent)
                ?.cloneNode(true) as HTMLElement | null;
            if (contentEl) {
                const hidden = contentEl.querySelectorAll<HTMLElement>(
                    MOSTAQL_SELECTORS.project.proposalMetaHidden
                );
                hidden.forEach((h) => h.remove());
            }
            const content = contentEl ? contentEl.innerText.trim().replace(/\s+/g, ' ') : '';
            if (title && content) {
                if (title.includes('المبلغ')) {
                    price = content;
                } else if (title.includes('التنفيذ')) {
                    duration = content;
                }
            }
        });

        const contentEl =
            targetProposal.querySelector<HTMLElement>(
                MOSTAQL_SELECTORS.project.proposalTextCandidates[0]
            ) ||
            targetProposal.querySelector<HTMLElement>(
                MOSTAQL_SELECTORS.project.proposalTextCandidates[1]
            );
        let content = contentEl ? contentEl.innerText.trim() : '';
        content = content.replace('... عرض المزيد', '').replace('عرض أقل', '').trim();

        const data: MostaqlMyProposalData = {
            bidderName: name,
            price: price,
            duration: duration,
            content: content || 'نص العرض غير متوفر',
            attachments: Array.from(
                targetProposal.querySelectorAll<HTMLAnchorElement>(
                    MOSTAQL_SELECTORS.project.proposalAttachments
                )
            )
                .map((a): ProjectAttachment | null => {
                    const attachmentUrl = resolveMostaqlUrl(
                        a.getAttribute('href'),
                        window.location.href
                    );

                    if (!attachmentUrl) {
                        return null;
                    }

                    return {
                        url: attachmentUrl,
                        name: a.getAttribute('title') || a.innerText.trim(),
                    };
                })
                .filter((attachment): attachment is ProjectAttachment => attachment !== null),
        };

        const output = `عرضي الخاص:\nالمتقدم: ${name}\nالمبلغ: ${price}\nمدة التنفيذ: ${duration}\n\nنص العرض:\n${data.content}\n`;
        return { text: output, data: data };
    } catch (e) {
        console.error('Error extracting my proposal:', e);
        return null;
    }
}
