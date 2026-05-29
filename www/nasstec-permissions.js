/**
 * nasstec-permissions.js  v3.0
 * Silent permissions — no popup dialog shown to user.
 * Permissions are requested automatically in the background
 * on first user interaction (button tap).
 */

const NassTecPermissions = (() => {

  const isCapacitor = () =>
    typeof window !== "undefined" &&
    typeof window.Capacitor !== "undefined" &&
    window.Capacitor.isNativePlatform?.();

  async function requestCamera() {
    if (!isCapacitor()) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(t => t.stop());
        return "granted";
      } catch { return "denied"; }
    }
    try {
      const plugin = window.Capacitor?.Plugins?.Camera;
      if (!plugin) return "unavailable";
      const result = await plugin.requestPermissions({ permissions: ["camera", "photos"] });
      return result?.camera ?? result?.photos ?? "unknown";
    } catch (e) {
      console.warn("[Permissions] Camera:", e);
      return "error";
    }
  }

  async function requestStorage() {
    if (!isCapacitor()) return "web-na";
    try {
      const plugin = window.Capacitor?.Plugins?.Filesystem;
      if (plugin?.requestPermissions) {
        const result = await plugin.requestPermissions();
        return result?.publicStorage ?? "unknown";
      }
    } catch (e) {
      console.warn("[Permissions] Storage:", e);
    }
    return "granted";
  }

  // Silent — no dialog, just request in background
  async function requestAll() {
    const [cam, stor] = await Promise.all([requestCamera(), requestStorage()]);
    const result = { camera: cam, storage: stor };
    console.log("[NassTecPermissions] Granted:", result);
    return result;
  }

  return { requestAll, requestCamera, requestStorage };
})();

// Auto-request silently on first tap
document.addEventListener("DOMContentLoaded", () => {
  if (typeof window.Capacitor !== "undefined") {
    document.addEventListener("click", function onFirstTap() {
      document.removeEventListener("click", onFirstTap);
      NassTecPermissions.requestAll();
    }, { once: true });
  }
});
