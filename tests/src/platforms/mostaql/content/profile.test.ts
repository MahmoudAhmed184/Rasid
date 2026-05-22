import { describe, expect, it } from 'vitest';

import { injectProfileTools } from '../../../../../src/platforms/mostaql/content/profile';
import { installTestDom } from '../../../../support/html';

describe('Mostaql profile tools injection', () => {
    it('does nothing when no supported profile target exists', () => {
        const document = installTestDom('<main></main>');

        injectProfileTools();

        expect(document.getElementById('mostaql-profile-tools')).toBeNull();
    });

    it('injects profile tools once into the profile sidebar target', () => {
        const document = installTestDom('<aside id="profile-sidebar"></aside>');

        injectProfileTools();
        injectProfileTools();

        const toolboxes = document.querySelectorAll('#mostaql-profile-tools');
        expect(toolboxes).toHaveLength(1);
        expect(toolboxes[0]?.parentElement?.id).toBe('profile-sidebar');
        expect(toolboxes[0]?.textContent).toContain('أداة بروفايل');
    });

    it('supports the legacy profile card selector', () => {
        const document = installTestDom('<aside class="profile_card"></aside>');

        injectProfileTools();

        expect(document.querySelector('.profile_card #mostaql-profile-tools')).toBeInstanceOf(
            HTMLElement
        );
    });
});
