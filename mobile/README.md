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
npm start
```

> **مهم:** يعمل المشروع بنظام **Development Build** بدلاً من Expo Go، لأن إصدار Expo SDK المستخدم (58) أحدث من إصدار Expo Go المثبت على أجهزة الاختبار. لا حاجة لتثبيت Expo Go بعد الآن.

### أول مرة فقط: بناء نسخة التطوير

#### الخيار أ: بناء سحابي عبر EAS (لا يحتاج Android SDK على جهازك)
```bash
npm install -g eas-cli
eas login                       # يتطلب حساب Expo
npm run build:dev:android       # ينتج ملف APK للتثبيت المباشر
```
بعد انتهاء البناء، حمّل ملف APK من الرابط الذي يظهر في الطرفية وثبّته على الجهاز.

#### الخيار ب: بناء محلي (يتطلب Android SDK و Java 17)
```bash
npx expo prebuild --clean
npx expo run:android
```

#### iOS (يتطلب macOS أو EAS)
```bash
npm run build:dev:ios
```

### تشغيل خادم التطوير بعد تثبيت النسخة

```bash
npm start          # expo start --dev-client
```

ثم افتح تطبيق **بوابة التواصل الإداري** المثبّت على الجهاز، أو امسح رمز QR من داخل التطبيق.

### بعد تعديل الإعدادات الأصلية (app.json / الصلاحيات / الحزم الأصلية)

```bash
npx expo prebuild --clean
npm run build:dev:android
```

### الرجوع إلى Expo Go (اختياري)

إذا كان Expo Go على الجهاز يدعم SDK 58:

```bash
npm run start:go
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
