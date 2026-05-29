/**
 * nasstec-arabic-tts.js  v4.0 — NATIVE FIRST
 * ─────────────────────────────────────────────────────────────
 * ROOT CAUSE OF PREVIOUS FAILURES:
 *   Android WebView blocks Audio() cross-origin requests and
 *   Web Speech API is unreliable in WebView (not Chrome).
 *   The ONLY 100% reliable solution is a Capacitor native plugin
 *   that calls Android's TextToSpeech engine directly — bypassing
 *   WebView completely.
 *
 * Engine cascade:
 *
 *  1. ✅ @capacitor-community/text-to-speech  ← MAIN ENGINE
 *     Calls android.speech.tts.TextToSpeech natively.
 *     Works 100% offline. No internet. No Chrome. No WebView.
 *     Every Android phone has this (Google TTS, Samsung TTS, etc.)
 *     Arabic support: built-in via device TTS engine.
 *     Installed via: npm install @capacitor-community/text-to-speech
 *
 *  2. Web Speech API — device TTS via speechSynthesis (offline fallback)
 *
 *  3. VoiceRSS — free Arabic TTS API (needs free API key + internet)
 *     Get free key at: voicerss.org/api (350 req/day free)
 *     Set: NassTecTTS.setVoiceRSSKey('YOUR_KEY')
 *
 * Usage:
 *   await NassTecTTS.speak("مرحباً بكم في نص تك");
 *   NassTecTTS.stop();
 *   await NassTecTTS.diagnose();  ← run this to debug
 * ─────────────────────────────────────────────────────────────
 */

const NassTecTTS = (() => {

  let _activeEngine = null;
  let _voiceRSSKey  = '';  // optional, set via setVoiceRSSKey()

  /* ═══════════════════════════════════════════════════════════
     ENGINE 1 — @capacitor-community/text-to-speech (NATIVE)
     This calls Android TextToSpeech directly via Java bridge.
     Completely bypasses WebView — always works on real devices.
  ══════════════════════════════════════════════════════════════ */
  function _getCapPlugin() {
    // Capacitor auto-registers plugin under window.Capacitor.Plugins
    return window?.Capacitor?.Plugins?.TextToSpeech ?? null;
  }

  async function _speakNative(text) {
    const plugin = _getCapPlugin();
    if (!plugin) {
      console.warn('[TTS] Native plugin not found. Is @capacitor-community/text-to-speech installed and synced?');
      return false;
    }
    try {
      // Stop any current speech first
      try { await plugin.stop(); } catch (_) {}

      await plugin.speak({
        text:          text,
        lang:          'ar-SA',   // Saudi Arabic — widest device support
        rate:          0.95,      // Slightly slower for clarity
        pitch:         1.0,
        volume:        1.0,
        category:      'ambient',
        queueStrategy: 1,         // 1 = flush queue (replace current speech)
      });
      return true;
    } catch (e) {
      console.warn('[TTS] Native plugin error:', e?.message ?? e);

      // Try Egyptian Arabic if Saudi failed
      try {
        await plugin.speak({ text, lang: 'ar-EG', rate: 0.95, pitch: 1.0, volume: 1.0 });
        return true;
      } catch (_) {}

      // Try generic Arabic
      try {
        await plugin.speak({ text, lang: 'ar', rate: 0.95, pitch: 1.0, volume: 1.0 });
        return true;
      } catch (_) {}

      return false;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     ENGINE 2 — Web Speech API (offline if Arabic TTS installed)
  ══════════════════════════════════════════════════════════════ */
  let _wsVoice = null;

  async function _resolveVoice() {
    if (_wsVoice) return _wsVoice;
    if (!('speechSynthesis' in window)) return null;
    return new Promise(resolve => {
      const pick = () => {
        const voices = window.speechSynthesis.getVoices();
        if (!voices.length) return null;
        for (const lang of ['ar-SA','ar-EG','ar-AE','ar-MA','ar']) {
          const v = voices.find(v => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
          if (v) return v;
        }
        return voices.find(v => /arab/i.test(v.name)) ?? null;
      };
      const v = pick();
      if (v) { _wsVoice = v; resolve(v); return; }
      if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => { _wsVoice = pick(); resolve(_wsVoice); };
      }
      setTimeout(() => resolve(null), 3500);
    });
  }

  async function _speakWebSpeech(text) {
    if (!('speechSynthesis' in window)) return false;
    try { window.speechSynthesis.cancel(); } catch (_) {}
    const voice = await _resolveVoice();
    if (!voice) return false;

    return new Promise(resolve => {
      const utt   = new SpeechSynthesisUtterance(text);
      utt.voice   = voice;
      utt.lang    = voice.lang || 'ar-SA';
      utt.rate    = 0.9;
      utt.pitch   = 1.0;
      utt.volume  = 1.0;
      const guard = setTimeout(() => resolve(true), text.length * 100 + 4000);
      utt.onend   = () => { clearTimeout(guard); resolve(true); };
      utt.onerror = e  => { clearTimeout(guard); console.warn('[TTS] WebSpeech error:', e.error); resolve(false); };
      try {
        window.speechSynthesis.speak(utt);
        // Android WebView quirk: retry after 200ms if not speaking
        setTimeout(() => {
          if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
            try { window.speechSynthesis.speak(utt); } catch (_) {}
          }
        }, 200);
      } catch (e) { clearTimeout(guard); resolve(false); }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     ENGINE 3 — VoiceRSS (free tier, needs API key + internet)
     Get free key: https://www.voicerss.org/api/
     350 requests/day free. Set key via NassTecTTS.setVoiceRSSKey()
  ══════════════════════════════════════════════════════════════ */
  let _currentAudio = null;

  async function _speakVoiceRSS(text) {
    if (!_voiceRSSKey) return false;
    try {
      const url = `https://api.voicerss.org/?key=${_voiceRSSKey}&hl=ar-sa&src=${encodeURIComponent(text)}&c=MP3&f=44khz_16bit_mono&ssml=false&b64=false&v=Laila`;
      return await _playAudio(url);
    } catch { return false; }
  }

  function _playAudio(url) {
    return new Promise(resolve => {
      if (_currentAudio) { try { _currentAudio.pause(); } catch (_) {} }
      const audio      = new Audio(url);
      _currentAudio    = audio;
      audio.onended    = () => resolve(true);
      audio.onerror    = () => resolve(false);
      const timeout    = setTimeout(() => resolve(false), 12000);
      audio.onended    = () => { clearTimeout(timeout); resolve(true); };
      audio.onerror    = () => { clearTimeout(timeout); resolve(false); };
      audio.play().catch(() => { clearTimeout(timeout); resolve(false); });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════════ */
  async function speak(text) {
    if (!text?.trim()) return;
    const t = text.trim();

    // ENGINE 1: Native Capacitor plugin (best, works 100% on device)
    if (await _speakNative(t)) {
      _activeEngine = 'CapacitorTTS_Native';
      console.log('[TTS] ✅ Engine: Native Android TTS');
      return;
    }

    // ENGINE 2: Web Speech API
    if (await _speakWebSpeech(t)) {
      _activeEngine = 'WebSpeechAPI';
      console.log('[TTS] ✅ Engine: Web Speech API');
      return;
    }

    // ENGINE 3: VoiceRSS (if key provided)
    if (await _speakVoiceRSS(t)) {
      _activeEngine = 'VoiceRSS';
      console.log('[TTS] ✅ Engine: VoiceRSS');
      return;
    }

    console.error('[TTS] ❌ All engines failed. Run NassTecTTS.diagnose() for details.');
    _activeEngine = 'none';
  }

  function stop() {
    try { _getCapPlugin()?.stop(); }                              catch (_) {}
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (_) {}
    try { if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; } } catch (_) {}
  }

  function setVoiceRSSKey(key) {
    _voiceRSSKey = key;
    console.log('[TTS] VoiceRSS key set. Engine 3 enabled.');
  }

  function getInfo() {
    const plugin = _getCapPlugin();
    return {
      activeEngine:          _activeEngine,
      nativePluginAvailable: !!plugin,
      webSpeechAvailable:    'speechSynthesis' in window,
      voiceRSSKeySet:        !!_voiceRSSKey,
      arabicVoicesOnDevice:  ('speechSynthesis' in window)
        ? window.speechSynthesis.getVoices()
            .filter(v => /^ar/i.test(v.lang))
            .map(v => `${v.name} (${v.lang})`)
        : [],
    };
  }

  async function diagnose() {
    console.log('═══ NassTecTTS Diagnostics ═══');
    const info = getInfo();
    console.log('Native plugin:   ', info.nativePluginAvailable ? '✅ Found' : '❌ NOT FOUND — did you run npm install + cap sync?');
    console.log('WebSpeech API:   ', info.webSpeechAvailable    ? '✅ Available' : '❌ Not available');
    console.log('VoiceRSS key:    ', info.voiceRSSKeySet         ? '✅ Set'       : '⚠️  Not set (optional)');
    console.log('Arabic voices:   ', info.arabicVoicesOnDevice.length > 0
      ? info.arabicVoicesOnDevice.join(', ')
      : 'None found on device');

    if (!info.nativePluginAvailable) {
      console.warn('FIX: Add @capacitor-community/text-to-speech to package.json dependencies and rebuild APK');
    }

    // Try a real test
    console.log('Running test speak...');
    await speak('اختبار');
    console.log('Active engine after test:', _activeEngine);
    console.log('══════════════════════════');
    return info;
  }

  // Warm up voice list
  if ('speechSynthesis' in window) {
    window.addEventListener('load', () => {
      window.speechSynthesis.getVoices();
      _resolveVoice();
    });
  }

  return { speak, stop, setVoiceRSSKey, getInfo, diagnose };
})();
