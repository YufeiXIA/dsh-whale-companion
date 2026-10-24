// Chromium seeks WebM via byte ranges, including reads near the final cue table.
export function serveAnimation(req, res, bytes) {
  const headers = { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
  if (!req.headers.range) {
    res.writeHead(200, { ...headers, 'content-length': bytes.length });
    return res.end(bytes);
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  const start = range?.[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range?.[2]));
  const end = range?.[1] && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
  if (!range || (!range[1] && !range[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= bytes.length || end < start) {
    res.writeHead(416, { ...headers, 'content-range': `bytes */${bytes.length}` });
    return res.end();
  }
  res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${bytes.length}`, 'content-length': end - start + 1 });
  res.end(bytes.subarray(start, end + 1));
}
