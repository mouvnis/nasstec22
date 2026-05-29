/**
 * nasstec-arabic-tts.js  v3.0
 * ─────────────────────────────────────────────────────────────
 * Free Arabic TTS — works in Android WebView without Chrome.
 *
 * Engine cascade (first success wins):
 *
 *  1. Google Translate TTS  — free, no API key, online, best quality
 *     Uses the public translate_tts endpoint. Works in any WebView
 *     via a plain Audio() object. Supports Arabic natively.
 *
 *  2. Web Speech API  — uses device TTS engine (Google TTS, Samsung TTS).
 *     Fully offline if device has an Arabic TTS engine installed.
 *     Works in Android WebView ≥ 4.4 without Chrome.
 *
 *  3. HuggingFace SILMA TTS  — free HF Inference API, online.
 *     Best open-source Arabic model (150M, bilingual AR/EN).
 *     No API key needed for occasional use.
 *
 *  4. HuggingFace SpeechT5 Arabic  — MBZUAI model, free HF API, online.
 *
 * Usage:
 *   await NassTecTTS.speak("مرحباً بكم في نص تك");
 *   NassTecTTS.stop();
 *   NassTecTTS.getInfo();
 *   await NassTecTTS.test();
 * ─────────────────────────────────────────────────────────────
 */

const NassTecTTS = (() => {

  let _currentAudio = null;
  let _activeEngine  = null;

  /* ════════════════════════════════════════════════════════════
     ENGINE 1 — Google Translate TTS
     Free, no API key, online. Works in WebView via Audio().
     Best quality Arabic voice available for free.
  ═════════════════════════════════════════════════════════════*/
  async function _speakGoogleTTS(text) {
    // Split into chunks ≤ 200 chars (Google TTS limit per request)
    const chunks = _chunkText(text, 200);
    try {
      for (const chunk of chunks) {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=ar&client=tw-ob&ttsspeed=0.9`;
        const ok = await _playAudio(url);
        if (!ok) return false;
      }
      return true;
    } catch { return false; }
  }

  /* ════════════════════════════════════════════════════════════
     ENGINE 2 — Web Speech API (offline if device has Arabic TTS)
  ═════════════════════════════════════════════════════════════*/
  let _wsVoice = null;

  async function _resolveWSVoice() {
    if (_wsVoice) return _wsVoice;
    if (!('speechSynthesis' in window)) return null;
    return new Promise(resolve => {
      const pick = () => {
        const all = window.speechSynthesis.getVoices();
        if (!all.length) return null;
        for (const lang of ['ar-SA','ar-EG','ar-AE','ar','ar-MA']) {
          const v = all.find(v => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
          if (v) return v;
        }
        return all.find(v => /arab/i.test(v.name)) || null;
      };
      const v = pick();
      if (v) { _wsVoice = v; resolve(v); return; }
      if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => { _wsVoice = pick(); resolve(_wsVoice); };
      }
      setTimeout(() => resolve(null), 3000);
    });
  }

  async function _speakWebSpeech(text) {
    if (!('speechSynthesis' in window)) return false;
    try { window.speechSynthesis.cancel(); } catch (_) {}
    const voice = await _resolveWSVoice();
    if (!voice) return false;
    return new Promise(resolve => {
      const utt   = new SpeechSynthesisUtterance(text);
      utt.lang    = voice.lang || 'ar-SA';
      utt.voice   = voice;
      utt.rate    = 0.9;
      utt.pitch   = 1.0;
      utt.volume  = 1;
      const guard = setTimeout(() => resolve(true), text.length * 120 + 3000);
      utt.onend   = () => { clearTimeout(guard); resolve(true); };
      utt.onerror = e  => { clearTimeout(guard); console.warn('[TTS] WebSpeech:', e.error); resolve(false); };
      try {
        window.speechSynthesis.speak(utt);
        setTimeout(() => {
          if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
            try { window.speechSynthesis.speak(utt); } catch (_) {}
          }
        }, 150);
      } catch (e) { clearTimeout(guard); resolve(false); }
    });
  }

  /* ════════════════════════════════════════════════════════════
     ENGINE 3 — HuggingFace SILMA TTS (free, online, best OSS Arabic)
     Model: silma-ai/silma-tts  (150M bilingual AR/EN)
  ═════════════════════════════════════════════════════════════*/
  async function _speakSilmaTTS(text) {
    try {
      const resp = await fetch(
        'https://api-inference.huggingface.co/models/silma-ai/silma-tts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: text }),
        }
      );
      if (!resp.ok) return false;
      const blob = await resp.blob();
      return await _playBlob(blob);
    } catch { return false; }
  }

  /* ════════════════════════════════════════════════════════════
     ENGINE 4 — HuggingFace SpeechT5 Arabic (MBZUAI, free)
  ═════════════════════════════════════════════════════════════*/
  async function _speakSpeechT5(text) {
    try {
      const resp = await fetch(
        'https://api-inference.huggingface.co/models/MBZUAI/speecht5_tts_clartts_ar',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: text }),
        }
      );
      if (!resp.ok) return false;
      const blob = await resp.blob();
      return await _playBlob(blob);
    } catch { return false; }
  }

  /* ════════════════════════════════════════════════════════════
     Helpers
  ═════════════════════════════════════════════════════════════*/
  function _chunkText(text, maxLen) {
    const chunks = [];
    // Split on sentence boundaries first
    const sentences = text.split(/[.!?،؟\n]+/).filter(s => s.trim());
    let current = '';
    for (const s of sentences) {
      if ((current + s).length > maxLen) {
        if (current) chunks.push(current.trim());
        current = s;
      } else {
        current += (current ? ' ' : '') + s;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    // If still too long, split by char count
    const result = [];
    for (const c of chunks) {
      if (c.length <= maxLen) { result.push(c); continue; }
      for (let i = 0; i < c.length; i += maxLen) result.push(c.slice(i, i + maxLen));
    }
    return result.length ? result : [text.slice(0, maxLen)];
  }

  function _playAudio(url) {
    return new Promise(resolve => {
      if (_currentAudio) { try { _currentAudio.pause(); } catch(_){} }
      const audio = new Audio(url);
      _currentAudio = audio;
      audio.onended  = () => resolve(true);
      audio.onerror  = () => resolve(false);
      audio.play().catch(() => resolve(false));
    });
  }

  function _playBlob(blob) {
    const url = URL.createObjectURL(blob);
    return new Promise(resolve => {
      if (_currentAudio) { try { _currentAudio.pause(); } catch(_){} }
      const audio = new Audio(url);
      _currentAudio = audio;
      audio.onended  = () => { URL.revokeObjectURL(url); resolve(true); };
      audio.onerror  = () => { URL.revokeObjectURL(url); resolve(false); };
      audio.play().catch(() => { URL.revokeObjectURL(url); resolve(false); });
    });
  }

  /* ════════════════════════════════════════════════════════════
     Public API
  ═════════════════════════════════════════════════════════════*/
  async function speak(text) {
    if (!text?.trim()) return;

    // Engine 1 — Google Translate TTS (online, best quality)
    if (await _speakGoogleTTS(text)) { _activeEngine = 'GoogleTranslateTTS'; return; }

    // Engine 2 — Web Speech API (offline if Arabic TTS installed)
    if (await _speakWebSpeech(text))  { _activeEngine = 'WebSpeechAPI';       return; }

    // Engine 3 — SILMA TTS via HuggingFace (online, best OSS)
    if (await _speakSilmaTTS(text))   { _activeEngine = 'SilmaTTS_HF';        return; }

    // Engine 4 — SpeechT5 Arabic via HuggingFace (online fallback)
    if (await _speakSpeechT5(text))   { _activeEngine = 'SpeechT5_HF';        return; }

    console.error('[NassTecTTS] All engines failed.');
    _activeEngine = 'none';
  }

  function stop() {
    try { if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; } } catch (_) {}
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }  catch (_) {}
  }

  function getInfo() {
    return {
      activeEngine: _activeEngine,
      webSpeechAvailable: 'speechSynthesis' in window,
      arabicVoicesOnDevice: ('speechSynthesis' in window)
        ? window.speechSynthesis.getVoices()
            .filter(v => /^ar/i.test(v.lang))
            .map(v => `${v.name} (${v.lang})`)
        : [],
    };
  }

  async function test() {
    await speak('مرحباً، هذا اختبار صوتي لتطبيق نص تك');
    console.log('[NassTecTTS] Engine used:', _activeEngine);
  }

  // Warm up voice list on load
  if ('speechSynthesis' in window) {
    window.addEventListener('load', () => {
      window.speechSynthesis.getVoices();
      _resolveWSVoice();
    });
  }

  return { speak, stop, getInfo, test };
})();
