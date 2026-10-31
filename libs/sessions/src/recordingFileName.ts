/**
 * Chooses a fixed extension from a known MIME type, never from user-controlled paths.
 *
 * @public
 */
export function recordingFileName(mimeType: string): string {
  const mime = mimeType.split(';', 1)[0]?.toLowerCase();
  switch (mime) {
    case 'audio/wav':
    case 'audio/x-wav':
      return 'recording.wav';
    case 'audio/mpeg':
      return 'recording.mp3';
    case 'audio/mp4':
    case 'video/mp4':
      return 'recording.m4a';
    case 'audio/ogg':
      return 'recording.ogg';
    case 'audio/flac':
      return 'recording.flac';
    default:
      return 'recording.webm';
  }
}
