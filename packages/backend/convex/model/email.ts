function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal transactional email body with one call-to-action link. */
export function emailLayout(input: {
  heading: string;
  body: string;
  actionLabel: string;
  url: string;
}) {
  const url = escapeHtml(input.url);
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#fffcf0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#100f0f">
<div style="max-width:480px;margin:0 auto">
<p style="font-weight:600;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:#6f6e69">Armin</p>
<h1 style="font-size:22px;margin:16px 0 8px">${escapeHtml(input.heading)}</h1>
<p style="font-size:15px;line-height:1.5">${escapeHtml(input.body)}</p>
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#205ea6;color:#fffcf0;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(input.actionLabel)}</a></p>
<p style="font-size:13px;color:#6f6e69;word-break:break-all">Or open this link: ${url}</p>
</div></body></html>`;
}
