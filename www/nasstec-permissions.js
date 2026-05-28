/**
 * nasstec-permissions.js
 * ─────────────────────────────────────────────────────────────
 * Drop this file in www/ and add ONE line to index.html / app.html:
 *   <script src="nasstec-permissions.js"></script>
 *
 * Call  NassTecPermissions.requestAll()  on app start or on a
 * user action (button tap).  It works both inside Capacitor
 * WebView and in a regular browser (graceful fallback).
 * ─────────────────────────────────────────────────────────────
 */

const NassTecPermissions = (() => {

  /* ── helpers ───────────────────────────────────────────── */
  const isCapacitor = () =>
    typeof window !== "undefined" &&
    typeof window.Capacitor !== "undefined" &&
    window.Capacitor.isNativePlatform?.();

  /* ── request camera via Capacitor Camera plugin ─────────── */
  async function requestCamera() {
    if (!isCapacitor()) {
      // Browser fallback — getUserMedia triggers the browser dialog
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(t => t.stop());
        return "granted";
      } catch {
        return "denied";
      }
    }
    try {
      const { Camera } = await import(
        "https://unpkg.com/@capacitor/camera@6/dist/esm/index.js"
      ).catch(() => ({ Camera: window.Capacitor?.Plugins?.Camera }));

      const plugin = Camera ?? window.Capacitor?.Plugins?.Camera;
      if (!plugin) throw new Error("Camera plugin not found");

      const result = await plugin.requestPermissions({ permissions: ["camera", "photos"] });
      return result?.camera ?? result?.photos ?? "unknown";
    } catch (e) {
      console.warn("[NassTecPermissions] Camera request error:", e);
      return "error";
    }
  }

  /* ── request storage via Filesystem or legacy ───────────── */
  async function requestStorage() {
    if (!isCapacitor()) return "web-na";

    // Capacitor 6 — use Filesystem plugin if available
    try {
      const plugin = window.Capacitor?.Plugins?.Filesystem;
      if (plugin?.requestPermissions) {
        const result = await plugin.requestPermissions();
        return result?.publicStorage ?? "unknown";
      }
    } catch (e) {
      console.warn("[NassTecPermissions] Filesystem permission error:", e);
    }
    return "granted"; // Android 13+ scoped storage needs no explicit request
  }

  /* ── combined dialog with rationale ─────────────────────── */
  async function requestAll({ showRationale = true } = {}) {
    if (showRationale && isCapacitor()) {
      await showRationaleDialog();
    }

    const [cam, stor] = await Promise.all([requestCamera(), requestStorage()]);
    const result = { camera: cam, storage: stor };
    console.log("[NassTecPermissions] Results:", result);
    return result;
  }

  /* ── in-app rationale dialog (RTL Arabic / English) ─────── */
  function showRationaleDialog() {
    return new Promise(resolve => {
      // Remove existing dialog if any
      document.getElementById("__perm-modal")?.remove();

      const modal = document.createElement("div");
      modal.id = "__perm-modal";
      modal.style.cssText = `
        position:fixed;inset:0;z-index:99999;
        background:rgba(0,0,0,.82);
        display:flex;align-items:center;justify-content:center;
        font-family:'Tajawal',sans-serif;direction:rtl;
      `;
      modal.innerHTML = `
        <div style="
          background:#111;border:1.5px solid #C9A84C;border-radius:18px;
          padding:28px 24px;max-width:340px;width:90%;text-align:center;
          color:#F0E6C8;
        ">
          <div style="font-size:2.2rem;margin-bottom:12px;">📷 💾</div>
          <h3 style="color:#C9A84C;font-size:1.2rem;margin-bottom:10px;">
            أذونات مطلوبة
          </h3>
          <p style="font-size:.95rem;line-height:1.6;margin-bottom:6px;">
            يحتاج <b>نص تك</b> إلى الأذونات التالية لتعمل بشكل صحيح:
          </p>
          <ul style="text-align:right;font-size:.9rem;line-height:2;list-style:none;
                     padding:0;margin-bottom:18px;color:#E4C06A;">
            <li>📷 الكاميرا — لالتقاط صور المستندات</li>
            <li>🖼️ الصور والملفات — لاستيراد ملفاتك</li>
          </ul>
          <p style="font-size:.8rem;color:#A89060;margin-bottom:20px;">
            لا تُشارَك أي بيانات مع أطراف خارجية
          </p>
          <button id="__perm-ok" style="
            background:#C9A84C;color:#000;border:none;border-radius:10px;
            padding:12px 36px;font-size:1rem;font-weight:700;cursor:pointer;
            font-family:inherit;width:100%;
          ">السماح</button>
          <button id="__perm-skip" style="
            background:transparent;color:#666;border:none;margin-top:10px;
            font-size:.85rem;cursor:pointer;font-family:inherit;width:100%;
          ">لاحقاً</button>
        </div>
      `;

      document.body.appendChild(modal);

      document.getElementById("__perm-ok").onclick = () => {
        modal.remove();
        resolve(true);
      };
      document.getElementById("__perm-skip").onclick = () => {
        modal.remove();
        resolve(false);
      };
    });
  }

  /* ── public API ─────────────────────────────────────────── */
  return { requestAll, requestCamera, requestStorage, showRationaleDialog };
})();

/* ── Auto-request on first launch (after user interaction) ── */
document.addEventListener("DOMContentLoaded", () => {
  if (typeof window.Capacitor !== "undefined") {
    // Wait for Capacitor to fully init, then request on first button tap
    document.addEventListener("click", function onFirstTap() {
      document.removeEventListener("click", onFirstTap);
      NassTecPermissions.requestAll();
    }, { once: true });
  }
});
