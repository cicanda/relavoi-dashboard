/**
 * Nigerian mobile numbers, as people actually type them.
 *
 * A seller entering a rider's number types it the way it is printed on a
 * sticker or saved in their phone: 08012345678, sometimes 8012345678, and
 * occasionally +234 801 234 5678. The API takes E.164 only, so the dashboard
 * converts rather than scolding, and only refuses what cannot be a Nigerian
 * mobile number at all.
 */

/** National significant number: ten digits beginning 7, 8 or 9. */
const NG_MOBILE = /^[789]\d{9}$/;

export interface NormalisedPhone {
  /** The national significant digits understood so far. */
  digits: string;
  /** E.164, or null while the input is not yet a valid Nigerian mobile number. */
  e164: string | null;
  /**
   * Why this can never become valid, or null when it is valid or simply
   * unfinished. A field shows this; it does not show "too short" at the
   * fourth digit.
   */
  problem: string | null;
}

export const NG_EXAMPLE = "08012345678";

/**
 * Read an input as a Nigerian mobile number.
 *
 * Accepts +234…, 234…, 0…, or the bare ten digits, with any spacing or
 * punctuation. Everything is reduced to the national significant number first,
 * which is what the shape check is about.
 */
export function normaliseNgPhone(raw: string): NormalisedPhone {
  const typed = raw.replace(/[^\d+]/g, "");
  let digits = typed.replace(/\D/g, "");

  // Strip whichever prefix was used to reach the national number.
  if (digits.startsWith("234")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");

  if (digits.length === 0) {
    return { digits, e164: null, problem: null };
  }
  if (!/^[789]/.test(digits)) {
    return {
      digits,
      e164: null,
      problem: `Nigerian mobile numbers start 070, 080, 081, 090 or 091. Example: ${NG_EXAMPLE}.`,
    };
  }
  if (digits.length > 10) {
    return { digits, e164: null, problem: "That is too long for a Nigerian mobile number." };
  }
  if (!NG_MOBILE.test(digits)) {
    // Still being typed: nothing to complain about yet.
    return { digits, e164: null, problem: null };
  }
  return { digits, e164: `+234${digits}`, problem: null };
}

/**
 * The message to show when a field is submitted unfinished. Separate from
 * `problem` so an incomplete number is only called out once it matters.
 */
export function incompleteMessage(): string {
  return `Enter the full number, all 11 digits. Example: ${NG_EXAMPLE}.`;
}
