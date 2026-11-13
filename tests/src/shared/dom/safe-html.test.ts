import { beforeEach, describe, expect, it } from 'vitest';

import { parseSafeDocument, sanitizeHtmlForParsing } from '../../../../src/shared/dom/safe-html';
import { installTestDom } from '../../../support/html';

describe('safe HTML sanitizer and parser', () => {
    beforeEach(() => {
        installTestDom();
    });

    describe('sanitizeHtmlForParsing', () => {
        it('returns empty string for empty, null, or undefined input', () => {
            expect(sanitizeHtmlForParsing('')).toBe('');
            expect(sanitizeHtmlForParsing(null as unknown as string)).toBe('');
            expect(sanitizeHtmlForParsing(undefined as unknown as string)).toBe('');
        });

        it('strips inline event handler attributes from HTML elements', () => {
            const input =
                '<img src="photo.jpg" onerror="alert(\'xss\')" onload="notify()" alt="Photo" />';
            const sanitized = sanitizeHtmlForParsing(input);

            expect(sanitized).not.toContain('onerror');
            expect(sanitized).not.toContain('onload');
            expect(sanitized).toContain('src="photo.jpg"');
            expect(sanitized).toContain('alt="Photo"');
        });

        it('handles case-insensitive event handler names', () => {
            const input = '<button type="button" OnClick="submit()" oNLoAd="init()">Click</button>';
            const sanitized = sanitizeHtmlForParsing(input);

            expect(sanitized).not.toContain('OnClick');
            expect(sanitized).not.toContain('oNLoAd');
            expect(sanitized).toContain('type="button"');
        });

        it('strips event handlers with single quotes, unquoted values, and valueless attributes', () => {
            const input = "<div onmouseover='show()' onfocus=blur onclick autofocus>Content</div>";
            const sanitized = sanitizeHtmlForParsing(input);

            expect(sanitized).not.toContain('onmouseover');
            expect(sanitized).not.toContain('onfocus');
            expect(sanitized).not.toContain('onclick');
            expect(sanitized).toContain('autofocus');
            expect(sanitized).toContain('Content');
        });

        it('preserves valid attributes that start with or contain "on"', () => {
            const input =
                '<div class="online-status" data-onclick="analytics" title="Turn onclick=true in settings">text</div>';
            const sanitized = sanitizeHtmlForParsing(input);

            expect(sanitized).toContain('class="online-status"');
            expect(sanitized).toContain('data-onclick="analytics"');
            expect(sanitized).toContain('title="Turn onclick=true in settings"');
        });

        it('preserves text content containing event handler keywords and Arabic text', () => {
            const input =
                '<p class="description">أريد حل مشكلة في حدث onclick="alert(1)" في جافاسكريبت</p>';
            const sanitized = sanitizeHtmlForParsing(input);

            expect(sanitized).toContain('أريد حل مشكلة في حدث onclick="alert(1)" في جافاسكريبت');
        });

        it('strips script tags and their contents', () => {
            const input =
                '<div><h1>Title</h1><script type="text/javascript">alert("xss");</script><p>Text</p></div>';
            const sanitized = sanitizeHtmlForParsing(input);

            expect(sanitized).not.toContain('<script');
            expect(sanitized).not.toContain('alert("xss")');
            expect(sanitized).toContain('<h1>Title</h1>');
            expect(sanitized).toContain('<p>Text</p>');
        });

        it('strips self-closing and unclosed script tags', () => {
            const input = '<div><script src="https://evil.com/payload.js" /><p>Safe</p></div>';
            const sanitized = sanitizeHtmlForParsing(input);

            expect(sanitized).not.toContain('<script');
            expect(sanitized).toContain('<p>Safe</p>');
        });

        it('strips javascript: pseudo-protocol URLs in attributes', () => {
            const input = '<a href="javascript:alert(1)" title="Click">Link</a>';
            const sanitized = sanitizeHtmlForParsing(input);

            expect(sanitized).not.toContain('javascript:alert(1)');
            expect(sanitized).toContain('title="Click"');
            expect(sanitized).toContain('>Link</a>');
        });

        it('handles multi-line tags and attributes cleanly', () => {
            const input = `<img
                src="avatar.png"
                onerror="
                    this.onerror = null;
                    this.src = 'fallback.png';
                "
                alt="User avatar"
            />`;
            const sanitized = sanitizeHtmlForParsing(input);

            expect(sanitized).not.toContain('onerror');
            expect(sanitized).toContain('src="avatar.png"');
            expect(sanitized).toContain('alt="User avatar"');
        });

        it('strips event handlers in SVG elements', () => {
            const input = '<svg onload="alert(1)"><circle cx="50" cy="50" r="40" /></svg>';
            const sanitized = sanitizeHtmlForParsing(input);

            expect(sanitized).not.toContain('onload');
            expect(sanitized).toContain('<svg');
            expect(sanitized).toContain('<circle');
        });

        it('processes unclosed or deeply malformed tags without ReDoS backtracking', () => {
            const malformed = '<div ' + 'a='.repeat(1000);
            const start = performance.now();
            const sanitized = sanitizeHtmlForParsing(malformed);
            const duration = performance.now() - start;

            expect(duration).toBeLessThan(100);
            expect(sanitized).toBe(malformed);
        });
    });

    describe('parseSafeDocument', () => {
        it('parses HTML and returns a queryable DOM Document with event handlers removed', () => {
            const html = `
                <div id="project-container">
                    <h1 class="project-title" onclick="track()">مشروع تجريبي</h1>
                    <img src="thumb.jpg" onerror="this.remove()" alt="Thumbnail" />
                    <a href="/project/100" onmouseover="preload(100)">تفاصيل</a>
                </div>
            `;
            const doc = parseSafeDocument(html);

            const title = doc.querySelector('.project-title');
            expect(title?.textContent?.trim()).toBe('مشروع تجريبي');
            expect(title?.hasAttribute('onclick')).toBe(false);

            const img = doc.querySelector('img');
            expect(img?.getAttribute('src')).toBe('thumb.jpg');
            expect(img?.hasAttribute('onerror')).toBe(false);

            const link = doc.querySelector('a');
            expect(link?.getAttribute('href')).toBe('/project/100');
            expect(link?.hasAttribute('onmouseover')).toBe(false);
        });

        it('strips all script elements from the parsed Document', () => {
            const html = `
                <main>
                    <script>window.__PRELOADED__ = { secret: 'data' };</script>
                    <p>المحتوى</p>
                </main>
            `;
            const doc = parseSafeDocument(html);

            expect(doc.querySelectorAll('script').length).toBe(0);
            expect(doc.querySelector('p')?.textContent).toBe('المحتوى');
        });
    });
});
