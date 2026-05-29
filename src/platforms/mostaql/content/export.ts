import { browser } from 'wxt/browser';

import { resolvePlatformUrl } from '../../../entities/platform/url';
import type { PlatformContentServices } from '../../contracts';
import type { MostaqlBidDetails, MostaqlMyProposalData, MostaqlProjectDetailsData } from './data';
import { MOSTAQL_SELECTORS, queryFirst } from '../selectors';
import { extractMyProposalFull, extractProjectDetailsFull } from './data';

// ==========================================
// mostaql/export.js — Export buttons and export engine
// ==========================================

const browserApi = browser;
const MOSTAQL_HOSTS = ['mostaql.com'] as const;
const MOSTAQL_BASE_URL = 'https://mostaql.com/';

type DownloadServices = PlatformContentServices['downloads'];

type Attachment = {
    url: string;
    name: string;
    localPath?: string | null;
};

type ChatMessage = {
    senderName: string;
    isUs: boolean;
    text: string;
    time: string;
    avatar: string | null;
    attachments: Attachment[];
};

const EXPORT_ICON_SHIM_CSS = `
            .fa {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 1em;
                line-height: 1;
                font-style: normal;
                font-weight: 700;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif;
                vertical-align: -0.125em;
            }
            .fa::before {
                display: inline-block;
                line-height: 1;
                text-align: center;
            }
            .fa-3x {
                font-size: 3em;
            }
            .fa-user-circle::before {
                content: "\\1F464";
            }
            .fa-paperclip::before {
                content: "\\1F4CE";
            }
            .fa-file-pdf-o::before {
                content: "PDF";
                font-size: 0.5em;
                letter-spacing: 0.04em;
            }
`;

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

function setExportButtonContent(
    button: HTMLButtonElement,
    iconClassName: string,
    label: string,
    useActionText = false
): void {
    if (useActionText) {
        button.replaceChildren(
            createIcon(iconClassName),
            document.createTextNode(' '),
            createActionText(label)
        );
        return;
    }

    button.replaceChildren(createIcon(iconClassName), document.createTextNode(` ${label}`));
}

function setExportButtonLoadingState(button: HTMLButtonElement): void {
    button.replaceChildren(createIcon('fa fa-spinner fa-spin'));
}

function getFilenameFromUrl(urlStr: string): string {
    try {
        const u = new URL(urlStr);
        const parts = u.pathname.split('/');
        return parts.pop() || 'media_file';
    } catch {
        return 'media_file';
    }
}

function sanitizeFile(name: string | null | undefined, fallback: string): string {
    if (!name) {
        return fallback;
    }
    return name.replace(/[^\u0600-\u06FFa-zA-Z0-9.\-_ ]/g, '_').trim() || fallback;
}

function toDisplayText(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value);
    }

    return '';
}

function escapeHtml(value: unknown): string {
    return toDisplayText(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeHtmlValue(value: unknown, fallback = '-'): string {
    const text = toDisplayText(value).trim();
    return escapeHtml(text || fallback);
}

function resolveMostaqlExportUrl(value: string | null | undefined): string | null {
    return resolvePlatformUrl(value, {
        baseUrl: window.location.href || MOSTAQL_BASE_URL,
        allowedHosts: MOSTAQL_HOSTS,
    });
}

function isSafeLocalAssetPath(value: string | null | undefined): value is string {
    if (!value || value.startsWith('/') || value.includes('\\') || value.includes(':')) {
        return false;
    }

    return value
        .split('/')
        .every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function resolveReportAssetUrl(
    localPath: string | null | undefined,
    remoteUrl: string
): string | null {
    if (isSafeLocalAssetPath(localPath)) {
        return localPath;
    }

    return resolveMostaqlExportUrl(remoteUrl);
}

export function injectMessageExporter(downloads: DownloadServices) {
    const targetPanel = document.querySelector(MOSTAQL_SELECTORS.messages.metaPanel);
    if (!targetPanel) {
        return;
    }

    if (document.getElementById('mostaql-export-chat-btn')) {
        return;
    }

    const btn = document.createElement('button');
    btn.id = 'mostaql-export-chat-btn';
    btn.className = 'btn btn-primary btn-block';
    btn.style.marginTop = '15px';
    btn.style.marginBottom = '15px';
    setExportButtonContent(btn, 'fa fa-download', 'تصدير');
    btn.title = '';

    let clickCount = 0;
    let clickTimer: ReturnType<typeof setTimeout> | null = null;

    btn.addEventListener('click', () => {
        void (async () => {
            clickCount++;
            if (clickTimer) {
                clearTimeout(clickTimer);
            }

            if (clickCount >= 2) {
                clickCount = 0;
                const originalStyle = { opacity: btn.style.opacity, bg: btn.style.backgroundColor };

                btn.disabled = true;
                btn.style.opacity = '1';
                btn.style.backgroundColor = '#2386c8';
                setExportButtonLoadingState(btn);

                try {
                    await executeExportAll(downloads);
                } finally {
                    btn.disabled = false;
                    btn.style.opacity = originalStyle.opacity;
                    btn.style.backgroundColor = originalStyle.bg;
                    setExportButtonContent(btn, 'fa fa-download', 'تصدير');
                }
            } else {
                clickTimer = setTimeout(() => {
                    clickCount = 0;
                }, 600);
            }
        })();
    });

    targetPanel.after(btn);
}

export function injectProjectExporter(downloads: DownloadServices) {
    const buttonContainer = document.getElementById('mostaql-ext-btn-container');
    if (!buttonContainer) {
        return;
    }

    if (document.getElementById('mostaql-export-project-btn')) {
        return;
    }

    const btn = document.createElement('button');
    btn.id = 'mostaql-export-project-btn';
    btn.className = 'btn btn-primary';
    btn.style.marginRight = '8px';
    setExportButtonContent(btn, 'fa fa-download', 'تصدير', true);
    btn.title = '';

    let clickCount = 0;
    let clickTimer: ReturnType<typeof setTimeout> | null = null;

    btn.addEventListener('click', () => {
        void (async () => {
            clickCount++;
            if (clickTimer) {
                clearTimeout(clickTimer);
            }

            if (clickCount >= 2) {
                clickCount = 0;
                const originalStyle = { opacity: btn.style.opacity, bg: btn.style.backgroundColor };

                btn.disabled = true;
                btn.style.opacity = '1';
                btn.style.backgroundColor = '#2386c8';
                setExportButtonLoadingState(btn);

                try {
                    await executeExportAll(downloads);
                } finally {
                    btn.disabled = false;
                    btn.style.opacity = originalStyle.opacity;
                    btn.style.backgroundColor = originalStyle.bg;
                    setExportButtonContent(btn, 'fa fa-download', 'تصدير', true);
                }
            } else {
                clickTimer = setTimeout(() => {
                    clickCount = 0;
                }, 600);
            }
        })();
    });

    buttonContainer.appendChild(btn);
}

async function executeExportAll(downloads: DownloadServices): Promise<void> {
    const messages = document.querySelectorAll<HTMLElement>(MOSTAQL_SELECTORS.messages.items);

    let chatData: ChatMessage[] = [];
    let textOutput = 'تصدير محادثة مستقل (بالتاريخ)\n\n';
    let textOutputNoTime = 'تصدير محادثة مستقل (بدون تاريخ)\n\n';
    const mediaUrls: Attachment[] = [];

    if (messages.length > 0) {
        const firstMsgNameEl = messages[0].querySelector<HTMLElement>(
            MOSTAQL_SELECTORS.messages.senderName
        );
        const firstSenderName = firstMsgNameEl ? firstMsgNameEl.innerText.trim() : 'Other';

        let lastKnownSender: { name: string; isUs: boolean; avatar: string | null } = {
            name: firstSenderName,
            isUs: false,
            avatar: null,
        };

        messages.forEach((msg) => {
            const nameEl = msg.querySelector<HTMLElement>(MOSTAQL_SELECTORS.messages.senderName);
            const timeEl = msg.querySelector<HTMLElement>(MOSTAQL_SELECTORS.messages.time);
            const avatarEl = queryFirst<HTMLImageElement>(
                msg,
                MOSTAQL_SELECTORS.messages.avatarCandidates
            );

            const currentName = nameEl ? nameEl.innerText.trim() : null;
            const currentTime = timeEl
                ? timeEl.getAttribute('title') || timeEl.innerText.trim()
                : null;
            const currentAvatar = avatarEl
                ? resolveMostaqlExportUrl(avatarEl.getAttribute('src') || avatarEl.src)
                : null;

            let isUs, senderName, displayAvatar;

            if (currentName) {
                isUs = currentName !== firstSenderName;
                senderName = currentName;
                displayAvatar = currentAvatar;
                lastKnownSender = { name: senderName, isUs: isUs, avatar: displayAvatar };
            } else {
                isUs = lastKnownSender.isUs;
                senderName = lastKnownSender.name;
                displayAvatar = lastKnownSender.avatar;
            }

            // Better extraction for chat messages: pick the container and ensure all text/lines are captured
            const containerEl = msg.querySelector<HTMLElement>(MOSTAQL_SELECTORS.messages.content);
            let text: string;
            if (containerEl) {
                // To avoid getting extra text like avatars or times, we look for the direct text parts
                // In Mostaql chat, messages are often multiple P tags or text with BR
                text = containerEl.innerText.trim();
            } else {
                // Fallback: collect all P tags inside the message
                const pTags = msg.querySelectorAll<HTMLElement>('p');
                if (pTags.length > 0) {
                    text = Array.from(pTags)
                        .map((p) => p.innerText.trim())
                        .join('\n');
                } else {
                    // Final fallback
                    text = msg.innerText.trim();
                }
            }

            const attachments: Attachment[] = [];

            const processLink = (linkNode: HTMLAnchorElement) => {
                const url = resolveMostaqlExportUrl(linkNode.getAttribute('href'));

                if (!url) {
                    return;
                }

                let filename = linkNode.innerText.trim();
                if (!filename || filename === '') {
                    filename = getFilenameFromUrl(url);
                }
                if (!attachments.find((a) => a.url === url)) {
                    attachments.push({ url, name: filename });
                }
                if (!mediaUrls.find((m) => m.url === url)) {
                    mediaUrls.push({ url, name: filename });
                }
            };

            msg.querySelectorAll<HTMLAnchorElement>(MOSTAQL_SELECTORS.messages.fileLinks).forEach(
                processLink
            );
            msg.querySelectorAll<HTMLAnchorElement>(MOSTAQL_SELECTORS.messages.imageLinks).forEach(
                processLink
            );

            msg.querySelectorAll<HTMLAudioElement>('audio').forEach((audio) => {
                const url = resolveMostaqlExportUrl(audio.getAttribute('src') || audio.src);
                if (url) {
                    const filename = getFilenameFromUrl(url);
                    if (!attachments.find((a) => a.url === url)) {
                        attachments.push({ url, name: filename });
                    }
                    if (!mediaUrls.find((m) => m.url === url)) {
                        mediaUrls.push({ url, name: filename });
                    }
                }
            });

            msg.querySelectorAll<HTMLVideoElement>('video').forEach((video) => {
                let bestUrl = resolveMostaqlExportUrl(video.getAttribute('src') || video.src);
                if (!bestUrl) {
                    const sources = Array.from(video.querySelectorAll<HTMLSourceElement>('source'));
                    const mp4Source = sources.find(
                        (s) =>
                            (s.type && s.type.includes('mp4')) || (s.src && s.src.includes('.mp4'))
                    );
                    const anySource = mp4Source || sources[0];
                    if (anySource && anySource.src) {
                        bestUrl = resolveMostaqlExportUrl(
                            anySource.getAttribute('src') || anySource.src
                        );
                    }
                }
                if (bestUrl) {
                    const filename = getFilenameFromUrl(bestUrl);
                    if (!attachments.find((a) => a.url === bestUrl)) {
                        attachments.push({ url: bestUrl, name: filename });
                    }
                    if (!mediaUrls.find((m) => m.url === bestUrl)) {
                        mediaUrls.push({ url: bestUrl, name: filename });
                    }
                }
            });

            if (text || attachments.length > 0) {
                chatData.push({
                    senderName,
                    isUs,
                    text,
                    time: currentTime || '',
                    avatar: displayAvatar,
                    attachments,
                });
                const attachmentsSection =
                    attachments.length > 0
                        ? `\n[مرفقات: ${attachments.map((a) => a.name).join(', ')}]`
                        : '';
                textOutput += `[${currentTime || ''}] ${senderName}:\n${text.trim()}${attachmentsSection}\n\n`;
                textOutputNoTime += `${senderName}:\n${text.trim()}${attachmentsSection}\n\n`;
            }
        });
    }

    const projectDetailsResult = await extractProjectDetailsFull();
    const myProposalResult = extractMyProposalFull(projectDetailsResult?.data);

    const projectDetailsText = projectDetailsResult?.text || '';
    const myProposalText = myProposalResult?.text || '';
    const pData: Partial<MostaqlProjectDetailsData> = projectDetailsResult?.data ?? {};
    const propData: Partial<MostaqlMyProposalData> = myProposalResult?.data ?? {};

    const projectIdMatch = window.location.pathname.match(/\/(message|project)\/(\d+)/);
    const discussionId = projectIdMatch ? projectIdMatch[2] : String(Date.now());

    let safeTitle = document.title
        ? document.title.replace(/[^\u0600-\u06FFa-zA-Z0-9 ]/gi, '_')
        : 'export';
    safeTitle = safeTitle
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 50);

    const folderName = `mostaql_export_${discussionId}_${safeTitle}`;
    const filesToZip: Array<{ name: string; content?: string; url?: string }> = [];
    const usedZipPaths = new Set();
    const registeredAssets = new Map<string, string>();

    function getUniqueZipPath(
        folder: string,
        preferredName: string | null | undefined,
        fallbackName: string
    ): string {
        const safeName = sanitizeFile(preferredName, fallbackName);
        const extensionIndex = safeName.lastIndexOf('.');
        const hasExtension = extensionIndex > 0;
        const baseName = hasExtension ? safeName.slice(0, extensionIndex) : safeName;
        const extension = hasExtension ? safeName.slice(extensionIndex) : '';

        let suffix = 0;
        let candidate = `${folder}/${safeName}`;

        while (usedZipPaths.has(candidate)) {
            suffix++;
            candidate = `${folder}/${baseName}_${suffix}${extension}`;
        }

        usedZipPaths.add(candidate);
        return candidate;
    }

    function registerZipAsset(
        folder: string,
        asset: Attachment | null | undefined,
        fallbackName: string
    ): string | null {
        if (!asset || !asset.url) {
            return null;
        }

        const assetUrl = resolveMostaqlExportUrl(asset.url);

        if (!assetUrl) {
            return null;
        }

        const assetKey = `${folder}::${assetUrl}`;
        if (registeredAssets.has(assetKey)) {
            return registeredAssets.get(assetKey) ?? null;
        }

        const preferredName = asset.name || getFilenameFromUrl(assetUrl);
        const zipPath = getUniqueZipPath(folder, preferredName, fallbackName);

        registeredAssets.set(assetKey, zipPath);
        filesToZip.push({ name: zipPath, url: assetUrl });

        return zipPath;
    }

    chatData = chatData.map((message, messageIndex) => ({
        ...message,
        attachments: message.attachments.map((attachment, attachmentIndex) => ({
            ...attachment,
            localPath: registerZipAsset(
                'chat_attachments',
                attachment,
                `chat_file_${messageIndex}_${attachmentIndex}`
            ),
        })),
    }));

    (pData.attachments || []).forEach((file: Attachment, index: number) => {
        registerZipAsset('client_attachments', file, `client_file_${index}`);
    });

    (propData.attachments || []).forEach((file: Attachment, index: number) => {
        registerZipAsset('bid_attachments', file, `bid_file_${index}`);
    });

    function renderAttachmentHtml(attachment: Attachment): string {
        const attachmentUrl = resolveReportAssetUrl(attachment.localPath, attachment.url);
        const attachmentName = attachment.name || 'مرفق';
        const safeAttachmentName = escapeHtml(attachmentName);
        const safeAttachmentUrl = attachmentUrl ? escapeHtml(attachmentUrl) : '';
        const linkAttrs =
            attachmentUrl && !isSafeLocalAssetPath(attachmentUrl)
                ? ' target="_blank" rel="noopener noreferrer"'
                : '';
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.name);
        const isAudio = /\.(mp3|wav|ogg|m4a|aac)$/i.test(attachment.name);
        const isVideo = /\.(mp4|webm|ogg)$/i.test(attachment.name);

        if (!attachmentUrl) {
            return `
                                        <div class="attachment-preview">
                                            <span class="attach-link"><i class="fa fa-paperclip"></i> ${safeAttachmentName}</span>
                                        </div>`;
        }

        return `
                                        <div class="attachment-preview">
                                            ${isImage ? `<img src="${safeAttachmentUrl}" alt="${safeAttachmentName}" loading="lazy">` : ''}
                                            ${isAudio ? `<audio controls src="${safeAttachmentUrl}" style="width: 100%; margin-top: 10px; border-radius: 8px; background: #f1f5f9;"></audio>` : ''}
                                            ${isVideo ? `<video controls src="${safeAttachmentUrl}" style="width: 100%; margin-top: 10px; border-radius: 8px; background: #000; max-height: 400px;"></video>` : ''}
                                            <a href="${safeAttachmentUrl}"${linkAttrs} class="attach-link"><i class="fa fa-paperclip"></i> ${safeAttachmentName}</a>
                                        </div>`;
    }

    const html = `
    <html dir="rtl" lang="ar">
    <head>
        <meta charset="UTF-8">
        <title>تقرير مشروع مستقل - ${escapeHtml(discussionId)}</title>
        <style>
            :root {
                --font-ui: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif;
                --primary: #2386c8;
                --primary-light: #e3f2fd;
                --text-main: #2c3e50;
                --text-muted: #7f8c8d;
                --bg-body: #f8fafc;
                --bg-card: #ffffff;
                --border-color: #e2e8f0;
                --radius: 12px;
                --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            }
            * { box-sizing: border-box; }
            body { font-family: var(--font-ui); background: var(--bg-body); padding: 40px 20px; line-height: 1.6; color: var(--text-main); margin: 0; font-size: 14px; }
            .container { max-width: 950px; margin: auto; background: var(--bg-card); padding: 40px; border-radius: var(--radius); box-shadow: var(--shadow); }
            header { text-align: center; margin-bottom: 50px; padding-bottom: 25px; border-bottom: 2px solid var(--primary-light); }
            h1 { margin: 0; color: var(--primary); font-size: 28px; font-weight: 700; }
            .date-stamp { color: var(--text-muted); font-size: 14px; margin-top: 8px; font-weight: 400; }
            section { margin-bottom: 20px; }
            h2 { color: var(--text-main); font-size: 19px; font-weight: 700; display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
            h2::before { content: ''; display: none; }
            h3 { font-size: 15px; color: var(--primary); margin: 15px 0 8px; font-weight: 600; }
            .info-card { background: #fbfcfd; border: 1px solid var(--border-color); border-radius: var(--radius); padding: 12px 16px; margin-bottom: 12px; }
            .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 12px; }
            .info-grid.col-3 { grid-template-columns: repeat(3, 1fr); }
            .info-item { display: flex; flex-direction: column; padding: 3px 5px; border-bottom: 1px solid #f8fafc; }
            .info-item.full-width { grid-column: 1 / -1; }
            .info-label { font-size: 11px; color: var(--text-muted); font-weight: 600; margin-bottom: 1px; }
            .info-value { font-size: 13.5px; color: var(--text-main); font-weight: 700; }
            .content-box { background: #fff; border: 1px solid var(--border-color); padding: 15px; border-radius: var(--radius); white-space: pre-wrap; font-size: 13.5px; line-height: 1.5; color: #334155; }
            .tags-cloud { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 15px; }
            .tag-pill { background: var(--primary-light); color: var(--primary); padding: 5px 14px; border-radius: 50px; font-size: 13px; font-weight: 600; border: 1px solid #bbdefb; transition: all 0.2s; }
            .chat-container { display: flex; flex-direction: column; gap: 20px; margin-top: 30px; }
            .msg-row { display: flex; width: 100%; align-items: flex-start; }
            .msg-row.us { flex-direction: row-reverse; }
            .avatar-col { width: 60px; flex-shrink: 0; padding: 0 10px; text-align: center; }
            .avatar-col img { width: 45px; height: 45px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
            .bubble { max-width: 80%; padding: 12px 18px; border-radius: 18px; box-shadow: 0 2px 10px rgba(0,0,0,0.02); font-size: 13px; word-break: break-word; overflow-wrap: break-word; }
            .text-content { white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word; min-height: 1.2em; }
            .msg-row { page-break-inside: avoid; margin-bottom: 15px; }
            .us .bubble { background: #e3f2fd; color: #1e293b; border-top-right-radius: 4px; }
            .other .bubble { background: #fff; border: 1px solid var(--border-color); border-top-left-radius: 4px; }
            .sender-name { font-weight: 700; font-size: 12.5px; display: block; margin-bottom: 8px; color: var(--primary); }
            .time { font-size: 11px; color: var(--text-muted); display: block; margin-top: 10px; }
            .attachment-preview { margin-top: 20px; }
            .attachment-preview img { max-width: 100%; max-height: 500px; border-radius: var(--radius); border: 1px solid var(--border-color); object-fit: contain; box-shadow: var(--shadow); }
            .attach-link { display: inline-flex; align-items: center; gap: 8px; color: var(--primary); text-decoration: none; font-size: 12.5px; margin-top: 12px; font-weight: 600; padding: 8px 15px; background: var(--primary-light); border-radius: 8px; }
            .container { counter-reset: section; }
            section h2::before { counter-increment: section; content: counter(section) ". "; }
            .page-break { page-break-before: always; }
${EXPORT_ICON_SHIM_CSS}
            @media print {
                body { background: #fff !important; padding: 0 !important; }
                .container { box-shadow: none !important; border: none !important; width: 100% !important; max-width: none !important; padding: 0 !important; }
                .no-print { display: none !important; }
                .info-card, .content-box, .bubble { border: 1px solid #e2e8f0 !important; page-break-inside: auto !important; }
                h1, h2, h3 { color: #000 !important; page-break-after: avoid !important; }
                .msg-row { page-break-inside: avoid !important; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <h1>تقرير عمل مشروع مستقل</h1>
                <div class="date-stamp">${escapeHtml(new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))}</div>
            </header>

            <section>
                <h2>وصف وتفاصيل المشروع</h2>
                <div class="info-card">
                    <div class="info-grid">
                        <div class="info-item full-width"><span class="info-label">اسم المشروع</span><span class="info-value">${escapeHtmlValue(pData.title)}</span></div>
                        <div class="info-item"><span class="info-label">حالة المشروع</span><span class="info-value">${escapeHtmlValue(pData.status)}</span></div>
                        <div class="info-item"><span class="info-label">الميزانية</span><span class="info-value">${escapeHtmlValue(pData.budget)}</span></div>
                        <div class="info-item"><span class="info-label">مدة التنفيذ</span><span class="info-value">${escapeHtmlValue(pData.duration)}</span></div>
                        <div class="info-item"><span class="info-label">صاحب العمل</span><span class="info-value">${escapeHtmlValue(pData.clientName)}</span></div>
                        ${pData.category && pData.category !== 'غير معروف' && pData.category !== 'Unknown' ? `<div class="info-item"><span class="info-label">القسم</span><span class="info-value">${escapeHtml(pData.category)}</span></div>` : ''}
                    </div>
                </div>
                <h3>نص الوصف:</h3>
                <div class="content-box">${escapeHtmlValue(pData.description, 'لا يوجد وصف')}</div>
                <div class="tags-cloud">
                    ${(pData.tagsList ?? []).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}
                </div>
            </section>

            <section>
                <h2>معلومات صاحب العمل</h2>
                <div class="info-card">
                    <div class="info-grid col-3">
                        <div class="info-item"><span class="info-label">اسم صاحب المشروع</span><span class="info-value">${escapeHtmlValue(pData.clientName)}</span></div>
                        <div class="info-item"><span class="info-label">تاريخ التسجيل</span><span class="info-value">${escapeHtmlValue(pData.clientJoined)}</span></div>
                        <div class="info-item"><span class="info-label">معدل التوظيف</span><span class="info-value">${escapeHtmlValue(pData.hiringRate)}</span></div>
                        ${pData.clientTitle ? `<div class="info-item"><span class="info-label">المسمى الوظيفي</span><span class="info-value">${escapeHtml(pData.clientTitle)}</span></div>` : ''}
                        <div class="info-item"><span class="info-label">المشاريع المفتوحة</span><span class="info-value">${escapeHtmlValue(pData.openProjects, '0')}</span></div>
                        <div class="info-item"><span class="info-label">مشاريع قيد التنفيذ</span><span class="info-value">${escapeHtmlValue(pData.underwayProjects, '0')}</span></div>
                        <div class="info-item"><span class="info-label">التواصلات الجارية</span><span class="info-value">${escapeHtmlValue(pData.ongoingCommunications, '0')}</span></div>
                    </div>
                </div>
            </section>

            ${
                propData &&
                ((propData.price && propData.price !== '-') ||
                    (propData.duration && propData.duration !== '-'))
                    ? `
            <section>
                <h2>العرض والاتفاق المالي</h2>
                <div class="info-card">
                    <div class="info-grid col-3">
                        <div class="info-item"><span class="info-label">المقدم</span><span class="info-value">${escapeHtmlValue(propData.bidderName)}</span></div>
                        <div class="info-item"><span class="info-label">المبلغ المتفق عليه</span><span class="info-value">${escapeHtmlValue(propData.price)}</span></div>
                        <div class="info-item"><span class="info-label">المدة الزمنية</span><span class="info-value">${escapeHtmlValue(propData.duration)}</span></div>
                    </div>
                </div>
                <h3>نص العرض المقدم:</h3>
                <div class="content-box">${escapeHtmlValue(propData.content, 'لا يوجد نص')}</div>
            </section>
            `
                    : ''
            }

            ${
                chatData && chatData.length > 0
                    ? `
            <div class="page-break"></div>
            <section>
                <h2>سجل المناقشات والرسائل</h2>
                <div class="chat-container">
                    ${chatData
                        .map(
                            (m) => `
                        <div class="msg-row ${m.isUs ? 'us' : 'other'}">
                            <div class="avatar-col">
                                ${m.avatar ? `<img src="${escapeHtml(m.avatar)}" alt="" loading="lazy">` : '<i class="fa fa-user-circle fa-3x" style="color:#cbd5e1;"></i>'}
                            </div>
                            <div class="bubble">
                                <span class="sender-name">${escapeHtml(m.senderName)}</span>
                                <div class="text-content">${escapeHtml(m.text)}</div>
                                ${m.attachments.map((a) => renderAttachmentHtml(a)).join('')}
                                <span class="time">${escapeHtml(m.time)}</span>
                            </div>
                        </div>
                    `
                        )
                        .join('')}
                </div>
            </section>
            `
                    : ''
            }

            <div class="no-print" style="position:fixed; bottom:40px; left:40px; padding: 14px 22px; background: var(--primary); color:#fff; border-radius: 12px; font-family: var(--font-ui); font-weight:700; font-size:14px; box-shadow: 0 10px 25px rgba(35, 134, 200, 0.4);">
                استخدم أمر الطباعة في المتصفح لحفظ التقرير كملف PDF
            </div>
        </div>
    </body>
    </html>`;

    const hasAttachments =
        (pData.attachments && pData.attachments.length > 0) ||
        (mediaUrls && mediaUrls.length > 0) ||
        (propData.attachments && propData.attachments.length > 0);

    if (hasAttachments) {
        let attachmentsListTxt = 'قائمة بجميع المرفقات والروابط المكتشفة\n';
        attachmentsListTxt += '==========================================\n\n';
        if (pData.attachments && pData.attachments.length > 0) {
            attachmentsListTxt += '--- ملفات ومرفقات المشروع ---\n';
            pData.attachments.forEach(
                (a: Attachment) => (attachmentsListTxt += `${a.name}: ${a.url}\n`)
            );
            attachmentsListTxt += '\n';
        }
        if (mediaUrls && mediaUrls.length > 0) {
            attachmentsListTxt += '--- ملفات ومرفقات المحادثة ---\n';
            mediaUrls.forEach((a) => (attachmentsListTxt += `${a.name}: ${a.url}\n`));
            attachmentsListTxt += '\n';
        }
        if (propData.attachments && propData.attachments.length > 0) {
            attachmentsListTxt += '--- ملفات ومرفقات عرضي ---\n';
            propData.attachments.forEach(
                (a: Attachment) => (attachmentsListTxt += `${a.name}: ${a.url}\n`)
            );
            attachmentsListTxt += '\n';
        }
        filesToZip.push({ name: `all_attachments_links.txt`, content: attachmentsListTxt });
    }

    if (chatData && chatData.length > 0) {
        filesToZip.push({ name: `chat_log.txt`, content: textOutput });
        filesToZip.push({ name: `chat_log_simple.txt`, content: textOutputNoTime });
    }

    filesToZip.push({ name: `report.html`, content: html });

    if (pData.bids && pData.bids.length > 0) {
        let bidsTxt = `عروض المستقلين الآخرين لجلسة: ${discussionId}\n`;
        bidsTxt += `عدد العروض: ${pData.bids.length}\n==========================================\n\n`;
        pData.bids.forEach((bid: MostaqlBidDetails, i: number) => {
            bidsTxt += `${i + 1}. ${bid.name} (${bid.title})\n`;
            bidsTxt += `الرابط: ${bid.link}\n`;
            bidsTxt += `التوقيت: ${bid.timeText} (${bid.timeOffset || 'غير محدد'})\n`;
            bidsTxt += `نص العرض:\n${bid.content}\n------------------------------------------\n\n`;
        });
        filesToZip.push({ name: `other_bids_details.txt`, content: bidsTxt });
    }

    if (projectDetailsText) {
        filesToZip.push({ name: `project_details.txt`, content: projectDetailsText });
    }
    if (myProposalText) {
        filesToZip.push({ name: `my_proposal.txt`, content: myProposalText });
    }

    if (browserApi.runtime && browserApi.runtime.id) {
        try {
            await downloads.downloadZip(`${folderName}.zip`, filesToZip);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'خطأ غير معروف.';
            alert(`تعذر إنشاء ملف التصدير: ${message}`);
            throw new Error(message, { cause: error });
        }
        return;
    } else {
        alert(
            'انتهت صلاحية جلسة الإضافة بسبب تحديثها. يرجى تحديث الصفحة (Refresh) والمحاولة مرة أخرى.'
        );
        throw new Error('Context invalidated');
    }
}
