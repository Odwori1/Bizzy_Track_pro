export const config = {
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002',
    timeout: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || '10000'),
  },
  app: {
    name: process.env.NEXT_PUBLIC_APP_NAME || 'Bizzy Track Pro',
    version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  },
  features: {
    enableSecurityAudit: true,
    enableCompliance: true,
    enableAdvancedAnalytics: true,
  },
} as const;
