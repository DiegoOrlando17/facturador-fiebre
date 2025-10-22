export function yyyymmdd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function caeDueToDMY(caeDue) {
  // caeDue: 'yyyyMMdd' -> 'dd/MM/yyyy'
  const y = caeDue.slice(0, 4), m = caeDue.slice(4, 6), d = caeDue.slice(6, 8);
  return `${d}/${m}/${y}`;
}

export function toMPformatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

export function getTodaysDate() {
  const date = new Date();
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0'); 
  const year = String(date.getFullYear()).slice(-2); 

  return `${day}-${month}-${year}`;
}

export function parseUtc(dateStr) {
  // MP te da "2025-10-19T01:25:12.000-04:00" => lo parseamos a Date UTC
  return new Date(dateStr); // Date ya interpreta el offset y guarda UTC internamente
}
