import JSZip from 'jszip';
import { browser } from 'wxt/browser';

export interface ZipEntryInput {
    name: string;
    content?: string;
    url?: string;
}

export interface ZipDownloadResult {
    success: boolean;
    downloadId?: number;
    error?: string;
}

export async function downloadZipArchive(
    filename: string,
    files: ZipEntryInput[]
): Promise<ZipDownloadResult> {
    try {
        const zip = new JSZip();

        for (const file of files) {
            if (file.content) {
                zip.file(file.name, file.content);
                continue;
            }

            if (!file.url) {
                continue;
            }

            try {
                const response = await fetch(file.url, {
                    credentials: 'include',
                    cache: 'no-store',
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                zip.file(file.name, await response.arrayBuffer());
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                zip.file(`${file.name}.error.txt`, `Failed to download: ${message}`);
            }
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const objectUrl = URL.createObjectURL(blob);

        try {
            const downloadId = await browser.downloads.download({
                url: objectUrl,
                filename,
                saveAs: true,
            });

            const cleanup = (delta: Browser.downloads.DownloadDelta) => {
                if (
                    delta.id !== downloadId ||
                    !delta.state ||
                    (delta.state.current !== 'complete' && delta.state.current !== 'interrupted')
                ) {
                    return;
                }

                browser.downloads.onChanged.removeListener(cleanup);
                URL.revokeObjectURL(objectUrl);
            };

            browser.downloads.onChanged.addListener(cleanup);

            return {
                success: true,
                downloadId,
            };
        } catch (error) {
            URL.revokeObjectURL(objectUrl);
            throw error;
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
