import React from 'react';
import { Image } from 'react-native';

// شعار التطبيق — يُستخدم في جميع الواجهات
const Logo = ({ size = 40, style }) => (
  <Image
    source={require('../../assets/logo.png')}
    style={[{ width: size, height: size, resizeMode: 'contain' }, style]}
    accessibilityLabel="Logo"
  />
);

export default Logo;
