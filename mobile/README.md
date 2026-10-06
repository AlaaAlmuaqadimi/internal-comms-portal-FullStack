# بوابة التواصل الإداري - تطبيق Mobile

تطبيق React Native لبوابة التواصل الإداري الداخلي، مبني باستخدام Expo.

## المميزات

- ✅ تسجيل الدخول وإنشاء الحسابات
- ✅ دليل الموظفين مع البحث والتصفية
- ✅ سجل المكالمات مع إمكانية الاتصال
- ✅ الإشعارات والتعميمات
- ✅ الهيكل الإداري
- ✅ الإعدادات الشخصية
- ✅ دعم كامل للغة العربية (RTL)
- ✅ تصميم Mobile-first

## التقنيات المستخدمة

- **React Native** - إطار العمل الأساسي
- **Expo** - أداة التطوير والنشر
- **React Navigation** - نظام التنقل
- **AsyncStorage** - التخزين المحلي
- **Expo Vector Icons** - الأيقونات

## بنية المشروع

```
mobile/
├── src/
│   ├── components/     # مكونات قابلة لإعادة الاستخدام
│   │   ├── AppHeader.js
│   │   ├── CustomButton.js
│   │   ├── CustomInput.js
│   │   ├── SearchBar.js
│   │   ├── Loading.js
│   │   ├── EmptyState.js
│   │   ├── ErrorState.js
│   │   ├── Modal.js
│   │   ├── Card.js
│   │   ├── ListItem.js
│   │   ├── StatusBadge.js
│   │   ├── UserAvatar.js
│   │   ├── NotificationItem.js
│   │   └── ConfirmDialog.js
│   ├── screens/        # الشاشات
│   │   ├── auth/
│   │   │   ├── LoginScreen.js
│   │   │   └── RegisterScreen.js
│   │   └── main/
│   │       ├── DirectoryScreen.js
│   │       ├── CallsScreen.js
│   │       ├── CallActiveScreen.js
│   │       ├── OrgScreen.js
│   │       ├── NotificationsScreen.js
│   │       └── SettingsScreen.js
│   ├── navigation/     # نظام التنقل
│   │   └── AppNavigator.js
│   ├── context/        # إدارة الحالة
│   │   ├── AuthContext.js
│   │   └── ThemeContext.js
│   ├── hooks/          # الـ Hooks المخصصة
│   │   ├── useDebounce.js
│   │   └── useFetch.js
│   ├── services/       # الخدمات
│   │   └── api.js
│   ├── utils/          # الأدوات المساعدة
│   │   ├── mockData.js
│   │   ├── validation.js
│   │   └── formatters.js
│   ├── constants/      # الثوابت
│   │   ├── colors.js
│   │   ├── typography.js
│   │   └── spacing.js
│   └── assets/         # الموارد
├── App.js
├── app.json
└── package.json
```

## التثبيت والتشغيل

### المتطلبات

- Node.js (الإصدار 18 أو أحدث)
- npm أو yarn
- Expo CLI

### خطوات التثبيت

1. استنساخ المشروع:
```bash
git clone <repository-url>
cd internal-comms-portal-FullStack/mobile
```

2. تثبيت الحزم:
```bash
npm install
# أو
yarn install
```

3. تشغيل التطبيق:
```bash
npx expo start
```

### التشغيل على الأجهزة

#### Android:
```bash
npx expo start --android
```

#### iOS:
```bash
npx expo start --ios
```

#### على الويب:
```bash
npx expo start --web
```

## الهوية البصرية

### الألوان الأساسية

| اللون | الكود | الاستخدام |
|-------|-------|-----------|
| الأزرق الداكن | `#14283f` | العناوين والنصوص الرئيسية |
| الأزرق المتوسط | `#1769a3` | الأزرار والروابط |
| الذهبي | `#c4a56a` | الحدود والخلفيات المميزة |
| الرمادي الفاتح | `#526579` | النصوص الثانوية |
| الخلفية | `#f3f6f9` | الخلفية الرئيسية |

### الخط

- **Cairo** - الخط العربي الأساسي

## الشاشات

### شاشات المصادقة
- **LoginScreen** - تسجيل الدخول
- **RegisterScreen** - إنشاء حساب جديد

### الشاشات الرئيسية
- **DirectoryScreen** - دليل الموظفين
- **CallsScreen** - سجل المكالمات
- **CallActiveScreen** - المكالمة النشطة
- **OrgScreen** - الهيكل الإداري
- **NotificationsScreen** - الإشعارات
- **SettingsScreen** - الإعدادات

## البيانات التجريبية

التطبيق يستخدم بيانات تجريبية (Mock Data) للمعاينة. يمكن استبدالها ببيانات حقيقية من الخادم في ملف `src/services/api.js`.

## المساهمة

1. قم بعمل Fork للمشروع
2. أنشئ فرع جديد (`git checkout -b feature/amazing-feature`)
3. قم بالالتزام بالتغييرات (`git commit -m 'Add some amazing feature'`)
4. ادفع إلى الفرع (`git push origin feature/amazing-feature`)
5. افتح Pull Request

## الترخيص

هذا المشروع مرخص تحت رخصة UNLICENSED.
