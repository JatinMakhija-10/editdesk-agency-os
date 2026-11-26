import type { CapacitorConfig } from '@capacitor/cli';

const liveCloudUrl = (process.env.CAPACITOR_SERVER_URL || '').trim();

const config: CapacitorConfig = {
  appId: 'com.synstudio.editdesk',
  appName: 'EditDesk',
  webDir: 'dist',
  ...(liveCloudUrl
    ? {
        server: {
          url: liveCloudUrl,
          cleartext: liveCloudUrl.startsWith('http://'),
        },
      }
    : {}),
  ios: {
    contentInset: 'always',
    backgroundColor: '#141415',
    allowsLinkPreview: false,
  },
};

export default config;
