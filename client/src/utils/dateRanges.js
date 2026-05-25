const MS_PER_DAY = 24 * 60 * 60 * 1000;

const parseDateInput = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

export const toDateInputValue = (value) => {
  if (!value) return '';
  return String(value).split('T')[0];
};

export const todayDateInput = () => {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
};

export const formatDateInput = (date) => {
  if (!date) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

export const addDays = (dateInput, days) => {
  const date = parseDateInput(dateInput);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return formatDateInput(date);
};

export const addMonths = (dateInput, months) => {
  const date = parseDateInput(dateInput);
  if (!date) return '';
  date.setMonth(date.getMonth() + months);
  return formatDateInput(date);
};

export const daysBetween = (startInput, endInput) => {
  const start = parseDateInput(startInput);
  const end = parseDateInput(endInput);
  if (!start || !end) return null;
  return Math.round((end - start) / MS_PER_DAY);
};

export const isValidDateRange = (startInput, endInput, { allowSameDay = true } = {}) => {
  const days = daysBetween(startInput, endInput);
  if (days === null) return false;
  return allowSameDay ? days >= 0 : days > 0;
};

export const applyRangePreset = ({ startInput, days, months, fallbackStart, maxEnd }) => {
  const start = startInput || fallbackStart || todayDateInput();
  let end = months ? addMonths(start, months) : addDays(start, days);

  if (maxEnd && end && end > maxEnd) {
    end = maxEnd;
  }

  return { start, end };
};
