-- ============================================================================
-- V015 - Rebuild the org tree to match the approved organization chart
--
-- Target shape:
--
--   u77  Head of the Tax Authority
--   ├── u36  Head's office
--   ├── u76  Deputy Head (u37)
--   ├── u78  "الادرات داخل الادارة العامه" group
--   │   ├── u19  Inspection              (+ u16..u18)
--   │   ├── u23  Revenue accounting      (+ u20, u21, u79, u22)
--   │   ├── u58  Information technology  (+ u53..u57)
--   │   ├── u52  Tax evasion combat      (+ u50..u51)
--   │   ├── u49  Planning & development  (+ u46..u48)
--   │   ├── u15  Admin & financial       (+ u9..u14)
--   │   ├── u8   Technical affairs       (+ u6..u7)
--   │   ├── u2   Internal audit office
--   │   ├── u38  Experts & consultations office
--   │   ├── u45  Legal affairs office    (+ u40..u44, u39)
--   │   ├── u3   Sports activity office
--   │   ├── u4   Tax media & awareness office
--   │   ├── u5   Social welfare fund
--   │   └── u1   Follow-up office
--   └── u35  Regional Executive Administrations
--       └── u24..u34 + u59..u74  (all 27 regional directorates)
--
-- The legacy deputy-level regional container (u75) is emptied and deactivated
-- so it no longer appears in the tree.
--
-- Idempotent: every statement is an idempotent INSERT ... ON DUPLICATE KEY or
-- UPDATE, so the non-tracking runner can re-apply this file after V009/V012 on
-- every migration run.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1) Central group node -------------------------------------------------------
INSERT INTO org_units (parent_id, code, name_ar, name_en, kind, sort_order, is_active)
SELECT p.id, 'u78', 'الادرات داخل الادارة العامه',
       'Directorates inside the General Administration', 'group', 2, 1
FROM org_units p
WHERE p.code = 'u77'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  name_en = VALUES(name_en),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order),
  is_active = 1;

-- 2) Head-level order: head office -> deputy -> central group -> regions ------
UPDATE org_units
SET sort_order = CASE code
  WHEN 'u36' THEN 0
  WHEN 'u76' THEN 1
  WHEN 'u78' THEN 2
  WHEN 'u35' THEN 3
  ELSE sort_order
END
WHERE code IN ('u36', 'u76', 'u78', 'u35');

-- 3) General directorates and offices under the central group ----------------
SET @central_id = (SELECT id FROM org_units WHERE code = 'u78' LIMIT 1);

UPDATE org_units
SET parent_id = @central_id,
    sort_order = CASE code
      WHEN 'u19' THEN 0
      WHEN 'u23' THEN 1
      WHEN 'u58' THEN 2
      WHEN 'u52' THEN 3
      WHEN 'u49' THEN 4
      WHEN 'u15' THEN 5
      WHEN 'u8'  THEN 6
      WHEN 'u2'  THEN 7
      WHEN 'u38' THEN 8
      WHEN 'u45' THEN 9
      WHEN 'u3'  THEN 10
      WHEN 'u4'  THEN 11
      WHEN 'u5'  THEN 12
      WHEN 'u1'  THEN 13
      ELSE sort_order
    END
WHERE @central_id IS NOT NULL
  AND code IN (
    'u19', 'u23', 'u58', 'u52', 'u49', 'u15', 'u8',
    'u2', 'u38', 'u45', 'u3', 'u4', 'u5', 'u1'
  );

-- 4) All 27 regional directorates under the regional group -------------------
SET @regional_id = (SELECT id FROM org_units WHERE code = 'u35' LIMIT 1);

UPDATE org_units
SET parent_id = @regional_id,
    sort_order = CASE code
      WHEN 'u24' THEN 0
      WHEN 'u25' THEN 1
      WHEN 'u26' THEN 2
      WHEN 'u27' THEN 3
      WHEN 'u28' THEN 4
      WHEN 'u29' THEN 5
      WHEN 'u30' THEN 6
      WHEN 'u31' THEN 7
      WHEN 'u32' THEN 8
      WHEN 'u33' THEN 9
      WHEN 'u34' THEN 10
      WHEN 'u59' THEN 11
      WHEN 'u60' THEN 12
      WHEN 'u61' THEN 13
      WHEN 'u62' THEN 14
      WHEN 'u63' THEN 15
      WHEN 'u64' THEN 16
      WHEN 'u65' THEN 17
      WHEN 'u66' THEN 18
      WHEN 'u67' THEN 19
      WHEN 'u68' THEN 20
      WHEN 'u69' THEN 21
      WHEN 'u70' THEN 22
      WHEN 'u71' THEN 23
      WHEN 'u72' THEN 24
      WHEN 'u73' THEN 25
      WHEN 'u74' THEN 26
      ELSE sort_order
    END
WHERE @regional_id IS NOT NULL
  AND code IN (
    'u24', 'u25', 'u26', 'u27', 'u28', 'u29', 'u30', 'u31', 'u32', 'u33', 'u34',
    'u59', 'u60', 'u61', 'u62', 'u63', 'u64', 'u65', 'u66', 'u67', 'u68', 'u69',
    'u70', 'u71', 'u72', 'u73', 'u74'
  );

-- 5) Section order as drawn in the chart -------------------------------------
--    Admin & financial (u15): admin, PR, personnel, services, finance, stores
--    Legal affairs (u45): contracts, cases, investigations, opinions, decisions
UPDATE org_units
SET sort_order = CASE code
  WHEN 'u9'  THEN 0
  WHEN 'u10' THEN 1
  WHEN 'u13' THEN 2
  WHEN 'u12' THEN 3
  WHEN 'u11' THEN 4
  WHEN 'u14' THEN 5
  WHEN 'u40' THEN 0
  WHEN 'u41' THEN 1
  WHEN 'u43' THEN 2
  WHEN 'u44' THEN 3
  WHEN 'u42' THEN 4
  ELSE sort_order
END
WHERE code IN ('u9', 'u10', 'u11', 'u12', 'u13', 'u14', 'u40', 'u41', 'u42', 'u43', 'u44');

-- 6) Administrative section of the legal affairs office ---------------------
--    V009 seeds u39 under the Deputy Head; in the chart it belongs to the
--    legal affairs office, so it is moved here (and appended last).
SET @legal_id = (SELECT id FROM org_units WHERE code = 'u45' LIMIT 1);

UPDATE org_units
SET parent_id = @legal_id,
    sort_order = 5
WHERE @legal_id IS NOT NULL
  AND code = 'u39';

-- 7) Retire the empty legacy deputy-level regional container ----------------
UPDATE org_units SET is_active = 0 WHERE code = 'u75';
