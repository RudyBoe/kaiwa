// Small shared helpers for the views.

export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Line label as printed: the optional "n" override, else 01, 02, …
export const lineLabel = (l, i) => l.n || String(i + 1).padStart(2, "0");

export function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: y === new Date().getFullYear() ? undefined : "numeric" });
}

// Line icons (stroke = currentColor), no emoji.
const svg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICON = {
  speaker: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  mic: svg('<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v2.5"/>'),
  back: svg('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
  share: svg('<path d="M12 15V4"/><path d="M8 7.5 12 3.5l4 4"/><path d="M6 11v8.5h12V11"/>'),
};
