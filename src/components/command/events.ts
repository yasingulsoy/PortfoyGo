// Komut paleti ve kısayol penceresi bağımsız bileşenlerdir; birbirlerini ve üst menüyü
// sağlayıcı zinciri kurmadan bu pencere olaylarıyla tetiklerler.

export const COMMAND_PALETTE_EVENT = 'pg:command-palette';
export const SHORTCUTS_HELP_EVENT = 'pg:shortcuts-help';

export function openCommandPalette() {
  window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT));
}

export function openShortcutsHelp() {
  window.dispatchEvent(new Event(SHORTCUTS_HELP_EVENT));
}

/** Kullanıcı bir alana yazı yazıyorsa tek tuşluk kısayollar devreye girmemeli. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  }
  return false;
}

/** Sayfada açık başka bir modal (ör. işlem penceresi) varsa kısayollar onu bölmemeli. */
export function anotherDialogOpen(except?: HTMLDialogElement | null): boolean {
  return Array.from(document.querySelectorAll('dialog[open]')).some((d) => d !== except);
}
