/** Human order reference shown to sellers, e.g. "TR-4F9A1C". */
export function orderReference(orderId: string): string {
  return `TR-${orderId.slice(-6).toUpperCase()}`;
}

/**
 * Normalises a stored phone number to the digits-only international form the
 * Cloud API expects ("+263 77 123 4567" -> "263771234567"). Local numbers
 * ("0771234567") get the default country code.
 */
export function normalizePhone(raw: string | null | undefined, defaultCountryCode: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0') && !raw.trim().startsWith('+')) digits = defaultCountryCode + digits.slice(1);
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/**
 * Template parameters may not contain newlines, tabs or more than four consecutive
 * spaces, and may not be empty; Meta rejects the whole send otherwise.
 */
export function templateText(value: string | null | undefined, maxLength = 60): string {
  const text = (value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  if (!text) return '-';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
