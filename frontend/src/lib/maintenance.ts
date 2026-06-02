export type MaintenanceStatus = {
  is_maintenance: boolean;
  message: string;
  starts_at_hour: number;
  ends_at_hour: number;
  timezone: string;
};

export const DEFAULT_MAINTENANCE_MESSAGE = "午前1時から午前6時までは、システムメンテナンスのため利用できません。";

function getTimeZoneDate(date: Date, timezone: string) {
  return new Date(date.toLocaleString("en-US", { timeZone: timezone }));
}

export function getCurrentMaintenanceStatus(now = new Date()): MaintenanceStatus {
  const timezone = "Asia/Tokyo";
  const tokyoNow = getTimeZoneDate(now, timezone);
  const hour = tokyoNow.getHours();

  return {
    is_maintenance: hour >= 1 && hour < 6,
    message: DEFAULT_MAINTENANCE_MESSAGE,
    starts_at_hour: 1,
    ends_at_hour: 6,
    timezone,
  };
}

export function getNextMaintenanceAutoStopAt(now = new Date()) {
  const timezone = "Asia/Tokyo";
  const tokyoNow = getTimeZoneDate(now, timezone);
  const nextStart = new Date(tokyoNow);
  nextStart.setHours(1, 0, 0, 0);
  if (tokyoNow.getTime() >= nextStart.getTime()) {
    nextStart.setDate(nextStart.getDate() + 1);
  }

  const offset = now.getTime() - tokyoNow.getTime();
  return new Date(nextStart.getTime() + offset);
}
