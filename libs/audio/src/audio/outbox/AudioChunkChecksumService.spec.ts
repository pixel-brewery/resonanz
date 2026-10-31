// #region Imports

import { TestBed } from '@angular/core/testing';
import { webcrypto } from 'node:crypto';
import { AudioChunkChecksumService } from './AudioChunkChecksumService';

// #endregion

describe('AudioChunkChecksumService', () => {
    beforeEach(() => {
        TestBed.resetTestingModule();
        Object.defineProperty(window, 'crypto', {
            configurable: true,
            value: webcrypto
        });
    });

    it('calculates a stable lowercase SHA-256 digest', async () => {
        const service = TestBed.inject(AudioChunkChecksumService);

        await expect(service.calculateSha256(new Blob(['hello']))).resolves.toBe(
            '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
        );
    });
});
