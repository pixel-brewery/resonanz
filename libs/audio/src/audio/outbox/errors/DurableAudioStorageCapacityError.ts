/** Indicates that browser storage cannot safely hold the configured recording runway. */
export class DurableAudioStorageCapacityError extends Error {
    public constructor(
        public readonly requiredBytes: number,
        public readonly availableBytes: number
    ) {
        super('Durable browser storage has insufficient free capacity for the live session.');
        this.name = DurableAudioStorageCapacityError.name;
    }
}
