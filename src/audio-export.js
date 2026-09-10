// KOSIF audio export helper.
// Prefer the iOS share sheet, then a standards-based download, then opening
// the local blob URL as a last resort. Nothing here uploads audio anywhere.

const EXTENSIONS = [
  [/mp4|m4a|aac/i, 'm4a'],
  [/mpeg|mp3/i, 'mp3'],
  [/ogg|opus/i, 'ogg'],
  [/wav/i, 'wav'],
  [/webm/i, 'webm'],
];

export function extensionFor(mimeType = '') {
  return EXTENSIONS.find(([pattern]) => pattern.test(String(mimeType)))?.[1] || 'webm';
}

export function isTouchAppleDevice(navigatorObject = globalThis.navigator) {
  if (!navigatorObject) return false;
  return /iP(hone|ad|od)/.test(navigatorObject.platform || '')
    || /iPhone|iPad|iPod/.test(navigatorObject.userAgent || '')
    || (/Mac/.test(navigatorObject.platform || '') && (navigatorObject.maxTouchPoints || 0) > 1);
}

export async function downloadAudioBlob(blob, filename = 'kosif-response.webm', {
  preferShare = isTouchAppleDevice(),
  navigatorObject = globalThis.navigator,
  documentObject = globalThis.document,
  urlObject = globalThis.URL,
  windowObject = globalThis.window,
} = {}) {
  if (!(blob instanceof Blob)) throw new TypeError('AUDIO_BLOB_REQUIRED');
  const type = blob.type || 'application/octet-stream';

  if (preferShare && navigatorObject && typeof File === 'function' && navigatorObject.share && navigatorObject.canShare) {
    try {
      const file = new File([blob], filename, { type });
      if (navigatorObject.canShare({ files: [file] })) {
        await navigatorObject.share({ files: [file], title: 'رد KOSIF الصوتي' });
        return 'share';
      }
    } catch (error) {
      if (error?.name === 'AbortError') return 'share';
    }
  }

  if (!urlObject?.createObjectURL) throw new Error('AUDIO_EXPORT_UNAVAILABLE');
  const url = urlObject.createObjectURL(blob);
  let revoked = false;
  const revokeLater = () => {
    if (revoked) return;
    revoked = true;
    setTimeout(() => urlObject.revokeObjectURL?.(url), 60_000);
  };

  try {
    if (documentObject?.createElement && documentObject.body) {
      const link = documentObject.createElement('a');
      const supportsDownload = 'download' in link;
      link.href = url;
      link.rel = 'noopener';
      if (supportsDownload) link.download = filename;
      else link.target = '_blank';
      documentObject.body.appendChild(link);
      link.click();
      link.remove();
      revokeLater();
      return supportsDownload ? 'download' : 'open';
    }
  } catch {
    // Fall through to window.open for older Safari/WebView behavior.
  }

  try {
    windowObject?.open?.(url, '_blank', 'noopener');
    revokeLater();
    return 'open';
  } catch {
    revokeLater();
    throw new Error('AUDIO_EXPORT_UNAVAILABLE');
  }
}
