export const PWA_UPDATE_AVAILABLE_EVENT = "pwa-update-available";

const BUILD_ID = import.meta.env.VITE_APP_BUILD_ID;
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const watchedWorkers = new WeakSet<ServiceWorker>();

interface VersionManifest {
  buildId?: string;
}

function announceUpdate(worker: ServiceWorker | null) {
  if (!worker) return;
  window.dispatchEvent(
    new CustomEvent<ServiceWorker>(PWA_UPDATE_AVAILABLE_EVENT, {
      detail: worker,
    }),
  );
}

function watchWorker(worker: ServiceWorker | null) {
  if (!worker || watchedWorkers.has(worker)) return;
  watchedWorkers.add(worker);

  worker.addEventListener("statechange", () => {
    if (worker.state === "installed" && navigator.serviceWorker.controller) {
      announceUpdate(worker);
    }
  });
}

function watchRegistration(registration: ServiceWorkerRegistration) {
  if (registration.waiting && navigator.serviceWorker.controller) {
    announceUpdate(registration.waiting);
  }

  watchWorker(registration.installing);
  registration.addEventListener("updatefound", () => {
    watchWorker(registration.installing);
  });
}

async function checkForUpdate(registration: ServiceWorkerRegistration) {
  if (!navigator.onLine) return;

  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return;

    const manifest = (await response.json()) as VersionManifest;
    if (!manifest.buildId || manifest.buildId === BUILD_ID) return;

    const updatedRegistration = await navigator.serviceWorker.register(
      `/sw.js?v=${encodeURIComponent(manifest.buildId)}`,
    );
    watchRegistration(updatedRegistration);
    await updatedRegistration.update();
  } catch (error) {
    console.warn("Unable to check for an app update", error);
  }
}

export async function registerPwaUpdates() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  try {
    const registration = await navigator.serviceWorker.register(
      `/sw.js?v=${encodeURIComponent(BUILD_ID)}`,
    );
    watchRegistration(registration);
    await checkForUpdate(registration);

    const check = () => void checkForUpdate(registration);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
    window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
  } catch (error) {
    console.warn("Service worker registration failed", error);
  }
}

export function restartWithPwaUpdate(worker: ServiceWorker) {
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => window.location.reload(),
    { once: true },
  );
  worker.postMessage({ type: "SKIP_WAITING" });
}
