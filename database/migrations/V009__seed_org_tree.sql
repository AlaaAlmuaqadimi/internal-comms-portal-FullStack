-- ============================================================================
-- V009 - Seed organization tree (77 units) from legacy org.json
-- Generated from git history (FrontEnd/data/org.json @ dd2ee3a).
-- Parent-before-child inserts; idempotent by unique org_units.code.
--
-- Reporting lines under the Head (u77):
--   u36  Office of the Head of Authority
--   u1..u5   Monitoring / Internal Audit / Sports / Tax Awareness /
--            Social Welfare Fund sub-offices
--   u8, u15, u19, u23   General administrations (Technical Affairs,
--            Administrative & Financial Affairs, Inspection, Revenue
--            Accounting) and their sections
--   u76  Deputy Head of Authority
--
-- The Head office and its sub-offices, the general administrations and the
-- deputy all report directly to u77. The four administrations keep their own
-- sections; only their top-level parent changes from u36 to u77.
-- ============================================================================

SET NAMES utf8mb4;

-- root
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
VALUES (NULL, 'u77', 'رئيس مصلحة الضرائب', 'root', 0)
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u77 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u77';

-- u36
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u36', 'مكتب شؤون رئيس المصلحة', 'office', 0
FROM org_units p WHERE p.code = 'u77'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u36 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u36';

-- u1
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u1', 'مكتب المتابعة', 'office', 2
FROM org_units p WHERE p.code = 'u77'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u1 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u1';

-- u2
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u2', 'مكتب المراجعة الداخلية', 'office', 3
FROM org_units p WHERE p.code = 'u77'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u2 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u2';

-- u3
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u3', 'مكتب النشاط الرياضي', 'office', 4
FROM org_units p WHERE p.code = 'u77'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u3 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u3';

-- u4
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u4', 'مكتب الإعلام والتثقيف الضريبي', 'office', 5
FROM org_units p WHERE p.code = 'u77'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u4 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u4';

-- u5
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u5', 'صندوق الرعاية الاجتماعية', 'office', 6
FROM org_units p WHERE p.code = 'u77'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u5 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u5';

-- u8
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u8', 'إدارة الشؤون الفنية', 'directorate', 7
FROM org_units p WHERE p.code = 'u77'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u8 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u8';

-- u6
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u6', 'قسم إصدار المستندات الضريبية', 'section', 0
FROM org_units p WHERE p.code = 'u8'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u7
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u7', 'قسم التعاون والإتفاقيات الدولية', 'section', 1
FROM org_units p WHERE p.code = 'u8'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u15
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u15', 'إدارة الشؤون الإدارية والمالية', 'directorate', 8
FROM org_units p WHERE p.code = 'u77'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u15 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u15';

-- u9
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u9', 'قسم الشؤون الإدارية', 'section', 0
FROM org_units p WHERE p.code = 'u15'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u10
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u10', 'قسم العلاقات العامة', 'section', 1
FROM org_units p WHERE p.code = 'u15'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u11
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u11', 'قسم الشؤون المالية', 'section', 2
FROM org_units p WHERE p.code = 'u15'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u12
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u12', 'قسم الخدمات', 'section', 3
FROM org_units p WHERE p.code = 'u15'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u13
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u13', 'قسم شؤون الموظفين', 'section', 4
FROM org_units p WHERE p.code = 'u15'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u14
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u14', 'قسم الحركة / الصيانة', 'section', 5
FROM org_units p WHERE p.code = 'u15'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u19
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u19', 'إدارة التفتيش', 'directorate', 9
FROM org_units p WHERE p.code = 'u77'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u19 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u19';

-- u16
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u16', 'قسم الإشراف والتفتيش', 'section', 0
FROM org_units p WHERE p.code = 'u19'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u17
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u17', 'قسم المتابعة والتقارير', 'section', 1
FROM org_units p WHERE p.code = 'u19'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u18
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u18', 'قسم بالإدارات والمناطق', 'section', 2
FROM org_units p WHERE p.code = 'u19'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u23
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u23', 'إدارة محاسبة الإيرادات', 'directorate', 10
FROM org_units p WHERE p.code = 'u77'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u23 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u23';

-- u20
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u20', 'قسم التدقيق والمراجعة', 'section', 0
FROM org_units p WHERE p.code = 'u23'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u21
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u21', 'قسم الإحصاء ومطابقة الحسابات', 'section', 1
FROM org_units p WHERE p.code = 'u23'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u22
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u22', 'قسم إدخال البيانات', 'section', 2
FROM org_units p WHERE p.code = 'u23'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u35
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u35', 'الإدارات التنفيذية بالمناطق (فرع مكتب شؤون الرئيس)', 'group', 9
FROM org_units p WHERE p.code = 'u36'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u24
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u24', 'إدارة ضرائب طرابلس', 'directorate', 0
FROM org_units p WHERE p.code = 'u35'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u24 -> kitchens: مطبخ إدارة ضرائب طرابلس
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب طرابلس')
WHERE u.code = 'u24';

-- u25
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u25', 'إدارة ضرائب بنغازي', 'directorate', 1
FROM org_units p WHERE p.code = 'u35'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u25 -> kitchens: مطبخ إدارة ضرائب بنغازي
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب بنغازي')
WHERE u.code = 'u25';

-- u26
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u26', 'إدارة ضرائب مصراتة', 'directorate', 2
FROM org_units p WHERE p.code = 'u35'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u26 -> kitchens: مطبخ إدارة ضرائب مصراتة
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب مصراتة')
WHERE u.code = 'u26';

-- u27
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u27', 'إدارة ضرائب خليج السدرة', 'directorate', 3
FROM org_units p WHERE p.code = 'u35'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u27 -> kitchens: مطبخ إدارة ضرائب خليج السدرة
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب خليج السدرة')
WHERE u.code = 'u27';

-- u28
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u28', 'إدارة ضرائب الواحات', 'directorate', 4
FROM org_units p WHERE p.code = 'u35'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u28 -> kitchens: مطبخ إدارة ضرائب الواحات
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب الواحات')
WHERE u.code = 'u28';

-- u29
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u29', 'إدارة ضرائب المرقب', 'directorate', 5
FROM org_units p WHERE p.code = 'u35'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u29 -> kitchens: مطبخ إدارة ضرائب المرقب
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب المرقب')
WHERE u.code = 'u29';

-- u30
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u30', 'إدارة ضرائب غريان', 'directorate', 6
FROM org_units p WHERE p.code = 'u35'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u30 -> kitchens: مطبخ إدارة ضرائب غريان
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب غريان')
WHERE u.code = 'u30';

-- u31
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u31', 'إدارة ضرائب سبها', 'directorate', 7
FROM org_units p WHERE p.code = 'u35'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u31 -> kitchens: مطبخ إدارة ضرائب سبها
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب سبها')
WHERE u.code = 'u31';

-- u32
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u32', 'إدارة ضرائب مرادة', 'directorate', 8
FROM org_units p WHERE p.code = 'u35'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u32 -> kitchens: مطبخ إدارة ضرائب مرادة
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب مرادة')
WHERE u.code = 'u32';

-- u33
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u33', 'إدارة ضرائب سرت', 'directorate', 9
FROM org_units p WHERE p.code = 'u35'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u33 -> kitchens: مطبخ إدارة ضرائب سرت
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب سرت')
WHERE u.code = 'u33';

-- u34
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u34', 'إدارة ضرائب العجيلات', 'directorate', 10
FROM org_units p WHERE p.code = 'u35'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u34 -> kitchens: مطبخ إدارة ضرائب العجيلات
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب العجيلات')
WHERE u.code = 'u34';

-- u76
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u76', 'نائب رئيس المصلحة', 'deputy', 1
FROM org_units p WHERE p.code = 'u77'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u76 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u76';

-- u37
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u37', 'مكتب شؤون نائب رئيس المصلحة', 'office', 0
FROM org_units p WHERE p.code = 'u76'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u37 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u37';

-- u38
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u38', 'مكتب الخبراء والاستشارات', 'office', 1
FROM org_units p WHERE p.code = 'u76'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u38 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u38';

-- u39
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u39', 'قسم شؤون إدارية', 'section', 2
FROM org_units p WHERE p.code = 'u76'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u39 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u39';

-- u45
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u45', 'مكتب الشؤون القانونية', 'office', 3
FROM org_units p WHERE p.code = 'u76'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u45 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u45';

-- u40
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u40', 'قسم العقود', 'section', 0
FROM org_units p WHERE p.code = 'u45'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u41
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u41', 'قسم القضايا', 'section', 1
FROM org_units p WHERE p.code = 'u45'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u42
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u42', 'قسم القرارات', 'section', 2
FROM org_units p WHERE p.code = 'u45'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u43
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u43', 'قسم التحقيقات', 'section', 3
FROM org_units p WHERE p.code = 'u45'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u44
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u44', 'قسم الآراء القانونية', 'section', 4
FROM org_units p WHERE p.code = 'u45'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u49
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u49', 'إدارة التخطيط والتطوير', 'directorate', 4
FROM org_units p WHERE p.code = 'u76'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u49 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u49';

-- u46
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u46', 'قسم التدريب والتأهيل', 'section', 0
FROM org_units p WHERE p.code = 'u49'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u47
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u47', 'قسم المتابعة والتقييم', 'section', 1
FROM org_units p WHERE p.code = 'u49'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u48
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u48', 'قسم البحوث والدراسات', 'section', 2
FROM org_units p WHERE p.code = 'u49'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u52
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u52', 'إدارة مكافحة التهرب الضريبي', 'directorate', 5
FROM org_units p WHERE p.code = 'u76'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u52 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u52';

-- u50
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u50', 'قسم المعلومات والمتابعة الميدانية', 'section', 0
FROM org_units p WHERE p.code = 'u52'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u51
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u51', 'قسم التحقيق ومتابعة الدعاوى القضائية', 'section', 1
FROM org_units p WHERE p.code = 'u52'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u58
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u58', 'إدارة المعلوماتية', 'directorate', 6
FROM org_units p WHERE p.code = 'u76'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u58 -> kitchens: مطبخ 1, مطبخ 2
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ 1', 'مطبخ 2')
WHERE u.code = 'u58';

-- u53
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u53', 'قسم البرمجة والتطوير', 'section', 0
FROM org_units p WHERE p.code = 'u58'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u54
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u54', 'قسم الشبكات والدعم الفني', 'section', 1
FROM org_units p WHERE p.code = 'u58'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u55
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u55', 'قسم التوثيق والمعلومات', 'section', 2
FROM org_units p WHERE p.code = 'u58'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u56
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u56', 'قسم أمن المعلومات', 'section', 3
FROM org_units p WHERE p.code = 'u58'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u57
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u57', 'وحدة الاتصالات', 'section', 4
FROM org_units p WHERE p.code = 'u58'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u75
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u75', 'الإدارات التنفيذية بالمناطق (فرع نائب الرئيس)', 'group', 7
FROM org_units p WHERE p.code = 'u76'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u59
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u59', 'إدارة ضرائب الجفارة', 'directorate', 0
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u59 -> kitchens: مطبخ إدارة ضرائب الجفارة
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب الجفارة')
WHERE u.code = 'u59';

-- u60
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u60', 'إدارة ضرائب تاجوراء', 'directorate', 1
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u60 -> kitchens: مطبخ إدارة ضرائب تاجوراء
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب تاجوراء')
WHERE u.code = 'u60';

-- u61
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u61', 'إدارة ضرائب أجدابيا', 'directorate', 2
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u61 -> kitchens: مطبخ إدارة ضرائب أجدابيا
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب أجدابيا')
WHERE u.code = 'u61';

-- u62
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u62', 'إدارة ضرائب الجبل الأخضر', 'directorate', 3
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u62 -> kitchens: مطبخ إدارة ضرائب الجبل الأخضر
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب الجبل الأخضر')
WHERE u.code = 'u62';

-- u63
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u63', 'إدارة ضرائب زليتن', 'directorate', 4
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u63 -> kitchens: مطبخ إدارة ضرائب زليتن
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب زليتن')
WHERE u.code = 'u63';

-- u64
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u64', 'إدارة ضرائب جنزور', 'directorate', 5
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u64 -> kitchens: مطبخ إدارة ضرائب جنزور
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب جنزور')
WHERE u.code = 'u64';

-- u65
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u65', 'إدارة ضرائب الزاوية', 'directorate', 6
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u65 -> kitchens: مطبخ إدارة ضرائب الزاوية
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب الزاوية')
WHERE u.code = 'u65';

-- u66
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u66', 'إدارة ضرائب طبرق', 'directorate', 7
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u66 -> kitchens: مطبخ إدارة ضرائب طبرق
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب طبرق')
WHERE u.code = 'u66';

-- u67
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u67', 'إدارة ضرائب الحزام', 'directorate', 8
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u67 -> kitchens: مطبخ إدارة ضرائب الحزام
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب الحزام')
WHERE u.code = 'u67';

-- u68
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u68', 'إدارة ضرائب المرج', 'directorate', 9
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u68 -> kitchens: مطبخ إدارة ضرائب المرج
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب المرج')
WHERE u.code = 'u68';

-- u69
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u69', 'إدارة ضرائب الكفرة', 'directorate', 10
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u69 -> kitchens: مطبخ إدارة ضرائب الكفرة
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب الكفرة')
WHERE u.code = 'u69';

-- u70
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u70', 'إدارة ضرائب زوارة', 'directorate', 11
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u70 -> kitchens: مطبخ إدارة ضرائب زوارة
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب زوارة')
WHERE u.code = 'u70';

-- u71
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u71', 'إدارة ضرائب وادي الشاطئ', 'directorate', 12
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u71 -> kitchens: مطبخ إدارة ضرائب وادي الشاطئ
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب وادي الشاطئ')
WHERE u.code = 'u71';

-- u72
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u72', 'إدارة ضرائب القبة', 'directorate', 13
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u72 -> kitchens: مطبخ إدارة ضرائب القبة
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب القبة')
WHERE u.code = 'u72';

-- u73
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u73', 'إدارة ضرائب درنة', 'directorate', 14
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u73 -> kitchens: مطبخ إدارة ضرائب درنة
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب درنة')
WHERE u.code = 'u73';

-- u74
INSERT INTO org_units (parent_id, code, name_ar, kind, sort_order)
SELECT p.id, 'u74', 'إدارة ضرائب صرمان', 'directorate', 15
FROM org_units p WHERE p.code = 'u75'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name_ar = VALUES(name_ar),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order);

-- u74 -> kitchens: مطبخ إدارة ضرائب صرمان
INSERT IGNORE INTO org_unit_kitchens (org_unit_id, kitchen_id)
SELECT u.id, k.id
FROM org_units u
JOIN kitchens k ON k.name_ar IN ('مطبخ إدارة ضرائب صرمان')
WHERE u.code = 'u74';
