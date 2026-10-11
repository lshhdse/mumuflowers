import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.mumu.flowers',
  appName: 'MuMu Flowers',
  webDir: 'dist',
  android: { backgroundColor: '#f6f7f2' },
  plugins: { LocalNotifications: { smallIcon: 'ic_stat_leaf', iconColor: '#3B6148' } },
};
export default config;
