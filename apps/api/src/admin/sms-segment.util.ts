/**
 * GSM 03.38 & UCS-2 SMS Segment Calculator with Grapheme-Cluster Protection
 * Adheres to TRAI TCCCPR 2018 & 3GPP TS 23.038 / TS 23.040 Standards
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
  graphemeCount: number;
  effectiveLength: number;
  segmentCount: number;
  maxCharsCurrentSegment: number;
  segments: string[];
}

/**
 * Normalizes text to Unicode NFC and extracts atomic extended grapheme clusters.
 * Protects Hindi Devanagari ligatures (e.g. ZWJ \u200D, ZWNJ \u200C, matras) from splitting.
 */
export function getGraphemeClusters(text: string): string[] {
  if (!text) return [];
  const normalized = text.normalize('NFC');
  const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
  return Array.from(segmenter.segment(normalized), (s) => s.segment);
}

/**
 * Calculates the exact character count, encoding, billing segment count,
 * and grapheme-safe segment splits for an SMS body.
 */
export function calculateSmsSegments(rawText: string): SmsSegmentationResult {
  if (!rawText || rawText.length === 0) {
    return {
      encoding: 'GSM-7',
      characterCount: 0,
      graphemeCount: 0,
      effectiveLength: 0,
      segmentCount: 1,
      maxCharsCurrentSegment: 160,
      segments: [''],
    };
  }

  const text = rawText.normalize('NFC');
  const graphemes = getGraphemeClusters(text);
  const graphemeCount = graphemes.length;

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

    const maxPerSeg = segmentCount === 1 ? 160 : 153;
    const segments: string[] = [];
    let currentSegment = '';
    let currentLen = 0;

    for (const g of graphemes) {
      let gLen = 0;
      for (const c of g) {
        gLen += GSM_7_EXTENDED.has(c) ? 2 : 1;
      }

      if (currentLen + gLen > maxPerSeg && currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = g;
        currentLen = gLen;
      } else {
        currentSegment += g;
        currentLen += gLen;
      }
    }
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    return {
      encoding: 'GSM-7',
      characterCount: text.length,
      graphemeCount,
      effectiveLength,
      segmentCount: Math.max(segmentCount, segments.length || 1),
      maxCharsCurrentSegment: segmentCount === 1 ? 160 : segmentCount * 153,
      segments: segments.length > 0 ? segments : [text],
    };
  }

  // UCS-2 (Unicode / Hindi Devanagari / emojis)
  const ucs2Length = text.length; // UTF-16 code units (each code unit is 2 bytes)
  const segmentCount =
    ucs2Length <= 70
      ? 1
      : Math.ceil(ucs2Length / 67);

  const maxPerSeg = segmentCount === 1 ? 70 : 67;
  const segments: string[] = [];
  let currentSegment = '';
  let currentCodeUnits = 0;

  for (const g of graphemes) {
    const gCodeUnits = g.length; // UTF-16 code units for this grapheme

    if (currentCodeUnits + gCodeUnits > maxPerSeg && currentSegment.length > 0) {
      segments.push(currentSegment);
      currentSegment = g;
      currentCodeUnits = gCodeUnits;
    } else {
      currentSegment += g;
      currentCodeUnits += gCodeUnits;
    }
  }
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return {
    encoding: 'UCS-2',
    characterCount: text.length,
    graphemeCount,
    effectiveLength: ucs2Length,
    segmentCount: Math.max(segmentCount, segments.length || 1),
    maxCharsCurrentSegment: segmentCount === 1 ? 70 : segmentCount * 67,
    segments: segments.length > 0 ? segments : [text],
  };
}

/**
 * Splits an SMS string into an array of grapheme-safe segment strings.
 */
export function splitSmsIntoSegments(text: string): string[] {
  return calculateSmsSegments(text).segments;
}

/**
 * Interpolates variables in a template string e.g. "Hello {#name#}" with { name: "Ramesh" }
 */
export function interpolateTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{#([a-zA-Z0-9_]+)#\}/g, (_, key) => {
    return variables[key] !== undefined ? variables[key] : `{#${key}#}`;
  });
}

/**
 * Validates DLT template variable parameters to prevent delimiter injection or oversize fields.
 */
export function validateDltTemplateVariables(
  template: string,
  variables: Record<string, string>,
  constraints?: Record<string, { maxLength?: number; required?: boolean }>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const placeholderRegex = /\{#([a-zA-Z0-9_]+)#\}/g;
  let match: RegExpExecArray | null;
  const foundKeys = new Set<string>();

  while ((match = placeholderRegex.exec(template)) !== null) {
    if (match[1]) {
      foundKeys.add(match[1]);
    }
  }

  for (const key of foundKeys) {
    const value = variables[key];
    const constraint = constraints?.[key];

    if (constraint?.required && (!value || value.trim().length === 0)) {
      errors.push(`Missing required template variable: ${key}`);
    }

    if (value) {
      if (value.includes('{#') || value.includes('#}')) {
        errors.push(`Variable ${key} contains illegal delimiter sequences`);
      }
      if (constraint?.maxLength && value.length > constraint.maxLength) {
        errors.push(`Variable ${key} exceeds maximum length of ${constraint.maxLength} characters`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
