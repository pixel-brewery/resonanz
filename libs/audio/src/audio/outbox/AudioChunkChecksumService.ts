// #region Imports

import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

// #endregion

/** Calculates deterministic browser-side digests for durable audio uploads. */
@Injectable({ providedIn: 'root' })
export class AudioChunkChecksumService {
    // #region Fields

    private readonly _document: Document = inject(DOCUMENT);

    // #endregion

    // #region Ctor
    // #endregion

    // #region Properties

    /** Indicates whether the browser exposes the required SHA-256 implementation. */
    public get isSupported(): boolean {
        return this._document.defaultView?.crypto?.subtle !== undefined;
    }

    // #endregion

    // #region Methods

    /**
     * Calculates the lowercase hexadecimal SHA-256 digest of a blob.
     *
     * @param blob - Encoded audio payload.
     * @returns Lowercase hexadecimal digest.
     * @public
     */
    public async calculateSha256(blob: Blob): Promise<string> {
        const subtle = this._document.defaultView?.crypto?.subtle;
        if (subtle === undefined) {
            throw new Error('Secure browser hashing is unavailable.');
        }
        const digest = await subtle.digest('SHA-256', await blob.arrayBuffer());
        return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
    }

    // #endregion
}
