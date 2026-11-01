/**
 * Client-side validation for the Add Employee form.
 *
 * Mirrors the zod rules in backend/src/modules/users/user.schemas.js so the
 * user sees the same message before the request is sent. The server remains
 * the source of truth - this module only prevents obviously invalid submits.
 */

export const FIELD_ORDER = [
  'fullNameAr',
  'fullNameEn',
  'username',
  'password',
  'confirmPassword',
  'email',
  'jobTitleAr',
  'extension',
  'roleCode',
  'orgUnitId',
];

// Edit mode never validates the username (it is read-only) and treats the
// password as optional unless the employee has no login account yet.
export const EDIT_FIELD_ORDER = FIELD_ORDER.filter((field) => field !== 'username');

export const ROLE_VALUES = ['admin', 'employee'];

const FULL_NAME_RE = /^[A-Za-z\u0621-\u064A\u066E-\u066F\u0671-\u06D3\u06FA-\u06FF ]+$/;
const ENGLISH_NAME_RE = /^[A-Za-z ]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DIGITS_RE = /^\d+$/;
const USERNAME_RE = /^[a-z0-9._-]+$/;

const asText = (value) => (typeof value === 'string' ? value : '');

/** Returns the first error message for one field, or null. */
export function validateField(field, formData, t, options = {}) {
  const raw = asText(formData[field]);
  const value = raw.trim();
  const passwordOptional = options.passwordOptional === true;

  switch (field) {
    case 'fullNameAr': {
      if (!value) return t('addUser.fullNameRequired');
      if (value.length < 4) return t('addUser.fullNameMin');
      if (value.length > 100) return t('addUser.fullNameMax');
      if (!FULL_NAME_RE.test(value)) return t('addUser.fullNameChars');
      return null;
    }
    case 'fullNameEn': {
      if (!value) return t('addUser.englishNameRequired');
      if (value.length < 4) return t('addUser.englishNameMin');
      if (value.length > 100) return t('addUser.englishNameMax');
      if (!ENGLISH_NAME_RE.test(value)) return t('addUser.englishNameChars');
      return null;
    }
    case 'username': {
      if (!value) return t('addUser.usernameRequired');
      if (value.length < 3 || value.length > 64) return t('addUser.usernameInvalid');
      if (!USERNAME_RE.test(value)) return t('addUser.usernameInvalid');
      return null;
    }
    case 'password': {
      if (!raw) return passwordOptional ? null : t('addUser.passwordRequired');
      if (raw.length < 8) return t('addUser.passwordMin');
      return null;
    }
    case 'confirmPassword': {
      if (!raw) {
        return passwordOptional && !asText(formData.password)
          ? null
          : t('addUser.confirmRequired');
      }
      if (raw !== formData.password) return t('addUser.passwordsMismatch');
      return null;
    }
    case 'email': {
      if (!value) return t('addUser.emailRequired');
      if (value.length > 255 || !EMAIL_RE.test(value)) return t('addUser.emailInvalid');
      return null;
    }
    case 'jobTitleAr': {
      if (!value || value.length < 2) return t('addUser.jobTitleRequired');
      return null;
    }
    case 'extension': {
      if (!value) return t('addUser.extensionRequired');
      if (!DIGITS_RE.test(value) || value.length < 3) return t('addUser.extensionInvalid');
      return null;
    }
    case 'roleCode': {
      if (!value || !ROLE_VALUES.includes(value)) return t('addUser.roleRequired');
      return null;
    }
    case 'orgUnitId': {
      if (!value) return t('addUser.unitRequired');
      return null;
    }
    default:
      return null;
  }
}

/** Returns an object keyed by field, in field order. */
export function validateEmployeeForm(formData, t, options = {}) {
  const errors = {};
  const order = options.edit ? EDIT_FIELD_ORDER : FIELD_ORDER;
  for (const field of order) {
    const message = validateField(field, formData, t, options);
    if (message) errors[field] = message;
  }
  return errors;
}

/** Recommendation only - not enforced, matching the spec. */
export function passwordMeetsRecommendation(password) {
  const value = asText(password);
  return /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);
}

/**
 * Optimistic client-side username preview while the debounced server check
 * is in flight. Mirrors the server's `first.last` rule.
 */
export function previewUsernameLocally(fullNameEn) {
  const parts = asText(fullNameEn)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '';
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  const base = last ? `${first}.${last}` : first;
  return base.slice(0, 50);
}
