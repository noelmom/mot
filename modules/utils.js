export function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}
