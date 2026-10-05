export const SECURITY_EVENT_TYPES = {
  loginSuccess: "login_success",
  loginFailed: "login_failed",
  accountCreated: "account_created",
  accountDisabled: "account_disabled",
  accountEnabled: "account_enabled",
  accountDeleted: "account_deleted",
  passwordChanged: "password_changed",
  passwordReset: "password_reset",
  roleChanged: "role_changed",
  serviceConnected: "service_connected",
  serviceDisconnected: "service_disconnected",
  sessionRevoked: "session_revoked",
} as const;

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[keyof typeof SECURITY_EVENT_TYPES];
