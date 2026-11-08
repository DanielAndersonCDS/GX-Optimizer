// GX Optimizer background: applies the selected theme to Firefox's own colours.
async function applyTheme() {
  const { theme, applyBrowser, registry } = await gxLoadSettings();
  try {
    if (!applyBrowser) await browser.theme.reset();
    else await browser.theme.update({ colors: gxBrowserColors(registry[theme].ui) });
  } catch (e) { console.warn("GX Optimizer theme:", e); }
}
browser.runtime.onInstalled.addListener(applyTheme);
browser.runtime.onStartup.addListener(applyTheme);
browser.runtime.onStartup.addListener(() => browser.storage.local.set({ cavaListening: 0 }));
browser.storage.onChanged.addListener((c) => { if (c.theme || c.applyBrowser || c.customThemes) applyTheme(); });
applyTheme();
