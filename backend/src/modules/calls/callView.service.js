/**
 * Pure call-view builder.
 *
 * The same stored call is rendered differently for the caller and the callee:
 *   - the caller always sees the callee's real directory entry;
 *   - when the Director or Deputy calls an ordinary employee, the callee sees a
 *     redacted caller (`المدير العام` / `وكيل المصلحة`), cannot call back and is
 *     told to use relay-only ICE;
 *   - leadership-to-leadership and ordinary calls are not redacted.
 *
 * No database access happens here, which keeps the redaction rules easy to
 * deep-equal test.
 */
import { isLeadershipKind } from './callAuth.service.js';

export const DEFAULT_REDACTED_LABELS = Object.freeze({
  director: 'المدير العام',
  deputy: 'وكيل المصلحة',
});

export const REDACTED_LABEL_KEYS = Object.freeze({
  director: 'call.redacted_label.director',
  deputy: 'call.redacted_label.deputy',
});

export const ICE_TRANSPORT_POLICY = Object.freeze({
  DIRECT: 'all',
  RELAY: 'relay',
});

function metadataOf(call) {
  const raw = call?.metadata;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function isoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

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

function normalizedParticipant(participant) {
  const orgUnitKind = participantKind(participant);
  return {
    employeeId: participant?.employeeId ?? participant?.employee_id ?? participant?.id ?? null,
    name: participant?.name ?? participant?.fullNameAr ?? participant?.full_name_ar ?? null,
    nameEn: participant?.nameEn ?? participant?.fullNameEn ?? participant?.full_name_en ?? null,
    avatarUrl: participant?.avatarUrl ?? participant?.avatar_url ?? null,
    unitId:
      participant?.unitId ??
      participant?.orgUnitId ??
      participant?.org_unit_id ??
      participant?.orgUnit?.id ??
      participant?.org_unit?.id ??
      null,
    unitName:
      participant?.unitName ??
      participant?.unitNameAr ??
      participant?.orgUnitName ??
      participant?.org_unit_name ??
      participant?.orgUnit?.nameAr ??
      participant?.orgUnit?.name ??
      participant?.org_unit?.name_ar ??
      null,
    unitNameEn:
      participant?.unitNameEn ??
      participant?.orgUnitNameEn ??
      participant?.org_unit_name_en ??
      participant?.orgUnit?.nameEn ??
      participant?.org_unit?.name_en ??
      null,
    orgUnitKind,
    isLeadership: isLeadershipKind(orgUnitKind),
  };
}

function resolveLabels(labels) {
  return {
    director:
      labels?.director ??
      labels?.[REDACTED_LABEL_KEYS.director] ??
      DEFAULT_REDACTED_LABELS.director,
    deputy:
      labels?.deputy ??
      labels?.[REDACTED_LABEL_KEYS.deputy] ??
      DEFAULT_REDACTED_LABELS.deputy,
  };
}

export function redactedLabelForKind(kind, labels) {
  const resolved = resolveLabels(labels);
  if (kind === 'root') return resolved.director;
  if (kind === 'deputy') return resolved.deputy;
  return null;
}

/**
 * Replaces every identifying field while keeping the shape stable. The ID is
 * intentionally null so it cannot be used to look the caller up in the
 * directory after the call.
 */
export function redactParticipant(_participant, label) {
  return {
    employeeId: null,
    name: label,
    nameEn: label,
    avatarUrl: null,
    unitId: null,
    unitName: null,
    unitNameEn: null,
    orgUnitKind: null,
    isLeadership: true,
    redacted: true,
  };
}

/**
 * Builds the API representation of a call for one participant.
 *
 * `call.callerEmployeeId`, `call.calleeEmployeeId`, `call.callType`, etc. may be
 * snake_case (database row) or camelCase (service object); both are accepted.
 *
 * @returns {object}
 */
export function buildCallView({ call, viewerEmployeeId, caller, callee, labels } = {}) {
  const metadata = metadataOf(call);
  const callerEmployeeId = call?.callerEmployeeId ?? call?.caller_employee_id ?? null;
  const calleeEmployeeId = call?.calleeEmployeeId ?? call?.callee_employee_id ?? null;

  const normalizedCaller = normalizedParticipant(caller);
  const normalizedCallee = normalizedParticipant(callee);

  // Prefer the snapshot taken when the call was created so a later org-unit
  // change cannot retroactively de-anonymize an old leadership call.
  const callerKind = metadata.callerOrgUnitKind ?? normalizedCaller.orgUnitKind;
  const calleeKind = metadata.calleeOrgUnitKind ?? normalizedCallee.orgUnitKind;
  const callerIsLeadership = isLeadershipKind(callerKind);
  const calleeIsLeadership = isLeadershipKind(calleeKind);

  const viewerIsCaller = Boolean(
    viewerEmployeeId && callerEmployeeId && viewerEmployeeId === callerEmployeeId
  );
  const viewerIsCallee = Boolean(
    viewerEmployeeId && calleeEmployeeId && viewerEmployeeId === calleeEmployeeId
  );

  const redacted = Boolean(viewerIsCallee && callerIsLeadership && !calleeIsLeadership);
  // Recorded at invite; older calls fall back to "leadership on either side".
  const relayOnly = Boolean(metadata.relayOnly ?? (callerIsLeadership || calleeIsLeadership));

  let viewCaller = normalizedCaller;
  if (redacted) {
    viewCaller = redactParticipant(caller, redactedLabelForKind(callerKind, labels));
  }

  return {
    id: call?.id ?? null,
    status: call?.status ?? null,
    callType: call?.callType ?? call?.call_type ?? 'audio',
    direction: viewerIsCaller ? 'outgoing' : viewerIsCallee ? 'incoming' : null,
    initiatedAt: isoOrNull(call?.initiatedAt ?? call?.initiated_at),
    answeredAt: isoOrNull(call?.answeredAt ?? call?.answered_at),
    endedAt: isoOrNull(call?.endedAt ?? call?.ended_at),
    durationSeconds: Number(call?.durationSeconds ?? call?.duration_seconds ?? 0),
    redacted,
    canCallBack: !redacted,
    relayOnly,
    iceTransportPolicy: relayOnly ? ICE_TRANSPORT_POLICY.RELAY : ICE_TRANSPORT_POLICY.DIRECT,
    caller: viewCaller,
    callee: normalizedCallee,
  };
}

export default buildCallView;
