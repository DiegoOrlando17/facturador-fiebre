export function yyyymmdd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function caeDueToDMY(caeDue) {
  // caeDue: 'yyyyMMdd' -> 'dd/MM/yyyy'
  const y = caeDue.slice(0,4), m = caeDue.slice(4,6), d = caeDue.slice(6,8);
  return `${d}/${m}/${y}`;
}
