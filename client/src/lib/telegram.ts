export const getTelegramWebApp = () => {
  if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
    return (window as any).Telegram.WebApp;
  }
  return null;
};

export const getTelegramInitData = () => {
  const webApp = getTelegramWebApp();
  return webApp?.initData || "";
};

export const getTelegramUser = () => {
  const webApp = getTelegramWebApp();
  return webApp?.initDataUnsafe?.user || null;
};

export const expandTelegramWebApp = () => {
  const webApp = getTelegramWebApp();
  webApp?.expand();
};

export const closeTelegramWebApp = () => {
  const webApp = getTelegramWebApp();
  webApp?.close();
};

export const showTelegramMainButton = (text: string, onClick: () => void) => {
  const webApp = getTelegramWebApp();
  if (webApp) {
    webApp.MainButton.text = text;
    webApp.MainButton.onClick(onClick);
    webApp.MainButton.show();
  }
};

export const hideTelegramMainButton = () => {
  const webApp = getTelegramWebApp();
  webApp?.MainButton.hide();
};
