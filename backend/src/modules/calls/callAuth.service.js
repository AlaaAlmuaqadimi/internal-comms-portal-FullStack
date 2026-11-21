/**
 * Pure call-authorization policy.
 *
 * This module intentionally has no database, network or Express dependency so
 * the complete decision matrix can be unit tested and reused by both the API
 * and any future signalling process.
 *
 * Rules:
 *   - any active employee may call any other active employee;
 *   - the Director (org unit kind `root`) and the Deputy (kind `deputy`) may
 *     call anyone, including each other;
 *   - unit heads (the head of a directorate, office or section, named
 *     explicitly by an admin, passed in as `isUnitHead`) may call the
 *     Director and the Deputy;
 *   - other employees may never call the Director or Deputy;
 *   - inactive, deleted and unknown targets are denied;
 *   - self-calls are denied.
 *
 * Every target-side denial uses the same public code (CALL_TARGET_FORBIDDEN)
 * and reason is kept for the audit log only. This makes an existing leadership
 * target indistinguishable from an unknown or inactive one to the caller.
 */

export const LEADERSHIP_ORG_UNIT_KINDS = Object.freeze(['root', 'deputy']);

export const CALL_DENIAL_CODES = Object.freeze({
  CALLER_INACTIVE: 'CALLER_INACTIVE',
  CALL_TARGET_FORBIDDEN: 'CALL_TARGET_FORBIDDEN',
});

export const CALL_DENIAL_REASONS = Object.freeze({
  CALLER_INACTIVE: 'CALLER_INACTIVE',
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  TARGET_INACTIVE: 'TARGET_INACTIVE',
  SELF_CALL: 'SELF_CALL',
  TARGET_LEADERSHIP: 'TARGET_LEADERSHIP',
});

const LEADERSHIP_KINDS = new Set(LEADERSHIP_ORG_UNIT_KINDS);

function participantKind(participant) {
  return (
    participant?.orgUnitKind ??
    participant?.unitKind ??
    participant?.org_unit_kind ??
    participant?.orgUnit?.kind ??
    participant?.org_unit?.kind ??
    null
  );
}

function isUnitHead(participant) {
  const value = participant?.isUnitHead ?? participant?.is_unit_head;
  return value === true || value === 1 || value === '1';
}

function participantId(participant) {
  return participant?.employeeId ?? participant?.employee_id ?? participant?.id ?? null;
}

function isInactive(participant) {
  if (!participant) return true;
  const isActive = participant.isActive ?? participant.is_active;
  if (isActive === false || isActive === 0 || isActive === '0') {
    return true;
  }
  return Boolean(participant.deletedAt || participant.deleted_at);
}

function allow() {
  return Object.freeze({
    allowed: true,
    code: null,
    reason: null,
  });
}

function deny(code, reason) {
  return Object.freeze({
    allowed: false,
    code,
    reason,
  });
}

/** True only for the Director's `root` unit and the Deputy's `deputy` unit. */
export function isLeadershipKind(kind) {
  return LEADERSHIP_KINDS.has(kind);
}

export function isLeadershipParticipant(participant) {
  return isLeadershipKind(participantKind(participant));
}

/**
 * Evaluates the policy.
 *
 * Accepts either `evaluateCallPermission(caller, target)` or
 * `evaluateCallPermission({ caller, target })` so callers do not have to shape
 * the arguments in one particular way.
 *
 * @returns {{allowed: boolean, code: string|null, reason: string|null}}
 */
export function evaluateCallPermission(callerOrInput, maybeTarget) {
  const isWrapped = maybeTarget === undefined && callerOrInput && typeof callerOrInput === 'object' &&
    ('caller' in callerOrInput || 'target' in callerOrInput || 'callee' in callerOrInput);

  const caller = isWrapped ? callerOrInput.caller : callerOrInput;
  const target = isWrapped
    ? (callerOrInput.target ?? callerOrInput.callee)
    : maybeTarget;

  if (!caller || isInactive(caller)) {
    return deny(CALL_DENIAL_CODES.CALLER_INACTIVE, CALL_DENIAL_REASONS.CALLER_INACTIVE);
  }

  if (!target) {
    return deny(CALL_DENIAL_CODES.CALL_TARGET_FORBIDDEN, CALL_DENIAL_REASONS.TARGET_NOT_FOUND);
  }

  if (isInactive(target)) {
    return deny(CALL_DENIAL_CODES.CALL_TARGET_FORBIDDEN, CALL_DENIAL_REASONS.TARGET_INACTIVE);
  }

  const callerId = participantId(caller);
  const targetId = participantId(target);
  if (callerId && targetId && callerId === targetId) {
    return deny(CALL_DENIAL_CODES.CALL_TARGET_FORBIDDEN, CALL_DENIAL_REASONS.SELF_CALL);
  }

  // Leadership may call anyone. Keep this before the target check so a
  // leadership caller can reach both ordinary employees and other leaders.
  if (isLeadershipParticipant(caller)) {
    return allow();
  }

  // A unit head may reach the Director and the Deputy.
  if (isLeadershipParticipant(target) && isUnitHead(caller)) {
    return allow();
  }

  if (isLeadershipParticipant(target)) {
    return deny(
      CALL_DENIAL_CODES.CALL_TARGET_FORBIDDEN,
      CALL_DENIAL_REASONS.TARGET_LEADERSHIP
    );
  }

  return allow();
}

/** Boolean convenience wrapper around {@link evaluateCallPermission}. */
export function canCall(caller, target) {
  return evaluateCallPermission(caller, target).allowed;
}

/** Descriptive aliases for callers that prefer an authorization verb. */
export const authorizeCall = evaluateCallPermission;
export const checkCallPermission = evaluateCallPermission;

export default evaluateCallPermission;
