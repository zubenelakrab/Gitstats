import {
  format,
  parseISO,
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfYear,
  getWeek,
  getYear,
  getMonth,
  getDay,
  getHours,
  differenceInDays,
  differenceInCalendarDays,
} from 'date-fns';

/**
 * Format a date to ISO date string (YYYY-MM-DD)
 */
export function toDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Format a date to week key (YYYY-WXX)
 */
export function toWeekKey(date: Date): string {
  const year = getYear(date);
  const week = getWeek(date);
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

/**
 * Format a date to month key (YYYY-MM)
 */
export function toMonthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}

/**
 * Format a date to year key (YYYY)
 */
export function toYearKey(date: Date): string {
  return format(date, 'yyyy');
}

/**
 * Get the start of day for a date
 */
export function getDayStart(date: Date): Date {
  return startOfDay(date);
}

/**
 * Get the start of week for a date
 */
export function getWeekStart(date: Date): Date {
  return startOfWeek(date);
}

/**
 * Get the start of month for a date
 */
export function getMonthStart(date: Date): Date {
  return startOfMonth(date);
}

/**
 * Get the start of year for a date
 */
export function getYearStart(date: Date): Date {
  return startOfYear(date);
}

/**
 * Get day of week (0-6, Sunday = 0)
 */
export function getDayOfWeek(date: Date): number {
  return getDay(date);
}

/**
 * Get hour of day (0-23)
 */
export function getHourOfDay(date: Date): number {
  return getHours(date);
}

/**
 * Get week number
 */
export function getWeekNumber(date: Date): number {
  return getWeek(date);
}

/**
 * Get month (0-11)
 */
export function getMonthNumber(date: Date): number {
  return getMonth(date);
}

/**
 * Get year
 */
export function getYearNumber(date: Date): number {
  return getYear(date);
}

/**
 * Calculate difference in days between two dates
 */
export function daysDifference(dateA: Date, dateB: Date): number {
  return Math.abs(differenceInDays(dateA, dateB));
}

/**
 * Calculate difference in calendar days between two dates
 */
export function calendarDaysDifference(dateA: Date, dateB: Date): number {
  return Math.abs(differenceInCalendarDays(dateA, dateB));
}

/**
 * Parse an ISO date string to Date
 */
export function parseDate(dateString: string): Date {
  return parseISO(dateString);
}

/**
 * Format a date for display
 */
export function formatDate(date: Date, formatStr: string = 'yyyy-MM-dd HH:mm:ss'): string {
  return format(date, formatStr);
}

/**
 * Get a human-readable relative time (e.g., "2 days ago")
 */
export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffDays = differenceInDays(now, date);

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}
