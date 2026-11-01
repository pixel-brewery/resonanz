/**
 * Selects optional trusted platform signing without changing the unsigned fallback.
 *
 * @param {string} platform The actual native packaging platform.
 * @param {Record<string, string | undefined>} environment Explicit Forge signing inputs.
 * @returns {object} Public Electron Packager/Squirrel signing options; reads no credentials.
 */
export function releaseSigning(platform, environment) {
  if (platform === 'darwin') {
    const identity = environment.APPLE_SIGNING_IDENTITY;
    const notarization = [
      environment.APPLE_API_KEY_PATH,
      environment.APPLE_API_KEY_ID,
      environment.APPLE_API_ISSUER,
    ];
    completeGroup(notarization, 'Apple notarization');
    if (notarization.every(Boolean) && !identity)
      throw new Error('Apple notarization requires a trusted signing identity.');
    return {
      osxSign: identity
        ? { identity, continueOnError: false }
        : {
            identity: '-',
            identityValidation: false,
            optionsForFile: () => ({ hardenedRuntime: false }),
            continueOnError: false,
          },
      ...(identity && notarization.every(Boolean)
        ? {
            osxNotarize: {
              appleApiKey: environment.APPLE_API_KEY_PATH,
              appleApiKeyId: environment.APPLE_API_KEY_ID,
              appleApiIssuer: environment.APPLE_API_ISSUER,
            },
          }
        : {}),
    };
  }
  if (platform === 'win32') {
    const certificate = [
      environment.WINDOWS_CERTIFICATE_FILE,
      environment.WINDOWS_CERTIFICATE_PASSWORD,
    ];
    completeGroup(certificate, 'Windows signing');
    return certificate.every(Boolean)
      ? {
          windowsSign: {
            certificateFile: environment.WINDOWS_CERTIFICATE_FILE,
            certificatePassword: environment.WINDOWS_CERTIFICATE_PASSWORD,
            description: 'Resonanz',
          },
        }
      : {};
  }
  return {};
}

function completeGroup(values, label) {
  const configured = values.filter(Boolean).length;
  if (configured !== 0 && configured !== values.length)
    throw new Error(`${label} requires its complete credential group.`);
}
