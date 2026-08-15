import posthog from "posthog-js";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST;

export const isPosthogConfigured = Boolean(posthogKey && posthogHost);

if (isPosthogConfigured) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_exceptions: {
      capture_console_errors: false,
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
    },
    defaults: "2026-05-30",
  });
} else if (import.meta.env.DEV) {
  const missingVariable = posthogKey
    ? "VITE_POSTHOG_HOST"
    : "VITE_POSTHOG_KEY";
  console.error(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}

export default posthog;
