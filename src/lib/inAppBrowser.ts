export interface InAppBrowserInfo {
  appName: string;
  isIOS: boolean;
}

export function detectInAppBrowser(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
): InAppBrowserInfo | null {
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);

  if (/FBAN\/Messenger|MessengerForiOS|FB_IAB\/MESSENGER/i.test(userAgent)) {
    return { appName: "Messenger", isIOS };
  }
  if (/Instagram/i.test(userAgent)) {
    return { appName: "Instagram", isIOS };
  }
  if (/FBAN|FBAV|FB_IAB/i.test(userAgent)) {
    return { appName: "Facebook", isIOS };
  }
  if (/Line\//i.test(userAgent)) {
    return { appName: "LINE", isIOS };
  }
  if (/\bwv\b|; wv\)|WebView/i.test(userAgent)) {
    return { appName: "this in-app browser", isIOS };
  }

  return null;
}
