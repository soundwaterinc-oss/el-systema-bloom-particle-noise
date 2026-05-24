// EL-SYSTEMA ─ メッセージの形（schema と型ガード）
//
// すべてのメッセージは plain object。t（type）と at（実刻 ms）は必須。
// 古い JS でも読めるよう、ES module ではなく IIFE で window/globalThis に出す。
// hub（Node）からも require せずに同じ判定を共有できるよう module.exports も書く。

(function (root) {
  "use strict";

  const TYPES = ["relay", "kehai", "silence", "ack", "err", "maneki", "kotodama"];
  const CMDS  = ["play", "stop", "setParam", "ramp", "loadPreset", "snapshot"];

  function isString(x) { return typeof x === "string" && x.length > 0; }
  function isNumber(x) { return typeof x === "number" && isFinite(x); }
  function isBool(x)   { return typeof x === "boolean"; }
  function isObj(x)    { return x && typeof x === "object" && !Array.isArray(x); }

  function nowMs() {
    return Date.now();
  }

  // 共通必須キー
  function hasCommon(m) {
    return isObj(m) && isString(m.t) && TYPES.indexOf(m.t) >= 0 && isNumber(m.at);
  }

  function isRelay(m) {
    if (!hasCommon(m) || m.t !== "relay") return false;
    if (!isString(m.target)) return false;
    if (!isString(m.cmd) || CMDS.indexOf(m.cmd) < 0) return false;
    if (!isString(m.id)) return false;
    switch (m.cmd) {
      case "play":
      case "stop":
      case "snapshot":
        return true;
      case "setParam":
        return isString(m.name) && (isNumber(m.value) || isString(m.value));
      case "ramp":
        return isString(m.name) && isNumber(m.from) && isNumber(m.to) && isNumber(m.dur) && isNumber(m.startAt);
      case "loadPreset":
        return isObj(m.preset);
      default:
        return false;
    }
  }

  function isKehai(m) {
    return hasCommon(m) && m.t === "kehai"
      && isString(m.from)
      && isNumber(m.presence) && isNumber(m.low) && isNumber(m.high)
      && isBool(m.everSpoke);
  }

  function isSilence(m) {
    return hasCommon(m) && m.t === "silence"
      && isString(m.from) && isNumber(m.since);
  }

  function isAck(m) {
    return hasCommon(m) && m.t === "ack"
      && isString(m.from) && isString(m.of) && isBool(m.ok);
  }

  function isErr(m) {
    return hasCommon(m) && m.t === "err"
      && isString(m.from) && isString(m.of) && isString(m.msg);
  }

  function isManeki(m) {
    return hasCommon(m) && m.t === "maneki"
      && isString(m.guise) && isNumber(m.startAt);
  }

  function isKotodama(m) {
    return hasCommon(m) && m.t === "kotodama"
      && isString(m.from) && isString(m.text);
  }

  function isValid(m) {
    if (!hasCommon(m)) return false;
    switch (m.t) {
      case "relay":    return isRelay(m);
      case "kehai":    return isKehai(m);
      case "silence":  return isSilence(m);
      case "ack":      return isAck(m);
      case "err":      return isErr(m);
      case "maneki":   return isManeki(m);
      case "kotodama": return isKotodama(m);
      default: return false;
    }
  }

  // 巫が新規 relay を作るときの id 採番（衝突しなければよい）
  let _seq = 0;
  function newRelayId() {
    _seq = (_seq + 1) | 0;
    return "r" + nowMs().toString(36) + "-" + _seq.toString(36);
  }

  const API = {
    TYPES, CMDS,
    nowMs, newRelayId,
    isRelay, isKehai, isSilence, isAck, isErr, isManeki, isKotodama, isValid,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    root.ElSystemaShapes = API;
  }
})(typeof window !== "undefined" ? window : globalThis);
