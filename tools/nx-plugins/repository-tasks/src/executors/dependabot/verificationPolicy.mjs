/**
 * Defines the reviewed CI baseline and complete native verification requirements.
 *
 * @internal
 */
export const verificationPolicy = Object.freeze({
  workflowFile: 'ci.yml',
  workflowPath: '.github/workflows/ci.yml',
  workflowName: 'Desktop quality',
  requiredJobs: [
    'Classify changes',
    'Build and exercise desktop (macos-latest)',
    'Build and exercise desktop (windows-latest)',
    'Quality Gate',
  ],
  requiredChecks: [
    'Build and exercise desktop (macos-latest)',
    'Build and exercise desktop (windows-latest)',
    'Quality Gate',
  ],
  reviewedCiSha256: '6f4baf1cf10083654d4e6bcc2ccc07140c3a453dd204dddc2f9a74ac7abf8a08',
});
