/**
 * Reliable cross-browser CSV and binary file downloader.
 * Ensures explicit MIME types, DOM retention during download initialization,
 * and clean delayed cleanup to prevent Chromium from saving as raw UUIDs.
 */
export function downloadBlobFile(data, defaultFilename) {
  // Ensure typed blob so Chrome identifies the file format correctly
  const blob = data instanceof Blob
    ? (data.type ? data : new Blob([data], { type: 'text/csv;charset=utf-8;' }))
    : new Blob([data], { type: 'text/csv;charset=utf-8;' });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.style.position = 'fixed';
  link.style.left = '-9999px';
  link.style.top = '-9999px';
  link.href = url;

  const safeFilename = defaultFilename.endsWith('.csv') ? defaultFilename : `${defaultFilename}.csv`;
  link.setAttribute('download', safeFilename);
  link.download = safeFilename;

  document.body.appendChild(link);
  link.click();

  // Keep element in DOM briefly while browser dispatches download to native shelf
  setTimeout(() => {
    try {
      if (link.parentNode) {
        document.body.removeChild(link);
      }
      window.URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, 1500);
}
