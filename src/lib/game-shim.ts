/**
 * A tiny script injected at the top of every uploaded game's HTML page.
 *
 * Games run in a locked-down sandbox so they can never see anyone's login.
 * In that sandbox the browser blocks `localStorage`, which lots of games use
 * for save data and high scores. This script swaps in a stand-in that keeps
 * saves working (they are stored by the arcade page, per game, per browser).
 *
 * It also gives games `window.FamilyArcade.submitScore(points)` for leaderboards.
 */
export const GAME_SHIM = `<script>(function(){
var P = window.parent && window.parent !== window ? window.parent : null;
function send(msg){ if(!P) return; msg.__familyArcade = 1; try { P.postMessage(msg, "*"); } catch(e){} }
var saved = {};
try { var n = window.name || ""; if (n.indexOf("fa-save:") === 0) { saved = JSON.parse(n.slice(8)) || {}; } } catch(e) { saved = {}; }
function makeStore(data, onChange){
  var has = function(k){ return Object.prototype.hasOwnProperty.call(data, k); };
  var api = {
    getItem: function(k){ k = String(k); return has(k) ? data[k] : null; },
    setItem: function(k, v){ data[String(k)] = String(v); onChange(); },
    removeItem: function(k){ delete data[String(k)]; onChange(); },
    clear: function(){ for (var k in data) delete data[k]; onChange(); },
    key: function(i){ var ks = Object.keys(data); return i < ks.length ? ks[i] : null; }
  };
  Object.defineProperty(api, "length", { get: function(){ return Object.keys(data).length; }, configurable: true });
  return new Proxy(api, {
    get: function(t, p){ if (p in t) return t[p]; if (typeof p === "string" && has(p)) return data[p]; return undefined; },
    set: function(t, p, v){ if (p in t) return false; t.setItem(p, v); return true; },
    deleteProperty: function(t, p){ t.removeItem(p); return true; },
    has: function(t, p){ return (p in t) || has(p); },
    ownKeys: function(){ return Object.keys(data); },
    getOwnPropertyDescriptor: function(t, p){ if (has(p)) return { value: data[p], enumerable: true, configurable: true, writable: true }; return undefined; }
  });
}
function works(name){ try { var s = window[name]; s.setItem("__fa", "1"); s.removeItem("__fa"); return true; } catch(e) { return false; } }
if (!works("localStorage")) {
  var timer = null;
  var local = makeStore(saved, function(){ clearTimeout(timer); timer = setTimeout(function(){ send({ type: "save", data: saved }); }, 200); });
  try { Object.defineProperty(window, "localStorage", { value: local, configurable: true }); } catch(e) {}
}
if (!works("sessionStorage")) {
  var session = makeStore({}, function(){});
  try { Object.defineProperty(window, "sessionStorage", { value: session, configurable: true }); } catch(e) {}
}
var lastScore = 0;
window.FamilyArcade = {
  inArcade: !!P,
  submitScore: function(points){
    var n = Number(points);
    if (!isFinite(n)) return false;
    var now = Date.now();
    if (now - lastScore < 1000) return false;
    lastScore = now;
    send({ type: "score", score: n });
    return true;
  }
};
send({ type: "ready" });
})();</script>`;

export function injectShim(html: string) {
  const headMatch = html.match(/<head(\s[^>]*)?>/i);
  if (headMatch && headMatch.index !== undefined) {
    const at = headMatch.index + headMatch[0].length;
    return html.slice(0, at) + GAME_SHIM + html.slice(at);
  }
  const htmlMatch = html.match(/<html(\s[^>]*)?>/i);
  if (htmlMatch && htmlMatch.index !== undefined) {
    const at = htmlMatch.index + htmlMatch[0].length;
    return html.slice(0, at) + "<head>" + GAME_SHIM + "</head>" + html.slice(at);
  }
  const doctype = html.match(/<!doctype[^>]*>/i);
  if (doctype && doctype.index !== undefined) {
    const at = doctype.index + doctype[0].length;
    return html.slice(0, at) + GAME_SHIM + html.slice(at);
  }
  return GAME_SHIM + html;
}

/**
 * Sandbox rules for game pages. No "allow-same-origin", so a game can never
 * read the arcade's cookies or sign-in, even if someone opens the file directly.
 */
export const GAME_SANDBOX =
  "allow-scripts allow-pointer-lock allow-popups allow-forms allow-modals allow-downloads allow-orientation-lock allow-presentation";
