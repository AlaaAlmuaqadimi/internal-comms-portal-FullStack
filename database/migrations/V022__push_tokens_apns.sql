-- ============================================================================
-- V022 - iPhone push tokens (Phase D: APNs VoIP)
--
-- iPhones register an APNs VoIP (PushKit) device token instead of an FCM
-- token. The provider column tells the sender which service to use:
--   fcm        Android, Firebase Cloud Messaging data message
--   apns_voip  iPhone, Apple Push Notification service VoIP push
--
-- Idempotent: the runner replays every file on every run; re-applying the
-- same column definition and update is harmless.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE push_tokens
  MODIFY provider ENUM('fcm','apns_voip') NOT NULL DEFAULT 'fcm';

-- Rows saved before this migration were all Android FCM tokens; any iPhone
-- row (none expected) is moved to the right provider.
UPDATE push_tokens SET provider = 'apns_voip' WHERE platform = 'ios' AND provider = 'fcm';
