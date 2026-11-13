/**
 * Serializes structured data to JSON while escaping '<' as '\\u003c' to prevent script-tag
 * breakout and XSS vulnerabilities when rendered into inline <script type="application/ld+json">
 * elements via dangerouslySetInnerHTML.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
