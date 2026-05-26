// app.config.js — app.json의 동적 버전.
// EAS Build 시 file env (GOOGLE_SERVICES_JSON) path를 우선 사용, 없으면 local 파일 경로 fallback.
// 이외 설정은 app.json과 동일.
const path = require('path');
const baseConfig = require('./app.json').expo;

module.exports = ({ config }) => {
  return {
    ...baseConfig,
    android: {
      ...baseConfig.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON || './android/app/google-services.json',
    },
  };
};
