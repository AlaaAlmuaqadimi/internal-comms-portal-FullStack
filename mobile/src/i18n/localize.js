// مساعد لترجمة سلاسل البيانات التجريبية (mockData) حسب اللغة الحالية
import { translate } from '../context/LanguageContext';

const TEXT_MAP = {
  'أحمد محمد العلي': 'mock.emp1_name',
  'فاطمة عبدالله السعيد': 'mock.emp2_name',
  'خالد إبراهيم الحربي': 'mock.emp3_name',
  'نورة سعد القحطاني': 'mock.emp4_name',
  'محمد عبدالعزيز الشمري': 'mock.emp5_name',
  'سارة أحمد الدوسري': 'mock.emp6_name',
  'إدارة تقنية المعلومات': 'mock.itDept',
  'إدارة الموارد البشرية': 'mock.hrDept',
  'الإدارة المالية': 'mock.financeDept',
  'إدارة الشؤون الإدارية': 'mock.adminDept',
  'قسم البرمجيات': 'mock.software',
  'قسم التوظيف': 'mock.recruitment',
  'قسم المحاسبة': 'mock.accounting',
  'قسم الخدمات': 'mock.services',
  'قسم الشبكات': 'mock.networks',
  'قسم التدريب': 'mock.training',
  'مصلحة الضرائب': 'mock.orgName',
  'نائب رئيس المصلحة': 'mock.deputy',
  'المكتب الرئيسي': 'mock.mainOffice',
  'المكتب الفرعي': 'mock.branchOffice',
  'المطبخ الرئيسي': 'mock.kitchenMain',
  'المبنى الرئيسي - الطابق الأرضي': 'mock.kitchenMainPath',
  'مطبخ المكتب الفرعي': 'mock.kitchenBranch',
  'المبنى الفرعي - الطابق الأول': 'mock.kitchenBranchPath',
  'إعلان': 'notifications.typeAnnouncement',
  'تعميم': 'notifications.typeCircular',
  'مراسلة': 'notifications.typeMessage',
  'تحديث نظام العمل عن بُعد': 'mock.notif1_title',
  'تم تحديث نظام العمل عن بُعد ليشمل ميزات جديدة تحسين تجربة المستخدم.': 'mock.notif1_summary',
  'تم تحديث نظام العمل عن بُعد ليشمل ميزات جديدة تحسين تجربة المستخدم. يرجى مراجعة الدليل الجديد للاستفادة من جميع الميزات المتاحة.': 'mock.notif1_body',
  'مواعيد العمل خلال شهر رمضان': 'mock.notif2_title',
  'تم الإعلان عن مواعيد العمل الجديدة خلال شهر رمضان المبارك.': 'mock.notif2_summary',
  'تم الإعلان عن مواعيد العمل الجديدة خلال شهر رمضان المبارك. ساعات العمل ستكون من 9 صباحاً حتى 3 عصراً.': 'mock.notif2_body',
  'اجتماع فريق العمل الأسبوعي': 'mock.notif3_title',
  'تذكير باجتماع فريق العمل الأسبوعي يوم الأحد القادم.': 'mock.notif3_summary',
  'تذكير باجتماع فريق العمل الأسبوعي يوم الأحد القادم الساعة 10 صباحاً في قاعة الاجتماعات الرئيسية.': 'mock.notif3_body',
  'صيانة مجدولة للنظام': 'mock.notif4_title',
  'سيتم إجراء صيانة مجدولة للنظام يوم الجمعة القادم.': 'mock.notif4_summary',
  'سيتم إجراء صيانة مجدولة للنظام يوم الجمعة القادم من الساعة 12 منتصف الليل حتى 6 صباحاً. يرجى حفظ جميع الأعمال قبل هذا الوقت.': 'mock.notif4_body',
  'واردة': 'calls.typeIncoming',
  'صادرة': 'calls.typeOutgoing',
  'فائتة': 'calls.typeMissed',
};

export const localizeText = (value) => {
  if (!value || typeof value !== 'string') return value;
  const key = TEXT_MAP[value];
  if (key) return translate(key);
  // المسارات: "مصلحة الضرائب / إدارة ... / قسم ..."
  if (value.includes(' / ')) {
    return value
      .split(' / ')
      .map((part) => {
        const k = TEXT_MAP[part.trim()];
        return k ? translate(k) : part;
      })
      .join(' / ');
  }
  return value;
};

export default localizeText;
