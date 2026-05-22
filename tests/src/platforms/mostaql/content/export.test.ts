import { describe, expect, it, vi } from 'vitest';

import {
    injectMessageExporter,
    injectProjectExporter,
} from '../../../../../src/platforms/mostaql/content/export';
import type { PlatformContentServices } from '../../../../../src/platforms/contracts';
import { installTestDom } from '../../../../support/html';

type ZipFile = {
    readonly name: string;
    readonly content?: string;
    readonly url?: string;
};

function installExportDom(markup: string, href = 'https://mostaql.com/message/321'): Document {
    const document = installTestDom(markup);
    const location = new URL(href);

    Object.defineProperty(window, 'location', {
        configurable: true,
        value: location,
    });
    Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: location,
    });
    Object.defineProperty(window, 'alert', {
        configurable: true,
        value: vi.fn(),
    });
    Object.defineProperty(globalThis, 'alert', {
        configurable: true,
        value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
        configurable: true,
        get(this: HTMLElement) {
            return this.textContent ?? '';
        },
        set(this: HTMLElement, value: string) {
            this.textContent = value;
        },
    });

    return document;
}

function createDownloads() {
    const downloadZip = vi.fn(async (_filename: string, _files: ZipFile[]) => undefined);
    const downloads: PlatformContentServices['downloads'] = {
        downloadZip,
    };

    return {
        downloads,
        downloadZip,
    };
}

function createExportFixture(): string {
    return `
        <html>
            <head><title>اختبار <script>alert(1)</script></title></head>
            <body>
                <aside id="message-meta"></aside>
                <section id="project-meta-panel">
                    <div class="meta-row"><span class="meta-label">مدة التنفيذ</span><span class="meta-value">3 أيام</span></div>
                    <div class="meta-row"><span class="meta-label">الميزانية</span><span class="meta-value">$200 - $400</span></div>
                </section>
                <h1 class="heada__title"><span data-type="page-header-title">مشروع تصدير</span></h1>
                <div class="profile__name"><bdi>عميل مستقل</bdi></div>
                <section id="projectDetailsTab">
                    <div class="carda__content">وصف المشروع مع نص &lt;img src=x onerror=alert(1)&gt; غير موثوق.</div>
                    <div id="project-files-panel">
                        <div class="attachment">
                            <a href="/uploads/client.pdf" title="client.pdf">client</a>
                            <a href="https://evil.example/client.pdf" title="bad.pdf">bad</a>
                        </div>
                    </div>
                </section>
                <article class="proposal-item">
                    <div class="profile__name">أنا</div>
                    <div class="vertical-meta-column">
                        <span class="meta-title">المبلغ</span>
                        <span class="meta-content">$250</span>
                    </div>
                    <div class="vertical-meta-column">
                        <span class="meta-title">مدة التنفيذ</span>
                        <span class="meta-content">3 أيام</span>
                    </div>
                    <div class="bid__details"><div class="text-wrapper-div">عرضي الخاص</div></div>
                    <div id="bid-attachments">
                        <div class="attachment">
                            <a href="/uploads/bid.pdf" title="bid.pdf">bid</a>
                        </div>
                    </div>
                </article>
                <section id="chat-root">
                    <article id="message-1">
                        <strong class="metas-title">عميل مستقل</strong>
                        <time title="2026-05-22 10:00">منذ ساعة</time>
                        <img class="uavatar" src="/uploads/avatar.png" />
                        <div class="content">مرحبا &lt;img src=x onerror=alert(1)&gt;</div>
                        <a href="/file/chat.pdf">chat.pdf</a>
                        <div class="single-image-container"><a href="/uploads/screen.png">screen.png</a></div>
                        <audio src="/uploads/audio.mp3"></audio>
                        <video><source src="/uploads/video.mp4" type="video/mp4" /></video>
                        <a href="https://evil.example/file.pdf">evil</a>
                    </article>
                    <article id="message-2">
                        <div class="content">رسالة لاحقة بلا اسم مرسل</div>
                    </article>
                </section>
            </body>
        </html>
    `;
}

describe('Mostaql export content helpers', () => {
    it('does not inject export buttons without their target containers', () => {
        const document = installExportDom('<main></main>');
        const downloads = createDownloads();

        injectMessageExporter(downloads.downloads);
        injectProjectExporter(downloads.downloads);

        expect(document.getElementById('mostaql-export-chat-btn')).toBeNull();
        expect(document.getElementById('mostaql-export-project-btn')).toBeNull();
    });

    it('injects message export once and double-clicks into a sanitized ZIP payload', async () => {
        const document = installExportDom(createExportFixture());
        const downloads = createDownloads();

        injectMessageExporter(downloads.downloads);
        injectMessageExporter(downloads.downloads);

        const button = document.getElementById('mostaql-export-chat-btn');
        expect(button).toBeInstanceOf(HTMLButtonElement);
        expect(document.querySelectorAll('#mostaql-export-chat-btn')).toHaveLength(1);

        button?.click();
        button?.click();

        await vi.waitFor(() => {
            expect(downloads.downloadZip).toHaveBeenCalledOnce();
        });

        const [filename, files] = downloads.downloadZip.mock.calls[0]!;
        expect(filename).toMatch(/^mostaql_export_321_/);
        expect(files.map((file) => file.name)).toEqual(
            expect.arrayContaining([
                'report.html',
                'chat_log.txt',
                'chat_log_simple.txt',
                'project_details.txt',
                'my_proposal.txt',
                'all_attachments_links.txt',
                'chat_attachments/chat.pdf',
                'chat_attachments/screen.png',
                'chat_attachments/audio.mp3',
                'chat_attachments/video.mp4',
                'client_attachments/client.pdf',
                'bid_attachments/bid.pdf',
            ])
        );

        const report = files.find((file) => file.name === 'report.html')?.content ?? '';
        expect(report).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(report).not.toContain('<img src=x onerror=alert(1)>');
        expect(JSON.stringify(files)).not.toContain('evil.example');
    });

    it('injects project export into the existing sidebar action container', () => {
        const document = installExportDom('<div id="mostaql-ext-btn-container"></div>');
        const downloads = createDownloads();

        injectProjectExporter(downloads.downloads);
        injectProjectExporter(downloads.downloads);

        const button = document.getElementById('mostaql-export-project-btn');
        expect(button).toBeInstanceOf(HTMLButtonElement);
        expect(document.querySelectorAll('#mostaql-export-project-btn')).toHaveLength(1);
        expect(button?.textContent).toContain('تصدير');
    });

    it('exports project details from the project sidebar button after double click', async () => {
        const document = installExportDom(
            createExportFixture().replace(
                '<section id="project-meta-panel">',
                '<div id="mostaql-ext-btn-container"></div><section id="project-meta-panel">'
            ),
            'https://mostaql.com/project/999-export'
        );
        const downloads = createDownloads();

        injectProjectExporter(downloads.downloads);

        const button = document.getElementById('mostaql-export-project-btn') as HTMLButtonElement;
        button.click();
        expect(downloads.downloadZip).not.toHaveBeenCalled();

        button.click();

        await vi.waitFor(() => expect(downloads.downloadZip).toHaveBeenCalledOnce());
        const [filename, files] = downloads.downloadZip.mock.calls[0]!;

        expect(filename).toMatch(/^mostaql_export_999_/);
        expect(button.disabled).toBe(false);
        expect(button.textContent).toContain('تصدير');
        expect(files).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'project_details.txt',
                    content: expect.stringContaining('مشروع تصدير'),
                }),
                expect.objectContaining({
                    name: 'my_proposal.txt',
                    content: expect.stringContaining('عرضي الخاص'),
                }),
            ])
        );
    });

    it('exports fallback chat text and de-duplicates sanitized attachment paths', async () => {
        const document = installExportDom(`
            <html>
                <head><title>Project / unsafe : title</title></head>
                <body>
                    <aside id="message-meta"></aside>
                    <h1 class="heada__title"><span data-type="page-header-title">Fallback export</span></h1>
                    <section id="projectDetailsTab"><div class="carda__content">Project body</div></section>
                    <section id="chat-root">
                        <article id="message-1">
                            <strong class="metas-title">Client</strong>
                            <time>now</time>
                            <p>First paragraph</p>
                            <p>Second paragraph</p>
                            <a href="/file/a.pdf">same.pdf</a>
                            <a href="/file/a.pdf">duplicate same URL</a>
                            <a href="/file/b.pdf">same.pdf</a>
                            <a href="/file/weird.pdf">weird&lt;&gt;name.pdf</a>
                            <a href="/file/from-url.pdf"></a>
                            <video src="/uploads/movie.webm"></video>
                        </article>
                        <article id="message-2">
                            Continuation only
                        </article>
                    </section>
                </body>
            </html>
        `);
        const downloads = createDownloads();

        injectMessageExporter(downloads.downloads);
        const button = document.getElementById('mostaql-export-chat-btn') as HTMLButtonElement;
        button.click();
        button.click();

        await vi.waitFor(() => expect(downloads.downloadZip).toHaveBeenCalledOnce());

        const [filename, files] = downloads.downloadZip.mock.calls[0]!;
        expect(filename).toMatch(/^mostaql_export_321_Project _ unsafe _ title/);
        expect(files.map((file) => file.name)).toEqual(
            expect.arrayContaining([
                'chat_attachments/same.pdf',
                'chat_attachments/same_1.pdf',
                'chat_attachments/weird__name.pdf',
                'chat_attachments/from-url.pdf',
                'chat_attachments/movie.webm',
            ])
        );
        expect(files.filter((file) => file.name === 'chat_attachments/same.pdf')).toHaveLength(1);

        const chatLog = files.find((file) => file.name === 'chat_log.txt')?.content ?? '';
        expect(chatLog).toContain('First paragraph\nSecond paragraph');
        expect(chatLog).toContain('Continuation only');
        expect(chatLog).toContain(
            '[مرفقات: same.pdf, same.pdf, weird<>name.pdf, from-url.pdf, movie.webm]'
        );

        const report = files.find((file) => file.name === 'report.html')?.content ?? '';
        expect(report).toContain('chat_attachments/same.pdf');
        expect(report).toContain('chat_attachments/same_1.pdf');
        expect(report).toContain('weird&lt;&gt;name.pdf');
        expect(report).not.toContain(
            'target="_blank" rel="noopener noreferrer" class="attach-link"><i class="fa fa-paperclip"></i> same.pdf'
        );
    });
});
