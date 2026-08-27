/**
 * Mark this plugin's row in the DSH settings navigation so its bundled CSS
 * can replace the shell's fallback gear with the CLIProxyAPI router/gateway glyph.
 */

export const SETTINGS_NAV_MARKER = 'data-dsh-cpa-settings-nav'

/**
 * Keep the marker on the settings-nav button whose visible text is this
 * plugin's section label ('CLIProxyAPI').
 * @param label - locale-aware label resolver.
 * @returns disposer that disconnects observation and removes owned markers.
 */
export function registerSettingsNavIcon(label: () => string): () => void {
  if (typeof document === 'undefined') return () => {}
  let disposed = false

  const sync = (): void => {
    if (disposed) return
    const currentLabel = label().trim()
    const buttons = document.querySelectorAll<HTMLButtonElement>('[role="dialog"] nav button')
    for (const button of buttons) {
      const matches = currentLabel.length > 0 && button.textContent?.trim() === currentLabel
      if (matches) button.setAttribute(SETTINGS_NAV_MARKER, '')
      else button.removeAttribute(SETTINGS_NAV_MARKER)
    }
  }

  sync()
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })

  return () => {
    disposed = true
    observer.disconnect()
    document.querySelectorAll(`[${SETTINGS_NAV_MARKER}]`)
      .forEach(element => { element.removeAttribute(SETTINGS_NAV_MARKER) })
  }
}
