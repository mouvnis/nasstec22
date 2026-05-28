/**
 * nasstec-arabic-tts.js  v2.0
 * ─────────────────────────────────────────────────────────────
 * Free Arabic TTS that works in Android WebView WITHOUT Chrome.
 *
 * Engine cascade (each tried in order, first success wins):
 *
 *  1. Web Speech API  — uses device TTS engine (Google TTS, Samsung
 *     TTS, etc.). Works offline on Android 5+ if a TTS engine is
 *     installed. Does NOT require Chrome — the Android WebView
 *     itself exposes speechSynthesis since Android 4.4.
 *
 *  2. Capacitor TextToSpeech plugin  — if @capacitor-community/
 *     text-to-speech is added to the project it gives the cleanest
 *     native TTS with full Arabic support, no Chrome needed.
 *
 *  3. ResponsiveVoice CDN  — free, Arabic Male voice, no API key
 *     required for non-commercial apps.  Requires internet.
 *
 *  4. Audio URL fallback  — fetches a tiny MP3 from the
 *     ResponsiveVoice getvoice endpoint.  Requires internet.
 *
 * Usage:
 *   await NassTecTTS.speak("مرحباً بكم في نص تك");
 *   NassTecTTS.stop();
 *   NassTecTTS.getInfo();   // → { activeEngine, voices, ... }
 *   await NassTecTTS.test();
 *
 * Include in HTML:
 *   <script src="nasstec-arabic-tts.js"></script>
 * ─────────────────────────────────────────────────────────────
 */

const NassTecTTS = (() => {

  /* ═══════════════════════════════════════════════════════════
     ENGINE 1 — Web Speech API (speechSynthesis)
     Works in Android WebView ≥ 4.4 without Chrome.
     Device needs a TTS engine: Google TTS (pre-installed on most
     Android phones) or Samsung TTS / Pico TTS.
  ══════════════════════════════════════════════════════════════ */
  let _voice = null;

  /** Pre-load and cache the best Arabic voice found on device. */
  async function _resolveVoice() {
    if (_voice) return _voice;
    if (!('speechSynthesis' in window)) return null;

    return new Promise(resolve => {
      const pick = () => {
        const all = window.speechSynthesis.getVoices();
        if (!all.length) return null;
        const PREF = ['ar-SA', 'ar-EG', 'ar-AE', 'ar-IQ', 'ar-MA', 'ar'];
        for (const lang of PREF) {
          const v = all.find(v => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
          if (v) return v;
        }
        return all.find(v => /arab/i.test(v.name)) || null;
      };

      const v = pick();
      if (v) { _voice = v; resolve(v); return; }

      // Voices load asynchronously on first call in many WebViews
      if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => {
          _voice = pick();
          resolve(_voice);
        };
      }
      // Fallback timeout — give up after 3 s and return null (use next engine)
      setTimeout(() => resolve(null), 3000);
    });
  }

  async function _speakWebSpeech(text, rate, pitch) {
    if (!('speechSynthesis' in window)) return false;

    // Android WebView bug: cancel() can freeze — guard with try/catch
    try { window.speechSynthesis.cancel(); } catch (_) {}

    const voice = await _resolveVoice();
    if (!voice) return false;

    return new Promise(resolve => {
      const utt   = new SpeechSynthesisUtterance(text);
      utt.lang    = voice.lang || 'ar-SA';
      utt.voice   = voice;
      utt.rate    = rate;
      utt.pitch   = pitch;
      utt.volume  = 1;

      // Safety timeout: 120 ms per char + 3 s padding
      const safeguard = setTimeout(() => resolve(true), text.length * 120 + 3000);
      utt.onend   = () => { clearTimeout(safeguard); resolve(true); };
      utt.onerror = e  => {
        clearTimeout(safeguard);
        console.warn('[NassTecTTS] WebSpeech error:', e.error);
        resolve(false);
      };

      try {
        window.speechSynthesis.speak(utt);
        // Android WebView quirk: sometimes speak() is silently ignored
        // if called too soon after cancel(). Retry once after 150 ms.
        setTimeout(() => {
          if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
            try { window.speechSynthesis.speak(utt); } catch (_) {}
          }
        }, 150);
      } catch (e) {
        clearTimeout(safeguard);
        console.warn('[NassTecTTS] WebSpeech speak() threw:', e);
        resolve(false);
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     ENGINE 2 — Capacitor Community TextToSpeech plugin
     Add to project:  npm i @capacitor-community/text-to-speech
     Then: npx cap sync
  ══════════════════════════════════════════════════════════════ */
  async function _speakCapacitorTTS(text, rate, pitch) {
    const plugin = window.Capacitor?.Plugins?.TextToSpeech;
    if (!plugin) return false;
    try {
      await plugin.speak({
        text,
        lang: 'ar-SA',
        rate,
        pitch,
        volume: 1.0,
        category: 'ambient',
      });
      return true;
    } catch (e) {
      console.warn('[NassTecTTS] CapacitorTTS error:', e);
      return false;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     ENGINE 3 — ResponsiveVoice (online, free CDN, no API key)
  ══════════════════════════════════════════════════════════════ */
  let _rvReady = false;

  async function _loadRV() {
    if (_rvReady || typeof responsiveVoice !== 'undefined') {
      _rvReady = true; return true;
    }
    return new Promise(resolve => {
      const s   = document.createElement('script');
      s.src     = 'https://code.responsivevoice.org/responsivevoice.js?key=FREE';
      s.onload  = () => { _rvReady = true; resolve(true); };
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  async function _speakRV(text) {
    if (!(await _loadRV())) return false;
    if (typeof responsiveVoice === 'undefined') return false;
    return new Promise(resolve => {
      try {
        responsiveVoice.speak(text, 'Arabic Male', {
          onend:   () => resolve(true),
          onerror: () => resolve(false),
        });
      } catch { resolve(false); }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     ENGINE 4 — Audio URL fallback (online)
  ══════════════════════════════════════════════════════════════ */
  async function _speakAudio(text) {
    const t   = encodeURIComponent(text.slice(0, 200));
    const url = `https://code.responsivevoice.org/getvoice.php?tl=ar&sv=&vn=&pitch=0.5&rate=0.5&vol=1&t=${t}`;
    try {
      const audio = new Audio(url);
      return new Promise(resolve => {
        audio.onended = () => resolve(true);
        audio.onerror = () => resolve(false);
        audio.play().catch(() => resolve(false));
      });
    } catch { return false; }
  }

  /* ═══════════════════════════════════════════════════════════
     Public API
  ══════════════════════════════════════════════════════════════ */
  let _activeEngine = null;

  async function speak(text, { rate = 0.9, pitch = 1.0 } = {}) {
    if (!text?.trim()) return;

    // Engine 1 — WebSpeech (fully offline if TTS engine installed)
    const ws = await _speakWebSpeech(text, rate, pitch);
    if (ws) { _activeEngine = 'WebSpeechAPI'; return; }

    // Engine 2 — Capacitor native TTS (offline)
    const ct = await _speakCapacitorTTS(text, rate, pitch);
    if (ct) { _activeEngine = 'CapacitorTTS'; return; }

    // Engine 3 — ResponsiveVoice (online)
    console.log('[NassTecTTS] Offline engines failed — trying online...');
    const rv = await _speakRV(text);
    if (rv) { _activeEngine = 'ResponsiveVoice'; return; }

    // Engine 4 — Audio URL (online)
    const au = await _speakAudio(text);
    if (au) { _activeEngine = 'AudioFallback'; return; }

    console.error('[NassTecTTS] All engines failed.');
    _activeEngine = 'none';
  }

  function stop() {
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (_) {}
    try {
      const plugin = window.Capacitor?.Plugins?.TextToSpeech;
      if (plugin) plugin.stop().catch(() => {});
    } catch (_) {}
    try { if (typeof responsiveVoice !== 'undefined') responsiveVoice.cancel(); } catch (_) {}
  }

  function getInfo() {
    const voices = ('speechSynthesis' in window)
      ? window.speechSynthesis.getVoices().filter(v => /^ar/i.test(v.lang))
      : [];
    return {
      activeEngine:        _activeEngine,
      webSpeechAvailable:  'speechSynthesis' in window,
      capacitorTTSFound:   !!window.Capacitor?.Plugins?.TextToSpeech,
      arabicVoicesOnDevice: voices.map(v => `${v.name} (${v.lang})`),
    };
  }

  async function test() {
    await speak('مرحباً، هذا اختبار صوتي لتطبيق نص تك');
    console.log('[NassTecTTS] Test done. Info:', getInfo());
  }

  // Warm up the voice list on load (async, doesn't block)
  if ('speechSynthesis' in window) {
    window.addEventListener('load', () => {
      window.speechSynthesis.getVoices(); // triggers onvoiceschanged
      _resolveVoice();
    });
  }

  return { speak, stop, getInfo, test };
})();
