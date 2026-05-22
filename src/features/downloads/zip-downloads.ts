import type { OffscreenZipEntryInput, OffscreenZipObjectUrlResult } from '../offscreen/manager';

export type ZipEntryInput = OffscreenZipEntryInput;
export type ZipObjectUrlResult = OffscreenZipObjectUrlResult;

export interface ZipDownloadResult {
    success: boolean;
    downloadId?: number;
    error?: string;
}

interface ResolvedZipEntry {
    readonly name: string;
    readonly data: Uint8Array;
    readonly lastModified: Date;
}

interface CentralDirectoryRecord {
    readonly bytes: Uint8Array;
}

const ZIP_MIME_TYPE = 'application/zip';
const MAX_ZIP32_VALUE = 0xffffffff;
const MAX_ZIP32_ENTRIES = 0xffff;
const MAX_ZIP_ENTRIES = 80;
const MAX_REMOTE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ENTRY_BYTES = 50 * 1024 * 1024;
const REMOTE_FETCH_TIMEOUT_MS = 15_000;
const UTF8_FILE_NAME_FLAG = 0x0800;
const STORE_COMPRESSION_METHOD = 0;
const ZIP_ALLOWED_REMOTE_HOSTS = ['mostaql.com', 'khamsat.com', 'nafezly.com'] as const;

const encoder = new TextEncoder();
const crc32Table = createCrc32Table();

function createCrc32Table(): Uint32Array {
    const table = new Uint32Array(256);

    for (let index = 0; index < table.length; index += 1) {
        let value = index;

        for (let bit = 0; bit < 8; bit += 1) {
            value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }

        table[index] = value >>> 0;
    }

    return table;
}

function calculateCrc32(data: Uint8Array): number {
    let crc = 0xffffffff;

    for (const byte of data) {
        crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
}

function toUint8Array(value: string | ArrayBuffer): Uint8Array {
    return typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value);
}

function normalizeZipEntryName(name: string, fallback: string): string {
    const segments = name
        .replace(/\\/g, '/')
        .replace(/^[a-zA-Z]:\//, '')
        .split('/')
        .filter((segment) => segment !== '' && segment !== '.' && segment !== '..');

    return segments.join('/') || fallback;
}

function createUniqueName(name: string, usedNames: Set<string>): string {
    if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
    }

    const lastSlashIndex = name.lastIndexOf('/');
    const directory = lastSlashIndex >= 0 ? `${name.slice(0, lastSlashIndex + 1)}` : '';
    const basename = lastSlashIndex >= 0 ? name.slice(lastSlashIndex + 1) : name;
    const dotIndex = basename.lastIndexOf('.');
    const stem = dotIndex > 0 ? basename.slice(0, dotIndex) : basename;
    const extension = dotIndex > 0 ? basename.slice(dotIndex) : '';

    for (let suffix = 2; ; suffix += 1) {
        const candidate = `${directory}${stem}-${suffix}${extension}`;

        if (!usedNames.has(candidate)) {
            usedNames.add(candidate);
            return candidate;
        }
    }
}

function sanitizeDownloadFilename(filename: string): string {
    const safeName = filename
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();

    return safeName || 'rasid-export.zip';
}

function getDosDateTime(date: Date): { readonly time: number; readonly date: number } {
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);

    return {
        time: (hours << 11) | (minutes << 5) | seconds,
        date: ((year - 1980) << 9) | (month << 5) | day,
    };
}

function writeUint16(view: DataView, offset: number, value: number): void {
    view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
    view.setUint32(offset, value >>> 0, true);
}

function createLocalFileHeader(
    entry: ResolvedZipEntry,
    crc32: number,
    fileNameBytes: Uint8Array
): Uint8Array {
    const header = new Uint8Array(30 + fileNameBytes.byteLength);
    const view = new DataView(header.buffer);
    const timestamp = getDosDateTime(entry.lastModified);

    writeUint32(view, 0, 0x04034b50);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, UTF8_FILE_NAME_FLAG);
    writeUint16(view, 8, STORE_COMPRESSION_METHOD);
    writeUint16(view, 10, timestamp.time);
    writeUint16(view, 12, timestamp.date);
    writeUint32(view, 14, crc32);
    writeUint32(view, 18, entry.data.byteLength);
    writeUint32(view, 22, entry.data.byteLength);
    writeUint16(view, 26, fileNameBytes.byteLength);
    writeUint16(view, 28, 0);
    header.set(fileNameBytes, 30);

    return header;
}

function createCentralDirectoryRecord(
    entry: ResolvedZipEntry,
    crc32: number,
    fileNameBytes: Uint8Array,
    localHeaderOffset: number
): CentralDirectoryRecord {
    const bytes = new Uint8Array(46 + fileNameBytes.byteLength);
    const view = new DataView(bytes.buffer);
    const timestamp = getDosDateTime(entry.lastModified);

    writeUint32(view, 0, 0x02014b50);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, 20);
    writeUint16(view, 8, UTF8_FILE_NAME_FLAG);
    writeUint16(view, 10, STORE_COMPRESSION_METHOD);
    writeUint16(view, 12, timestamp.time);
    writeUint16(view, 14, timestamp.date);
    writeUint32(view, 16, crc32);
    writeUint32(view, 20, entry.data.byteLength);
    writeUint32(view, 24, entry.data.byteLength);
    writeUint16(view, 28, fileNameBytes.byteLength);
    writeUint16(view, 30, 0);
    writeUint16(view, 32, 0);
    writeUint16(view, 34, 0);
    writeUint16(view, 36, 0);
    writeUint32(view, 38, 0);
    writeUint32(view, 42, localHeaderOffset);
    bytes.set(fileNameBytes, 46);

    return { bytes };
}

function createEndOfCentralDirectory(
    entryCount: number,
    centralDirectorySize: number,
    centralDirectoryOffset: number
): Uint8Array {
    const bytes = new Uint8Array(22);
    const view = new DataView(bytes.buffer);

    writeUint32(view, 0, 0x06054b50);
    writeUint16(view, 4, 0);
    writeUint16(view, 6, 0);
    writeUint16(view, 8, entryCount);
    writeUint16(view, 10, entryCount);
    writeUint32(view, 12, centralDirectorySize);
    writeUint32(view, 16, centralDirectoryOffset);
    writeUint16(view, 20, 0);

    return bytes;
}

function assertZip32Limit(label: string, value: number): void {
    if (value > MAX_ZIP32_VALUE) {
        throw new Error(`${label} exceeds ZIP32 limits.`);
    }
}

function isAllowedRemoteHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase();

    return ZIP_ALLOWED_REMOTE_HOSTS.some(
        (allowedHost) => normalized === allowedHost || normalized.endsWith(`.${allowedHost}`)
    );
}

function parseAllowedRemoteUrl(value: string): URL {
    let url: URL;

    try {
        url = new URL(value);
    } catch {
        throw new Error('Attachment URL is not valid.');
    }

    if (url.protocol !== 'https:') {
        throw new Error('Attachment URL must use HTTPS.');
    }

    if (!isAllowedRemoteHost(url.hostname)) {
        throw new Error('Attachment URL host is not supported for export.');
    }

    url.username = '';
    url.password = '';
    url.hash = '';
    return url;
}

function parseContentLength(value: string | null): number | null {
    if (!value) {
        return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

function createZipBlob(entries: readonly ResolvedZipEntry[]): Blob {
    if (entries.length > MAX_ZIP32_ENTRIES) {
        throw new Error('ZIP file contains too many entries.');
    }

    const parts: BlobPart[] = [];
    const centralDirectory: CentralDirectoryRecord[] = [];
    let offset = 0;

    for (const entry of entries) {
        assertZip32Limit(`Entry ${entry.name}`, entry.data.byteLength);

        const fileNameBytes = encoder.encode(entry.name);
        const crc32 = calculateCrc32(entry.data);
        const localHeader = createLocalFileHeader(entry, crc32, fileNameBytes);
        const localHeaderOffset = offset;

        parts.push(toBlobPart(localHeader), toBlobPart(entry.data));
        offset += localHeader.byteLength + entry.data.byteLength;
        assertZip32Limit('ZIP body', offset);

        centralDirectory.push(
            createCentralDirectoryRecord(entry, crc32, fileNameBytes, localHeaderOffset)
        );
    }

    const centralDirectoryOffset = offset;

    for (const record of centralDirectory) {
        parts.push(toBlobPart(record.bytes));
        offset += record.bytes.byteLength;
        assertZip32Limit('ZIP central directory', offset);
    }

    const centralDirectorySize = offset - centralDirectoryOffset;
    parts.push(
        toBlobPart(
            createEndOfCentralDirectory(
                entries.length,
                centralDirectorySize,
                centralDirectoryOffset
            )
        )
    );

    return new Blob(parts, { type: ZIP_MIME_TYPE });
}

async function readFileEntry(
    file: ZipEntryInput,
    remainingBytes: number
): Promise<string | ArrayBuffer | null> {
    if (file.content !== undefined) {
        return file.content;
    }

    if (!file.url) {
        return null;
    }

    const url = parseAllowedRemoteUrl(file.url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);

    let response: Response;

    try {
        response = await fetch(url.href, {
            credentials: 'include',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const contentLength = parseContentLength(response.headers.get('content-length'));

    if (contentLength !== null && contentLength > MAX_REMOTE_FILE_BYTES) {
        throw new Error('Attachment exceeds the per-file export limit.');
    }

    if (contentLength !== null && contentLength > remainingBytes) {
        throw new Error('Attachment exceeds the remaining archive size limit.');
    }

    const data = await response.arrayBuffer();

    if (data.byteLength > MAX_REMOTE_FILE_BYTES) {
        throw new Error('Attachment exceeds the per-file export limit.');
    }

    if (data.byteLength > remainingBytes) {
        throw new Error('Attachment exceeds the remaining archive size limit.');
    }

    return data;
}

async function createResolvedEntries(files: readonly ZipEntryInput[]): Promise<ResolvedZipEntry[]> {
    const entries: ResolvedZipEntry[] = [];
    const usedNames = new Set<string>();
    let totalBytes = 0;

    function pushEntry(name: string, data: Uint8Array): void {
        if (data.byteLength > MAX_REMOTE_FILE_BYTES) {
            throw new Error('Entry exceeds the per-file export limit.');
        }

        if (totalBytes + data.byteLength > MAX_TOTAL_ENTRY_BYTES) {
            throw new Error('Archive exceeds the total export size limit.');
        }

        totalBytes += data.byteLength;
        entries.push({
            name,
            data,
            lastModified: new Date(),
        });
    }

    function pushErrorEntry(entryName: string, message: string): void {
        const errorName = createUniqueName(`${entryName}.error.txt`, usedNames);
        const data = encoder.encode(`Skipped attachment: ${message}`);
        totalBytes += data.byteLength;
        entries.push({
            name: errorName,
            data,
            lastModified: new Date(),
        });
    }

    const selectedFiles = files.slice(0, MAX_ZIP_ENTRIES);

    for (const [index, file] of selectedFiles.entries()) {
        const entryName = normalizeZipEntryName(file.name, `file-${index + 1}`);

        try {
            const data = await readFileEntry(file, MAX_TOTAL_ENTRY_BYTES - totalBytes);

            if (data === null) {
                continue;
            }

            pushEntry(createUniqueName(entryName, usedNames), toUint8Array(data));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            pushErrorEntry(entryName, message);
        }
    }

    if (files.length > MAX_ZIP_ENTRIES) {
        pushErrorEntry(
            'skipped-files',
            `${files.length - MAX_ZIP_ENTRIES} entries were skipped because the export contains too many files.`
        );
    }

    return entries;
}

export async function createZipObjectUrl(
    filename: string,
    files: readonly ZipEntryInput[]
): Promise<ZipObjectUrlResult> {
    try {
        const safeFilename = sanitizeDownloadFilename(filename);
        const entries = await createResolvedEntries(files);
        const blob = createZipBlob(entries);

        return {
            success: true,
            filename: safeFilename,
            objectUrl: URL.createObjectURL(blob),
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export function revokeZipObjectUrl(objectUrl: string): void {
    URL.revokeObjectURL(objectUrl);
}
