/**
 * GSM 03.38 & UCS-2 SMS Segment Calculator
 * Adheres to TRAI / 3GPP TS 23.038 Standards
 */

// GSM 7-bit Default Alphabet (Basic Character Set)
const GSM_7_BASIC = new Set([
  '@', '£', '$', '¥', 'è', 'é', 'ù', 'ì', 'ò', 'Ç', '\n', 'Ø', 'ø', '\r', 'Å', 'å',
  'Δ', '_', 'Φ', 'Γ', 'Λ', 'Ω', 'Π', 'Ψ', 'Σ', 'Θ', 'Ξ', '\x1b', 'Æ', 'æ', 'ß', 'É',
  ' ', '!', '"', '#', '¤', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?',
  '¡', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Ä', 'Ö', 'Ñ', 'Ü', '§',
  '¿', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
  'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'ä', 'ö', 'ñ', 'ü', 'à',
]);

// GSM 7-bit Extension Characters (count as 2 septets / 2 character equivalents)
const GSM_7_EXTENDED = new Set(['^', '{', '}', '\\', '[', '~', ']', '|', '€']);

export interface SmsSegmentationResult {
  encoding: 'GSM-7' | 'UCS-2';
  characterCount: number;
  effectiveLength: number;
  segmentCount: number;
  maxCharsCurrentSegment: number;
}

/**
 * Calculates the exact character count, encoding, and billing segment count for an SMS body.
 */
export function calculateSmsSegments(text: string): SmsSegmentationResult {
  if (!text || text.length === 0) {
    return {
      encoding: 'GSM-7',
      characterCount: 0,
      effectiveLength: 0,
      segmentCount: 1,
      maxCharsCurrentSegment: 160,
    };
  }

  let isGsm = true;
  let effectiveLength = 0;

  for (const char of text) {
    if (GSM_7_EXTENDED.has(char)) {
      effectiveLength += 2;
    } else if (GSM_7_BASIC.has(char)) {
      effectiveLength += 1;
    } else {
      isGsm = false;
      break;
    }
  }

  if (isGsm) {
    const segmentCount =
      effectiveLength <= 160
        ? 1
        : Math.ceil(effectiveLength / 153);

    return {
      encoding: 'GSM-7',
      characterCount: text.length,
      effectiveLength,
      segmentCount,
      maxCharsCurrentSegment: segmentCount === 1 ? 160 : segmentCount * 153,
    };
  }

  // UCS-2 (Unicode / Hindi Devanagari / emojis)
  const ucs2Length = Array.from(text).length; // Handles surrogate pairs safely
  const segmentCount =
    ucs2Length <= 70
      ? 1
      : Math.ceil(ucs2Length / 67);

  return {
    encoding: 'UCS-2',
    characterCount: text.length,
    effectiveLength: ucs2Length,
    segmentCount,
    maxCharsCurrentSegment: segmentCount === 1 ? 70 : segmentCount * 67,
  };
}

/**
 * Interpolates variables in a template string e.g. "Hello {#name#}" with { name: "Ramesh" }
 */
export function interpolateTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{#([a-zA-Z0-9_]+)#\}/g, (_, key) => {
    return variables[key] !== undefined ? variables[key] : `{#${key}#}`;
  });
}
