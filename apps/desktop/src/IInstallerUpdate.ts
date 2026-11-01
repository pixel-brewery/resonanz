/**
 * The verified installer an update manifest advertises for this runtime target. It stays inside
 * Electron Main: the renderer only ever sees the version through the update state.
 *
 * @public
 */
export interface IInstallerUpdate {
  /** Numeric `major.minor.patch` version the installer delivers. */
  readonly version: string;

  /** Credential-free HTTPS location of the installer. */
  readonly downloadUrl: string;

  /** Platform installer file name (`.dmg` on macOS, `.exe` on Windows); one path segment. */
  readonly fileName: string;

  /** Exact size of the installer in bytes, as the manifest declares it. */
  readonly bytes: number;

  /** Lower-case hexadecimal SHA-256 digest of the installer, as the manifest declares it. */
  readonly sha256: string;
}
