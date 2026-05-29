import { describe, expect, it, vi } from 'vitest';

import {
    createZipObjectUrl,
    revokeZipObjectUrl,
} from '../../../../src/features/downloads/zip-downloads';

async function readCreatedZipText(createObjectUrl: ReturnType<typeof vi.spyOn>): Promise<string> {
    const blob = createObjectUrl.mock.calls[0]?.[0];

    if (!(blob instanceof Blob)) {
        throw new Error('Expected ZIP object URL to be created from a Blob.');
    }

    return new TextDecoder().decode(await blob.arrayBuffer());
}

describe('ZIP download creation', () => {
    it('sanitizes filenames and creates object URLs for inline content', async () => {
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');

        await expect(
            createZipObjectUrl('bad:name?.zip', [
                { name: '../unsafe/readme.txt', content: 'hello' },
                { name: 'readme.txt', content: 'duplicate' },
            ])
        ).resolves.toMatchObject({
            success: true,
            filename: 'bad_name_.zip',
            objectUrl: 'blob:zip',
        });
        expect(createObjectUrl).toHaveBeenCalledOnce();

        await expect(readCreatedZipText(createObjectUrl)).resolves.toEqual(
            expect.stringContaining('unsafe/readme.txt')
        );
        await expect(readCreatedZipText(createObjectUrl)).resolves.toEqual(
            expect.stringContaining('readme.txt')
        );
    });

    it('does not fetch unsupported remote attachment hosts', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');

        const result = await createZipObjectUrl('export.zip', [
            { name: 'evil.pdf', url: 'https://evil.example/file.pdf' },
        ]);

        expect(result.success).toBe(true);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
        ['invalid URL', 'not-a-url', 'Attachment URL is not valid.'],
        ['HTTP URL', 'http://mostaql.com/file.pdf', 'Attachment URL must use HTTPS.'],
        [
            'unsupported host',
            'https://evil.example/file.pdf',
            'Attachment URL host is not supported for export.',
        ],
    ] as const)(
        'records %s remote attachment failures inside the archive',
        async (_label, url, error) => {
            const fetchSpy = vi.spyOn(globalThis, 'fetch');
            const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');

            await expect(
                createZipObjectUrl('export.zip', [{ name: 'remote.pdf', url }])
            ).resolves.toMatchObject({
                success: true,
                objectUrl: 'blob:zip',
            });

            expect(fetchSpy).not.toHaveBeenCalled();
            const archiveText = await readCreatedZipText(createObjectUrl);
            expect(archiveText).toContain('remote.pdf.error.txt');
            expect(archiveText).toContain(error);
        }
    );

    it('fetches supported HTTPS attachments with stripped credentials and no referrer', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('remote attachment', {
                headers: { 'content-length': '17' },
            })
        );
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');

        await expect(
            createZipObjectUrl('export.zip', [
                {
                    name: 'attachments/spec.txt',
                    url: 'https://user:secret@sub.mostaql.com/files/spec.txt#token',
                },
            ])
        ).resolves.toMatchObject({
            success: true,
            objectUrl: 'blob:zip',
        });

        expect(fetchSpy).toHaveBeenCalledWith(
            'https://sub.mostaql.com/files/spec.txt',
            expect.objectContaining({
                credentials: 'include',
                cache: 'no-store',
                referrerPolicy: 'no-referrer',
                signal: expect.any(AbortSignal),
            })
        );
        await expect(readCreatedZipText(createObjectUrl)).resolves.toEqual(
            expect.stringContaining('remote attachment')
        );
    });

    it('records remote attachment failures inside the ZIP instead of aborting export', async () => {
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');

        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('', {
                headers: {
                    'content-length': String(10 * 1024 * 1024 + 1),
                },
            })
        );

        await expect(
            createZipObjectUrl('export.zip', [
                { name: 'large.pdf', url: 'https://khamsat.com/files/large.pdf' },
            ])
        ).resolves.toMatchObject({
            success: true,
            objectUrl: 'blob:zip',
        });

        const archiveText = await readCreatedZipText(createObjectUrl);
        expect(archiveText).toContain('large.pdf.error.txt');
        expect(archiveText).toContain('Attachment exceeds the per-file export limit.');
    });

    it('records remote HTTP and body-size failures without aborting the ZIP', async () => {
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');
        const oversizedBody = new Uint8Array(10 * 1024 * 1024 + 1);

        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                new Response(oversizedBody, {
                    headers: {
                        'content-length': 'not-a-number',
                    },
                })
            );

        await expect(
            createZipObjectUrl('export.zip', [
                { name: 'missing.pdf', url: 'https://mostaql.com/files/missing.pdf' },
                { name: 'big-body.pdf', url: 'https://nafezly.com/files/big-body.pdf' },
            ])
        ).resolves.toMatchObject({
            success: true,
            objectUrl: 'blob:zip',
        });

        const archiveText = await readCreatedZipText(createObjectUrl);
        expect(archiveText).toContain('missing.pdf.error.txt');
        expect(archiveText).toContain('HTTP 404');
        expect(archiveText).toContain('big-body.pdf.error.txt');
        expect(archiveText).toContain('Attachment exceeds the per-file export limit.');
    });

    it('normalizes duplicate and hostile entry names and records skipped overflow entries', async () => {
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');

        await expect(
            createZipObjectUrl(
                '   ',
                Array.from({ length: 82 }, (_, index) => ({
                    name: index < 2 ? '../same.txt' : `folder/../file-${index}.txt`,
                    content: `file ${index}`,
                }))
            )
        ).resolves.toMatchObject({
            success: true,
            filename: 'frelancia-export.zip',
            objectUrl: 'blob:zip',
        });

        const archiveText = await readCreatedZipText(createObjectUrl);
        expect(archiveText).toContain('same.txt');
        expect(archiveText).toContain('same-2.txt');
        expect(archiveText).toContain('skipped-files.error.txt');
        expect(archiveText).toContain(
            '2 entries were skipped because the export contains too many files.'
        );
    });

    it('skips entries without inline content or a remote URL and reports object URL failures', async () => {
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
            throw new Error('object URL disabled');
        });

        await expect(
            createZipObjectUrl('export.zip', [
                { name: 'empty.txt' },
                { name: 'content.txt', content: 'kept' },
            ])
        ).resolves.toEqual({
            success: false,
            error: 'object URL disabled',
        });
        expect(createObjectUrl).toHaveBeenCalledOnce();
    });

    it('revokes object URLs through the platform URL API', () => {
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

        revokeZipObjectUrl('blob:zip');

        expect(revoke).toHaveBeenCalledWith('blob:zip');
    });
});
