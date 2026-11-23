import { readonly, ref } from "vue";

export type Theme = "light" | "dark";
const storageKey = "islet.theme";
let preference: Theme | undefined;
try {
  const saved = localStorage.getItem(storageKey);
  if (saved === "light" || saved === "dark") preference = saved;
} catch {
  // The theme remains usable when storage is unavailable.
}
const current = ref<Theme>(preference ?? "light");
export const theme = readonly(current);

function apply(mode: Theme) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle("dark", mode === "dark");
  current.value = mode;
}

export function applySessionTheme(loggedIn: boolean) {
  apply(preference ?? (loggedIn ? "dark" : "light"));
}

export function setTheme(mode: Theme) {
  preference = mode;
  apply(mode);
  try {
    localStorage.setItem(storageKey, mode);
  } catch {
    // Keep the current in-memory preference for the session.
  }
}
