-- ============================================================================
-- V008 - Seed kitchens (from legacy kitchens.json)
-- Idempotent by unique code.
-- ============================================================================

SET NAMES utf8mb4;

INSERT IGNORE INTO kitchens (code, name_ar, name_en, scope_ar) VALUES
  ('k-shared-1',  'مطبخ 1',                        'Kitchen 1',                 'القيادة العليا والإدارات المباشرة، والإدارات العامة والإدارات الفنية المعتمدة'),
  ('k-shared-2',  'مطبخ 2',                        'Kitchen 2',                 'القيادة العليا والإدارات المباشرة، والإدارات العامة والإدارات الفنية المعتمدة'),
  ('k-region-1',  'مطبخ إدارة ضرائب طرابلس',       'Tripoli Tax Office Kitchen', 'إدارة ضرائب طرابلس'),
  ('k-region-2',  'مطبخ إدارة ضرائب بنغازي',       'Benghazi Tax Office Kitchen','إدارة ضرائب بنغازي'),
  ('k-region-3',  'مطبخ إدارة ضرائب مصراتة',       'Misrata Tax Office Kitchen', 'إدارة ضرائب مصراتة'),
  ('k-region-4',  'مطبخ إدارة ضرائب الجبل الأخضر', 'Jabal al-Akhdar Kitchen',    'إدارة ضرائب الجبل الأخضر'),
  ('k-region-5',  'مطبخ إدارة ضرائب أجدابيا',      'Ajdabiya Tax Office Kitchen','إدارة ضرائب أجدابيا'),
  ('k-region-6',  'مطبخ إدارة ضرائب تاجوراء',      'Tajoura Tax Office Kitchen', 'إدارة ضرائب تاجوراء'),
  ('k-region-7',  'مطبخ إدارة ضرائب الجفارة',      'Jfara Tax Office Kitchen',   'إدارة ضرائب الجفارة'),
  ('k-region-8',  'مطبخ إدارة ضرائب خليج السدرة',  'Gulf of Sidra Kitchen',      'إدارة ضرائب خليج السدرة'),
  ('k-region-9',  'مطبخ إدارة ضرائب الواحات',      'Oases Tax Office Kitchen',   'إدارة ضرائب الواحات'),
  ('k-region-10', 'مطبخ إدارة ضرائب المرقب',       'Murgub Tax Office Kitchen',  'إدارة ضرائب المرقب'),
  ('k-region-11', 'مطبخ إدارة ضرائب طبرق',         'Tobruk Tax Office Kitchen',  'إدارة ضرائب طبرق'),
  ('k-region-12', 'مطبخ إدارة ضرائب الزاوية',      'Zawiya Tax Office Kitchen',  'إدارة ضرائب الزاوية'),
  ('k-region-13', 'مطبخ إدارة ضرائب جنزور',        'Janzour Tax Office Kitchen', 'إدارة ضرائب جنزور'),
  ('k-region-14', 'مطبخ إدارة ضرائب زليتن',        'Zliten Tax Office Kitchen',  'إدارة ضرائب زليتن'),
  ('k-region-15', 'مطبخ إدارة ضرائب غريان',        'Gharyan Tax Office Kitchen', 'إدارة ضرائب غريان'),
  ('k-region-16', 'مطبخ إدارة ضرائب سبها',         'Sabha Tax Office Kitchen',   'إدارة ضرائب سبها'),
  ('k-region-17', 'مطبخ إدارة ضرائب مرادة',        'Marada Tax Office Kitchen',  'إدارة ضرائب مرادة'),
  ('k-region-18', 'مطبخ إدارة ضرائب زوارة',        'Zuwarah Tax Office Kitchen', 'إدارة ضرائب زوارة'),
  ('k-region-19', 'مطبخ إدارة ضرائب الكفرة',       'Kufra Tax Office Kitchen',   'إدارة ضرائب الكفرة'),
  ('k-region-20', 'مطبخ إدارة ضرائب المرج',        'Marj Tax Office Kitchen',    'إدارة ضرائب المرج'),
  ('k-region-21', 'مطبخ إدارة ضرائب الحزام',       'Al-Hizam Tax Office Kitchen','إدارة ضرائب الحزام'),
  ('k-region-22', 'مطبخ إدارة ضرائب سرت',          'Sirte Tax Office Kitchen',   'إدارة ضرائب سرت'),
  ('k-region-23', 'مطبخ إدارة ضرائب العجيلات',     'Ajaylat Tax Office Kitchen', 'إدارة ضرائب العجيلات'),
  ('k-region-24', 'مطبخ إدارة ضرائب صرمان',        'Sorman Tax Office Kitchen',  'إدارة ضرائب صرمان'),
  ('k-region-25', 'مطبخ إدارة ضرائب درنة',         'Derna Tax Office Kitchen',   'إدارة ضرائب درنة'),
  ('k-region-26', 'مطبخ إدارة ضرائب القبة',        'Qubba Tax Office Kitchen',   'إدارة ضرائب القبة'),
  ('k-region-27', 'مطبخ إدارة ضرائب وادي الشاطئ',  'Wadi al-Shati Kitchen',      'إدارة ضرائب وادي الشاطئ');
