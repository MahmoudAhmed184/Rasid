export const MOSTAQL_SELECTORS = {
    sidebar: {
        metaPanel: '#project-meta-panel',
        separator: '.mostaql-ext-separator',
        buttonContainerId: 'mostaql-ext-btn-container',
        promptGroupId: 'chatgpt-group',
    },
    project: {
        statusLabel:
            '.label-prj-open, .label-prj-closed, .label-prj-completed, .label-prj-cancelled, .label-prj-underway, .label-prj-processing',
        metaRows: '.meta-row, .table-meta tr, .card .table tr, li.meta-item',
        metaLabel: '.meta-label, td:first-child, .meta-item-label',
        metaValue: '.meta-value, td:last-child, .meta-item-value',
        budget: '[data-type="project-budget_range"], #project-meta-panel .meta-value[data-type="project-budget_range"]',
        budgetOnly: '[data-type="project-budget_range"]',
        publishTime: 'time[itemprop="datePublished"], #project-meta-panel time',
        publishTimeOnly: 'time[itemprop="datePublished"]',
        metaTags: '#project-meta-panel .tag',
        clientName: '.profile__name bdi',
        category: '.breadcrumb-item[data-index="2"]',
        clientCard: '.profile_card',
        clientRows: '.table-meta tr',
        clientType: '.meta_items li',
        tags: '.skills .tag, .tags .tag, .project-tags .tag',
        titleCandidates: [
            '.heada__title span[data-type="page-header-title"]',
            '.page-title h1',
            '.project-title',
        ],
        attachments: '#projectDetailsTab #project-files-panel .attachment a[href]',
        detailContainers: ['#projectDetailsTab', '#project-brief'],
        detailMain: '.carda__content, .text-wrapper-div:not(.field-label)',
        detailRows: '.pdn--ts, .row > div',
        detailLabel: '.field-label',
        detailValue: '.text-wrapper-div:not(.field-label)',
        remoteTags: '.tag, .skills__item bdi',
        remoteCategoryBreadcrumb: '.breadcrumb li:nth-last-child(2) a',
        remoteCategoryFallback: '.project-header__meta a',
        remoteStatus: '.project-header .label',
        bids: '#project-bids .bid',
        bidderName: '.profile__name bdi',
        bidderLink: '.profile__name a',
        bidderTitle: '.bid__meta .title',
        bidTime: '.bid__meta .time time',
        bidContent: '.bid__details .text-wrapper-div',
        currentUserCandidates: ['.user-menu__name', '#user-menu bdi'],
        bidTab: '#bidTab',
        proposalCandidates: ['.proposal-item', '.card-proposal', '.bid'],
        proposalProfileName: '.profile__name',
        proposalProfileNameExtras: '.dropdown, .btn, .dropdown-toggle-default-sm',
        proposalMetaColumns: '.vertical-meta-column',
        proposalMetaTitle: '.meta-title',
        proposalMetaContent: '.meta-content',
        proposalMetaHidden: '.hide, style, script, input',
        proposalTextCandidates: ['.bid__details .text-wrapper-div', '.text-wrapper-div'],
        proposalAttachments: '#bid-attachments .attachment a[href]',
    },
    autofill: {
        amountInputs: ['input[name="cost"]', 'input[name="amount"]', '#bid__cost', '#amount'],
        durationInputs: [
            'input[name="period"]',
            'input[name="duration"]',
            '#bid__period',
            '#duration',
        ],
        proposalTextareas: [
            '#bid__details',
            '#description',
            'textarea[name="details"]',
            'textarea[name="description"]',
            '#proposal-description',
        ],
        formCandidates: ['#add-proposal-form'],
    },
    messages: {
        metaPanel: '#message-meta',
        items: "#chat-root [id^='message-'], .message-item",
        senderName: '.metas-title',
        time: 'time',
        avatarCandidates: ['img.uavatar', 'img:not([class="meta-icon"])'],
        content: '.content, .text-wrapper-div',
        fileLinks: 'a[href*="/file/"]',
        imageLinks: '.single-image-container a[href]',
    },
    home: {
        target: '#project-states',
        disabledBidLinks: [
            'https://mostaql.com/dashboard/bids?status=processing',
            'https://mostaql.com/dashboard/bids?status=lost',
        ],
        hiddenProgressLabels: ['.label-prj-completed', '.label-prj-lost'],
    },
    profile: {
        targets: ['.profile_card', '#profile-sidebar'],
    },
} as const;

export function queryFirst<T extends Element>(
    root: ParentNode,
    selectors: readonly string[]
): T | null {
    for (const selector of selectors) {
        const element = root.querySelector(selector);

        if (element instanceof Element) {
            return element as T;
        }
    }

    return null;
}
