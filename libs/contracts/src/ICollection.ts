/**
 * A user-named collection of recordings.
 *
 * @public
 */
export interface ICollection {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}
