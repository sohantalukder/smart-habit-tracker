import { Platform } from 'react-native';

const appConfig = {
  api: {
    baseUrl:
      process.env.BLOOM_API_URL ??
      (Platform.OS === 'android'
        ? 'http://10.0.2.2:4000/v1'
        : 'http://localhost:4000/v1'),
  },
};

export default appConfig;
