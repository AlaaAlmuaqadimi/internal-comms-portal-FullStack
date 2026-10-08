// بيانات تجريبية للمعاينة
// في التطبيق الحقيقي سيتم استبدال هذا ببيانات من الخادم

export const mockData = {
  // الموظفين
  employees: [
    {
      id: '1',
      name: 'أحمد محمد العلي',
      management: 'إدارة تقنية المعلومات',
      unitName: 'قسم البرمجيات',
      path: 'مصلحة الضرائب / إدارة تقنية المعلومات / قسم البرمجيات',
      status: 'online',
      isKitchen: false,
    },
    {
      id: '2',
      name: 'فاطمة عبدالله السعيد',
      management: 'إدارة الموارد البشرية',
      unitName: 'قسم التوظيف',
      path: 'مصلحة الضرائب / إدارة الموارد البشرية / قسم التوظيف',
      status: 'offline',
      isKitchen: false,
    },
    {
      id: '3',
      name: 'خالد إبراهيم الحربي',
      management: 'الإدارة المالية',
      unitName: 'قسم المحاسبة',
      path: 'مصلحة الضرائب / الإدارة المالية / قسم المحاسبة',
      status: 'online',
      isKitchen: false,
    },
    {
      id: '4',
      name: 'نورة سعد القحطاني',
      management: 'إدارة الشؤون الإدارية',
      unitName: 'قسم الخدمات',
      path: 'مصلحة الضرائب / إدارة الشؤون الإدارية / قسم الخدمات',
      status: 'online',
      isKitchen: false,
    },
    {
      id: '5',
      name: 'محمد عبدالعزيز الشمري',
      management: 'إدارة تقنية المعلومات',
      unitName: 'قسم الشبكات',
      path: 'مصلحة الضرائب / إدارة تقنية المعلومات / قسم الشبكات',
      status: 'offline',
      isKitchen: false,
    },
    {
      id: '6',
      name: 'سارة أحمد الدوسري',
      management: 'إدارة الموارد البشرية',
      unitName: 'قسم التدريب',
      path: 'مصلحة الضرائب / إدارة الموارد البشرية / قسم التدريب',
      status: 'online',
      isKitchen: false,
    },
  ],

  // المكالمات
  calls: [
    {
      id: '1',
      contact: {
        id: '1',
        name: 'أحمد محمد العلي',
        unitName: 'قسم البرمجيات',
        management: 'إدارة تقنية المعلومات',
      },
      type: 'incoming',
      typeLabel: 'واردة',
      icon: 'arrow-down',
      date: '2024-01-15',
      time: '10:30 ص',
      duration: '5:23',
    },
    {
      id: '2',
      contact: {
        id: '2',
        name: 'فاطمة عبدالله السعيد',
        unitName: 'قسم التوظيف',
        management: 'إدارة الموارد البشرية',
      },
      type: 'outgoing',
      typeLabel: 'صادرة',
      icon: 'arrow-up',
      date: '2024-01-15',
      time: '09:15 ص',
      duration: '12:45',
    },
    {
      id: '3',
      contact: {
        id: '3',
        name: 'خالد إبراهيم الحربي',
        unitName: 'قسم المحاسبة',
        management: 'الإدارة المالية',
      },
      type: 'missed',
      typeLabel: 'فائتة',
      icon: 'call',
      date: '2024-01-14',
      time: '03:45 م',
      duration: '0:00',
    },
    {
      id: '4',
      contact: {
        id: '4',
        name: 'نورة سعد القحطاني',
        unitName: 'قسم الخدمات',
        management: 'إدارة الشؤون الإدارية',
      },
      type: 'incoming',
      typeLabel: 'واردة',
      icon: 'arrow-down',
      date: '2024-01-14',
      time: '01:20 م',
      duration: '8:12',
    },
    {
      id: '5',
      contact: {
        id: '5',
        name: 'محمد عبدالعزيز الشمري',
        unitName: 'قسم الشبكات',
        management: 'إدارة تقنية المعلومات',
      },
      type: 'outgoing',
      typeLabel: 'صادرة',
      icon: 'arrow-up',
      date: '2024-01-13',
      time: '11:00 ص',
      duration: '3:56',
    },
  ],

  // الإشعارات
  notifications: [
    {
      id: '1',
      type: 'إعلان',
      title: 'تحديث نظام العمل عن بُعد',
      summary: 'تم تحديث نظام العمل عن بُعد ليشمل ميزات جديدة تحسين تجربة المستخدم.',
      body: 'تم تحديث نظام العمل عن بُعد ليشمل ميزات جديدة تحسين تجربة المستخدم. يرجى مراجعة الدليل الجديد للاستفادة من جميع الميزات المتاحة.',
      icon: 'megaphone',
      date: '2024-01-15',
      time: '08:00 ص',
      unread: true,
    },
    {
      id: '2',
      type: 'تعميم',
      title: 'مواعيد العمل خلال شهر رمضان',
      summary: 'تم الإعلان عن مواعيد العمل الجديدة خلال شهر رمضان المبارك.',
      body: 'تم الإعلان عن مواعيد العمل الجديدة خلال شهر رمضان المبارك. ساعات العمل ستكون من 9 صباحاً حتى 3 عصراً.',
      icon: 'calendar',
      date: '2024-01-14',
      time: '02:30 م',
      unread: true,
    },
    {
      id: '3',
      type: 'مراسلة',
      title: 'اجتماع فريق العمل الأسبوعي',
      summary: 'تذكير باجتماع فريق العمل الأسبوعي يوم الأحد القادم.',
      body: 'تذكير باجتماع فريق العمل الأسبوعي يوم الأحد القادم الساعة 10 صباحاً في قاعة الاجتماعات الرئيسية.',
      icon: 'mail',
      date: '2024-01-13',
      time: '11:45 ص',
      unread: false,
    },
    {
      id: '4',
      type: 'إعلان',
      title: 'صيانة مجدولة للنظام',
      summary: 'سيتم إجراء صيانة مجدولة للنظام يوم الجمعة القادم.',
      body: 'سيتم إجراء صيانة مجدولة للنظام يوم الجمعة القادم من الساعة 12 منتصف الليل حتى 6 صباحاً. يرجى حفظ جميع الأعمال قبل هذا الوقت.',
      icon: 'alert',
      date: '2024-01-12',
      time: '04:15 م',
      unread: false,
    },
  ],

  // الهيكل الإداري
  orgTree: {
    id: 'root',
    name: 'مصلحة الضرائب',
    kind: 'root',
    children: [
      {
        id: 'deputy',
        name: 'نائب رئيس المصلحة',
        kind: 'deputy',
        children: [],
      },
      {
        id: 'office1',
        name: 'المكتب الرئيسي',
        kind: 'office',
        children: [
          {
            id: 'dir1',
            name: 'إدارة تقنية المعلومات',
            kind: 'directorate',
            children: [
              {
                id: 'sec1',
                name: 'قسم البرمجيات',
                kind: 'section',
                children: [],
              },
              {
                id: 'sec2',
                name: 'قسم الشبكات',
                kind: 'section',
                children: [],
              },
            ],
          },
          {
            id: 'dir2',
            name: 'إدارة الموارد البشرية',
            kind: 'directorate',
            children: [
              {
                id: 'sec3',
                name: 'قسم التوظيف',
                kind: 'section',
                children: [],
              },
              {
                id: 'sec4',
                name: 'قسم التدريب',
                kind: 'section',
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: 'office2',
        name: 'المكتب الفرعي',
        kind: 'office',
        children: [
          {
            id: 'dir3',
            name: 'الإدارة المالية',
            kind: 'directorate',
            children: [
              {
                id: 'sec5',
                name: 'قسم المحاسبة',
                kind: 'section',
                children: [],
              },
            ],
          },
          {
            id: 'dir4',
            name: 'إدارة الشؤون الإدارية',
            kind: 'directorate',
            children: [
              {
                id: 'sec6',
                name: 'قسم الخدمات',
                kind: 'section',
                children: [],
              },
            ],
          },
        ],
      },
    ],
  },

  // المطابخ
  kitchens: [
    {
      id: 'k1',
      name: 'المطبخ الرئيسي',
      path: 'المبنى الرئيسي - الطابق الأرضي',
      unitId: 'office1',
      isKitchen: true,
    },
    {
      id: 'k2',
      name: 'مطبخ المكتب الفرعي',
      path: 'المبنى الفرعي - الطابق الأول',
      unitId: 'office2',
      isKitchen: true,
    },
  ],

  // الحسابات المتاحة للتواصل
  availableContacts: [
    {
      id: '1',
      name: 'أحمد محمد العلي',
      unitName: 'قسم البرمجيات',
      management: 'إدارة تقنية المعلومات',
      relation: 'same_level',
    },
    {
      id: '2',
      name: 'فاطمة عبدالله السعيد',
      unitName: 'قسم التوظيف',
      management: 'إدارة الموارد البشرية',
      relation: 'higher_level',
    },
    {
      id: '3',
      name: 'خالد إبراهيم الحربي',
      unitName: 'قسم المحاسبة',
      management: 'الإدارة المالية',
      relation: 'lower_level',
    },
    {
      id: '4',
      name: 'نورة سعد القحطاني',
      unitName: 'قسم الخدمات',
      management: 'إدارة الشؤون الإدارية',
      relation: 'same_level',
    },
  ],
};

export default mockData;
