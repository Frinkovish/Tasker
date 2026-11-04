/**
 * The zone that decides what "today" means. Set WORKPILOT_TIME_ZONE when the
 * server runs in a different zone from the user, as most hosted servers do.
 */
export function getTimeZone(): string {
  return (
    process.env.WORKPILOT_TIME_ZONE ||
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
}
