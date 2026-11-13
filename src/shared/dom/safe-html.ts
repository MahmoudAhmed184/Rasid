const TAG_PATTERN = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:[^"'>]|"[^"]*"|'[^']*')*?)\s*(\/?)>/g;
const ATTRIBUTE_PATTERN = /\s*([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`/]+)))?/g;
const SCRIPT_PATTERN = /<script\b[\s\S]*?<\/script\s*>/gi;
const UNCLOSED_OR_EMPTY_SCRIPT_PATTERN = /<script\b[^>]*\/?>/gi;
const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const JAVASCRIPT_URL_PATTERN = /^\s*javascript:/i;
const EVENT_HANDLER_NAME_PATTERN = /^on[a-z]/i;
const POTENTIAL_THREAT_PATTERN = /on|javascript:/i;

function sanitizeAttributes(attributesString: string): string {
    ATTRIBUTE_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    let sanitized = '';

    while ((match = ATTRIBUTE_PATTERN.exec(attributesString)) !== null) {
        const [, name, doubleQuotedValue, singleQuotedValue, unquotedValue] = match;

        if (!name || EVENT_HANDLER_NAME_PATTERN.test(name)) {
            continue;
        }

        const rawValue = doubleQuotedValue ?? singleQuotedValue ?? unquotedValue;
        if (rawValue !== undefined && JAVASCRIPT_URL_PATTERN.test(rawValue)) {
            continue;
        }

        if (doubleQuotedValue !== undefined) {
            sanitized += ` ${name}="${doubleQuotedValue}"`;
        } else if (singleQuotedValue !== undefined) {
            sanitized += ` ${name}='${singleQuotedValue}'`;
        } else if (unquotedValue !== undefined) {
            sanitized += ` ${name}="${unquotedValue}"`;
        } else {
            sanitized += ` ${name}`;
        }
    }

    return sanitized;
}

/**
 * Sanitizes an HTML string prior to parsing with DOMParser.
 * Removes comments, scripts, inline event handlers (e.g. onload, onerror, onclick),
 * and javascript: URLs to prevent CSP violations in MV3 contexts such as offscreen documents.
 */
export function sanitizeHtmlForParsing(html: string): string {
    if (!html || typeof html !== 'string') {
        return '';
    }

    let cleaned = html.replace(COMMENT_PATTERN, '');
    cleaned = cleaned.replace(SCRIPT_PATTERN, '');
    cleaned = cleaned.replace(UNCLOSED_OR_EMPTY_SCRIPT_PATTERN, '');

    return cleaned.replace(
        TAG_PATTERN,
        (_match: string, tag: string, attributes: string, slash: string) => {
            if (!POTENTIAL_THREAT_PATTERN.test(attributes)) {
                return `<${tag}${attributes}${slash ? ' /' : ''}>`;
            }

            const safeAttributes = sanitizeAttributes(attributes);
            return `<${tag}${safeAttributes}${slash ? ' /' : ''}>`;
        }
    );
}

/**
 * Safely parses HTML into a Document using DOMParser after stripping inline
 * event handlers, script blocks, and javascript: URLs.
 */
export function parseSafeDocument(html: string): Document {
    return new DOMParser().parseFromString(sanitizeHtmlForParsing(html), 'text/html');
}
