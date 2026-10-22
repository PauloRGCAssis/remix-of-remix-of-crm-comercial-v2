/**
 * Formats a Brazilian phone number for display.
 * Landline: (31) 1234-1234
 * Mobile:   (31) 91234-1234
 */
export function formatPhone(raw?: string | null): string {
  if (!raw) return '';
  
  // Strip everything except digits
  const digits = raw.replace(/\D/g, '');
  
  if (digits.length === 11) {
    // Mobile with DDD: (XX) XXXXX-XXXX
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    // Landline with DDD: (XX) XXXX-XXXX
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9) {
    // Mobile without DDD – assume 31: (31) XXXXX-XXXX
    return `(31) ${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  if (digits.length === 8) {
    // Landline without DDD – assume 31: (31) XXXX-XXXX
    return `(31) ${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  
  // Return original if it doesn't match expected patterns
  return raw;
}
