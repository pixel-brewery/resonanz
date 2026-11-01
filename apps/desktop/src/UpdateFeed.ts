/**
 * Public, credential-free location of the update manifests: the assets of the latest GitHub
 * release of the public repository. Without a published manifest the check reports that Resonanz
 * is up to date. Publishing releases and manifests remains a separate release decision.
 *
 * @public
 */
export const defaultUpdateFeedUrl =
  'https://github.com/pixel-brewery/resonanz/releases/latest/download';

/**
 * File name of the update manifest for one runtime target.
 *
 * @param platform - Node platform of the build.
 * @param architecture - Node architecture of the build.
 * @public
 */
export function updateManifestName(platform: NodeJS.Platform, architecture: string): string {
  return `update-${platform}-${architecture}.json`;
}
