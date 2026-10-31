/**
 * Stable, serializable projection of a browser audio-input device.
 *
 * @public
 */
export interface IAudioInputDevice {
    /** Browser-scoped device identifier. */
    readonly deviceId: string;

    /** Browser-scoped physical device group identifier when exposed. */
    readonly groupId: string;

    /** Browser-provided label, which can be empty before permission is granted. */
    readonly label: string;
}
