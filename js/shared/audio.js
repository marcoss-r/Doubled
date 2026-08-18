/**
 * Doubled — sonidos sintetizados (Web Audio) y vibración, con mute
 * persistido en localStorage. Nada de ficheros de audio: cada sonido es un
 * osciloscopio corto, así que no hay nada que precachear ni pesar.
 *
 * ES5 + IIFE (ver docs/CONVENTIONS.md §5): global, sin módulos.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'doubled:muted';
  var audioCtx = null;
  var muted = global.DoubledStorage ? global.DoubledStorage.getBoolean(STORAGE_KEY, false) : false;

  function ensureContext() {
    if (audioCtx) return audioCtx;
    var AudioContextClass = global.AudioContext || global.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
    return audioCtx;
  }

  /** Debe llamarse desde un gesto del usuario: iOS exige desbloquear el audio. */
  function unlock() {
    var ctx = ensureContext();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function beep(freq, duration, type) {
    if (muted) return;
    var ctx = ensureContext();
    if (!ctx) return;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  function vibrate(pattern) {
    if (global.navigator && global.navigator.vibrate) global.navigator.vibrate(pattern);
  }

  function setMuted(value) {
    muted = value;
    if (global.DoubledStorage) global.DoubledStorage.setBoolean(STORAGE_KEY, value);
  }

  function isMuted() {
    return muted;
  }

  global.DoubledAudio = {
    unlock: unlock,
    beep: beep,
    vibrate: vibrate,
    setMuted: setMuted,
    isMuted: isMuted
  };
})(window);
