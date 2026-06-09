import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import localizedFormat from "dayjs/plugin/localizedFormat";
dayjs.extend(isoWeek);
dayjs.extend(localizedFormat);

export function startOfWeekMonday(d = dayjs()) {
  return d.startOf("week").add(1, "day"); // lunes
}
export function weekKey(d = dayjs()) {
  return startOfWeekMonday(d).format("YYYY-[W]WW");
}
export function humanDay(dISO: string) {
  return dayjs(dISO).format("dddd D/M"); // sin año
}
