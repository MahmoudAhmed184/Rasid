import { t, getDirection, type AppLanguage } from '../../shared/i18n';

export function applyDashboardTranslations(root: Document, lang: AppLanguage): void {
    if (root.documentElement) {
        root.documentElement.lang = lang;
        root.documentElement.dir = getDirection(lang);
    }

    root.title = t('app.dashboard_title');

    const findEl = (selectorOrId: string): HTMLElement | null => {
        if (
            selectorOrId.startsWith('#') ||
            selectorOrId.startsWith('.') ||
            selectorOrId.includes('[') ||
            selectorOrId.includes(' ') ||
            selectorOrId.includes('>') ||
            selectorOrId.includes(':')
        ) {
            return root.querySelector<HTMLElement>(selectorOrId);
        }
        return root.getElementById(selectorOrId) ?? root.querySelector<HTMLElement>(selectorOrId);
    };

    const setText = (selectorOrId: string, text: string) => {
        const el = findEl(selectorOrId);
        if (el) {
            el.textContent = text;
        }
    };

    const setButtonContent = (selectorOrId: string, iconClass: string, text: string) => {
        const el = findEl(selectorOrId);
        if (el) {
            el.replaceChildren();
            const icon = root.createElement('i');
            icon.className = iconClass;
            el.appendChild(icon);
            el.appendChild(root.createTextNode(` ${text}`));
        }
    };

    const setAttr = (selectorOrId: string, attr: string, value: string) => {
        const el = findEl(selectorOrId);
        if (el) {
            el.setAttribute(attr, value);
        }
    };

    // Sidebar
    setText('.logo-text h1', t('app.name'));
    setText('.logo-text span', t('app.tagline'));
    setText('#overview-tab-button span', t('dashboard.nav.overview'));
    setText('#bids-tracker-tab-button span', t('dashboard.nav.bids'));
    setText('#filters-tab-button span', t('dashboard.nav.filters'));
    setText('#prompts-tab-button span', t('dashboard.nav.prompts'));
    setText('#proposals-tab-button span', t('dashboard.nav.proposals'));
    setText('#settings-tab-button span', t('dashboard.nav.settings'));
    setText('#systemToggleLabel', t('dashboard.monitoring_status'));
    setText('#langToggleText', lang === 'ar' ? 'English' : 'عربي');

    // Overview Tab
    setText('#overview-tab .header-title h2', t('overview.title'));
    setText('#overview-tab .header-title p', t('overview.subtitle'));
    setText('#overview-stat-today-label', t('overview.stat.today'));
    setText('#overview-stat-total-label', t('overview.stat.tracked'));
    setText('#overview-stat-last-time-label', t('overview.stat.last_check'));
    setText('#overview-stat-connection-label', t('overview.stat.connection'));
    setText('#overview-recent-heading', t('overview.recent_projects'));

    // Bids Tab
    const bidsTitleEl = findEl('#bids-tracker-tab .header-title h2');
    if (bidsTitleEl) {
        bidsTitleEl.replaceChildren();
        bidsTitleEl.appendChild(root.createTextNode(`${t('bids.title')} `));
        const periodSpan = root.createElement('span');
        periodSpan.className = 'bids-tracker-period';
        periodSpan.textContent = t('bids.stat.total_30d');
        bidsTitleEl.appendChild(periodSpan);
    }
    setText('#bids-tracker-tab .header-title p', t('bids.subtitle'));
    setButtonContent('#refreshBidsBtn', 'fas fa-sync-alt', t('bids.refresh'));
    setText('#bids-stat-30d-label', t('bids.stat.total_30d'));
    setText('#bids-stat-available-label', t('bids.stat.available'));
    setText('#bids-stat-next-label', t('bids.stat.next_bid'));
    setText('#bids-stat-today-label', t('bids.stat.today'));

    const bidsStatusHeading = findEl('#bidsStatusHeading');
    if (bidsStatusHeading) {
        bidsStatusHeading.replaceChildren();
        bidsStatusHeading.appendChild(root.createTextNode(`${t('bids.status_breakdown')} `));
        const subSpan = root.createElement('span');
        subSpan.className = 'bids-tracker-sub';
        subSpan.textContent = t('bids.stat.total_30d');
        bidsStatusHeading.appendChild(subSpan);
    }
    setText('#bidsTimelineHeading', t('bids.timeline'));

    // Filters Tab
    setText('#filters-tab .header-title h2', t('filters.title'));
    setText('#filters-tab .header-title p', t('filters.subtitle'));
    setText('#keywordsHeading', t('filters.keywords'));
    setText('label[for="keywordsInclude"]', t('filters.include_label'));
    setAttr('#keywordsInclude', 'placeholder', t('filters.include_placeholder'));
    setText('#keywordsIncludeHelp', t('filters.keywords_desc'));
    setText('label[for="keywordsExclude"]', t('filters.exclude_label'));
    setAttr('#keywordsExclude', 'placeholder', t('filters.exclude_placeholder'));
    setText('#keywordsExcludeHelp', t('filters.exclude_desc'));
    setText('#financialHeading', t('filters.financial'));
    setText('label[for="minBudget"]', t('filters.min_budget'));
    setText('label[for="minHiringRate"]', t('filters.min_hiring_rate'));
    setText('label[for="maxDuration"]', t('filters.max_duration'));
    setText('#platformsHeading', t('filters.platforms'));
    setText('#platform-mostaql-label', t('filters.mostaql'));
    setText('#platform-khamsat-label', t('filters.khamsat'));
    setText('#platform-nafezly-label', t('filters.nafezly'));
    setText('#platformsHelp', t('filters.platforms_desc'));
    setText('#categoriesHeading', t('filters.categories'));
    setText('#cat-development-label', t('filters.cat_dev'));
    setText('#cat-ai-label', t('filters.cat_ai'));
    setText('#cat-all-label', t('filters.cat_all'));
    setText('#categoriesHelp', t('filters.categories_desc'));

    // Prompts Tab
    setText('#prompts-tab .header-title h2', t('prompts.title'));
    setText('#prompts-tab .header-title p', t('prompts.subtitle'));
    setButtonContent('#addPromptBtn', 'fas fa-plus', t('prompts.add_btn'));

    // Proposals Tab
    setText('#proposals-tab .header-title h2', t('proposals.title'));
    setText('#proposals-tab .header-title p', t('proposals.subtitle'));
    setText('label[for="proposalTemplate"]', t('proposals.quick_template_label'));
    setText('#proposalTemplateHelp', t('proposals.quick_template_help'));

    // Settings Tab
    setText('#settings-tab .header-title h2', t('settings.title'));
    setText('#settings-tab .header-title p', t('settings.subtitle'));
    setText('#settingsLanguageHeading', t('settings.language_section'));
    setText('#settingsLanguageLabel', t('settings.language_label'));
    setText('#settingsLanguageHelp', t('settings.language_desc'));
    setText('#aiSectionHeading', t('settings.ai_config'));
    setText('label[for="aiExecutionMode"]', t('settings.ai_mode'));
    setText('option[value="bridge"]', t('settings.ai_mode_bridge'));

    const aiHelpEl = findEl('#aiExecutionModeHelp');
    if (aiHelpEl) {
        aiHelpEl.replaceChildren();
        const strong = root.createElement('strong');
        strong.textContent = 'Bridge: ';
        aiHelpEl.appendChild(strong);
        aiHelpEl.appendChild(
            root.createTextNode(
                lang === 'ar'
                    ? 'يرسل القالب إلى صفحة الشات التي تختارها أنت.'
                    : 'Sends the template to the chat page you choose.'
            )
        );
    }

    setText('label[for="aiChatUrl"]', t('settings.ai_chat_url'));
    setText(
        '#aiChatUrlHelp',
        lang === 'ar'
            ? 'يُقبل فقط روابط ChatGPT على chatgpt.com أو chat.openai.com.'
            : 'Only ChatGPT links on chatgpt.com or chat.openai.com are accepted.'
    );
    setButtonContent(
        '#grantChatGptPermissionBtn',
        'fas fa-shield-alt',
        t('settings.grant_chatgpt_permission')
    );
    setText('label[for="checkInterval"]', t('settings.interval_label'));
    setText(
        '#checkIntervalHelp',
        lang === 'ar'
            ? 'عدد الدقائق بين كل عملية فحص للمشاريع الجديدة.'
            : 'Number of minutes between checks for new projects.'
    );
    setText('#notificationModeHeading', t('settings.notification_mode'));
    setText('label[for="notificationMode"]', t('settings.notification_mode'));
    setText('option[value="auto"]', t('settings.mode_auto'));
    setText('option[value="signalr"]', t('settings.mode_signalr'));
    setText('option[value="polling"]', t('settings.mode_polling'));

    const notifHelpEl = findEl('#notificationModeHelp');
    if (notifHelpEl) {
        notifHelpEl.replaceChildren();
        const items =
            lang === 'ar'
                ? [
                      [
                          'تلقائي: ',
                          'يبدأ بالاتصال المباشر، ويتحول للاستعلام تلقائياً عند انقطاع السيرفر.',
                      ],
                      ['اتصال مباشر: ', 'إشعارات فورية عبر السيرفر.'],
                      ['استعلام دوري: ', 'يفحص الموقع كل فترة زمنية محددة.'],
                  ]
                : [
                      [
                          'Auto: ',
                          'Starts with direct connection, falls back to polling if disconnected.',
                      ],
                      ['Direct: ', 'Real-time alerts via server.'],
                      ['Polling: ', 'Checks marketplace at fixed intervals.'],
                  ];
        items.forEach(([title, desc], idx) => {
            if (idx > 0) {
                notifHelpEl.appendChild(root.createElement('br'));
            }
            const strong = root.createElement('strong');
            strong.textContent = title;
            notifHelpEl.appendChild(strong);
            notifHelpEl.appendChild(root.createTextNode(desc));
        });
    }

    setText('#quietHoursHeading', t('settings.quiet_hours'));
    setText('#quietHoursEnabledLabel', t('settings.quiet_hours'));
    setText('label[for="quietHoursStart"]', t('settings.quiet_from'));
    setText('label[for="quietHoursEnd"]', t('settings.quiet_to'));
    setText('#diagnosticsHeading', t('settings.diagnostics'));
    setButtonContent('#testNotificationBtn', 'fas fa-bell', t('settings.test_notification'));
    setButtonContent('#testSoundBtn', 'fas fa-volume-up', t('settings.test_sound'));
    setText('#diagnosticsHelp', t('settings.diagnostics_desc'));
    setText('#backupHeading', t('settings.backup'));
    setButtonContent('#exportBackupBtn', 'fas fa-download', t('settings.export_data'));
    setButtonContent('#importBackupBtn', 'fas fa-upload', t('settings.import_data'));
    setText('#backupHelp', t('settings.backup_desc'));

    // Sticky Footer
    setButtonContent('#saveAllBtn', 'fas fa-save', t('dashboard.save_all'));

    // Modal
    setText('#modalTitle', t('prompts.modal_add_title'));
    setText('#promptModalDescription', t('prompts.modal_desc'));
    setText('label[for="promptTitle"]', t('prompts.prompt_title_label'));
    setAttr('#promptTitle', 'placeholder', t('prompts.prompt_title_placeholder'));
    setText('label[for="promptContent"]', t('prompts.prompt_content_label'));
    setAttr('#promptContent', 'placeholder', t('prompts.prompt_content_placeholder'));
    setText('#closeModalBtn', t('common.cancel'));
    setText('#confirmSavePrompt', t('prompts.save_btn'));
}
