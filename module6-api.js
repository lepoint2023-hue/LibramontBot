/* ═══════════════════════════════════════════════════════════
   MODULE 6 — APPEL VIA PROXY CLOUDFLARE
   Ville de Libramont-Chevigny · v7.0
   ═══════════════════════════════════════════════════════════ */
 
const PROXY_URL = "https://libramontbot.lepoint2023.workers.dev/llm";
 
const HISTORY_MAX   = 20;
const FETCH_TIMEOUT = 20000;
const MAX_TOKENS    = 1500;
 
/* ── Messages multilingues ── */
const MSG_ERREUR = {
  fr: "Désolé, je n'ai pas pu traiter votre demande. Contactez-nous au **+32 61 22 21 18**.",
  nl: "Sorry, uw verzoek kon niet worden verwerkt. Bel ons op **+32 61 22 21 18**.",
  en: "Sorry, your request could not be processed. Contact us at **+32 61 22 21 18**.",
  de: "Entschuldigung, Ihre Anfrage konnte nicht bearbeitet werden. Rufen Sie uns an: **+32 61 22 21 18**.",
  es: "Lo sentimos, no pudimos procesar su solicitud. Contáctenos en **+32 61 22 21 18**.",
  ar: "عذراً، لم نتمكن من معالجة طلبك. اتصل بنا على **+32 61 22 21 18**."
};
 
const MSG_CONNEXION = {
  fr: "⚠️ Connexion indisponible. Contactez-nous au **+32 61 22 21 18** ou via [le guichet citoyen](https://www.libramontchevigny.be).",
  nl: "⚠️ Verbinding niet beschikbaar. Bel **+32 61 22 21 18** of via [het burgerloket](https://www.libramontchevigny.be).",
  en: "⚠️ Connection unavailable. Contact us at **+32 61 22 21 18** or via [citizen portal](https://www.libramontchevigny.be).",
  de: "⚠️ Verbindung nicht verfügbar. Rufen Sie uns an: **+32 61 22 21 18** oder [Bürgerportal](https://www.libramontchevigny.be).",
  es: "⚠️ Conexión no disponible. Contáctenos en **+32 61 22 21 18** o via [portal ciudadano](https://www.libramontchevigny.be).",
  ar: "⚠️ الاتصال غير متاح. اتصل بنا على **+32 61 22 21 18** أو عبر [بوابة المواطن](https://www.libramontchevigny.be)."
};
 
const MSG_QUOTA = {
  fr: "⚠️ Le service est temporairement saturé. Réessayez dans quelques instants ou appelez-nous au **+32 61 22 21 18**.",
  nl: "⚠️ De service is tijdelijk overbelast. Probeer het later opnieuw of bel **+32 61 22 21 18**.",
  en: "⚠️ The service is temporarily overloaded. Please try again shortly or call **+32 61 22 21 18**.",
  de: "⚠️ Der Dienst ist vorübergehend überlastet. Versuchen Sie es später oder rufen Sie **+32 61 22 21 18** an.",
  es: "⚠️ El servicio está temporalmente saturado. Inténtelo de nuevo o llame al **+32 61 22 21 18**.",
  ar: "⚠️ الخدمة مثقلة مؤقتاً. يرجى المحاولة مرة أخرى أو الاتصال على **+32 61 22 21 18**."
};
 
const MSG_TIMEOUT = {
  fr: "⚠️ La réponse prend trop de temps. Vérifiez votre connexion ou contactez-nous au **+32 61 22 21 18**.",
  nl: "⚠️ Het antwoord duurt te lang. Controleer uw verbinding of bel **+32 61 22 21 18**.",
  en: "⚠️ The response is taking too long. Check your connection or contact us at **+32 61 22 21 18**.",
  de: "⚠️ Die Antwort dauert zu lange. Überprüfen Sie Ihre Verbindung oder rufen Sie **+32 61 22 21 18** an.",
  es: "⚠️ La respuesta tarda demasiado. Verifique su conexión o contáctenos en **+32 61 22 21 18**.",
  ar: "⚠️ الاستجابة تستغرق وقتاً طويلاً. تحقق من اتصالك أو اتصل على **+32 61 22 21 18**."
};
 
/* ── Historique ── */
let history = [];
let loading  = false;
let svcSelectorTimer = null; /* id du setTimeout qui affiche la grille de services après le message d'accueil */
 
function loadHistory() {
  try {
    const stored = sessionStorage.getItem("chatHistory");
    if (stored) history = JSON.parse(stored);
  } catch (e) { history = []; }
}
 
function saveHistory() {
  try { sessionStorage.setItem("chatHistory", JSON.stringify(history)); }
  catch (e) {}
}
 
/* ── Helpers ── */
function getLang() {
  return (typeof window.lang === "string" && window.lang) ? window.lang : "fr";
}
function getSelectedSvc() {
  return (typeof window.selectedSvc !== "undefined") ? window.selectedSvc : null;
}
function safeGetQR() {
  if (typeof getQR === "function") {
    try { return getQR(); } catch (e) { return undefined; }
  }
  return undefined;
}
 
/* ── Extraction réponse selon provider ── */
function _extractReply(data, provider, lang) {
  if (provider === "groq") {
    return data?.choices?.[0]?.message?.content || MSG_ERREUR[lang];
  }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || MSG_ERREUR[lang];
}
 
/* ══════════════════════════════════════════════════════
   APPEL AU PROXY — format unifié
   ══════════════════════════════════════════════════════ */
async function _callProxy(provider, systemPrompt, msgs, signal) {
  return await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      provider:     provider,
      systemPrompt: "", /* Prompt lu depuis KV côté Worker */
      messages:     msgs,
      maxTokens:    MAX_TOKENS
    })
  });
}
 
/* ══════════════════════════════════════════════════════
   APPEL PRINCIPAL
   ══════════════════════════════════════════════════════ */
async function callGemini(userMessage) {
  loading = true;
  document.getElementById("send-btn").disabled = true;
 
  const lang         = getLang();
  const systemPrompt = buildPrompt(getSelectedSvc(), lang);
 
  history.push({ role: "user", content: userMessage });
  if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
  saveHistory();
 
  showTyping();
 
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
 
  try {
    /* Un seul provider actif pour le moment : Gemini est désactivé côté Worker
       (stub permanent qui renvoie toujours une erreur). Inutile donc de tenter
       une bascule dessus en cas de 429 — ça bloquait définitivement le chat. */
    let response;
    const provider = "groq";
 
    response = await _callProxy(provider, systemPrompt, history, controller.signal);
 
    /* Saturé : afficher le message sans bloquer les prochaines requêtes */
    if (response.status === 429) {
      hideTyping();
      if (typeof setStatus === "function") setStatus("quota");
      _callAddMsg("bot", MSG_QUOTA[lang]);
      _finaliseCall();
      clearTimeout(timeoutId);
      return;
    }
 
    if (!response.ok) throw new Error("HTTP " + response.status);
 
    clearTimeout(timeoutId);
 
    const data  = await response.json();
    const reply = _extractReply(data, provider, lang);
 
    history.push({ role: "assistant", content: reply });
    saveHistory();
 
    /* Suivi des questions sans réponse — remonte au Command Center pour
       repérer automatiquement les trous du KV (ex : tarif manquant). */
    if (/je n'ai pas cette information/i.test(reply)) {
      fetch(PROXY_URL.replace(/\/llm$/, "/no-answer"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMessage, lang })
      }).catch(function () {});
    }
 
    hideTyping();
    if (typeof setStatus === "function") setStatus("online");
    _callAddMsg("bot", reply, safeGetQR());
 
  } catch (error) {
    clearTimeout(timeoutId);
    hideTyping();
    const isTimeout = error.name === "AbortError";
    if (typeof setStatus === "function") setStatus("offline");
    _callAddMsg("bot", isTimeout ? MSG_TIMEOUT[lang] : MSG_CONNEXION[lang]);
  }
 
  _finaliseCall();
}
 
/* ── Finalisation ── */
function _finaliseCall() {
  loading = false;
  const btn   = document.getElementById("send-btn");
  const input = document.getElementById("chat-input");
  if (btn)   btn.disabled   = false;
  if (input) input.blur();
}
 
/* ── Résolution tardive de addMsg (défini dans index.html après module6) ── */
function _callAddMsg(role, text, qrs) {
  if (typeof window.addMsg === "function") {
    window.addMsg(role, text, qrs);
  } else {
    /* Fallback : réessayer après que le script inline soit chargé */
    setTimeout(function() { _callAddMsg(role, text, qrs); }, 100);
  }
}
 
/* ── Envoi d'un message ── */
async function sendMsg(text) {
  const input   = document.getElementById("chat-input");
  const message = text !== undefined ? text : input.value.trim();
  if (!message || loading) return;
  if (text === undefined) {
    input.value        = "";
    input.style.height = "auto";
  }
  /* L'utilisateur interagit avant l'affichage automatique de la grille de
     services (2.5s après l'accueil) : on annule ce timer pour qu'elle ne
     s'insère pas après coup entre le message et sa réponse. */
  clearTimeout(svcSelectorTimer);
  /* Mémorise la dernière question posée — utilisé par les boutons 👍/👎
     (index.html) pour associer le vote de satisfaction à sa question. */
  window._lastUserQuestion = message;
  _callAddMsg("user", message);
  await callGemini(message);
}
 
function sendMessage() { sendMsg(); }
 
/* ── Réinitialisation ── */
function resetChat() {
  history = [];
  sessionStorage.removeItem("chatHistory");
  window.selectedSvc = null;
  if (window._usedQR) window._usedQR.clear();
 
  /* Annule un éventuel timer d'un précédent reset encore en attente,
     pour éviter que deux grilles de services ne s'affichent en cascade. */
  clearTimeout(svcSelectorTimer);
 
  const area = document.getElementById("messages");
  const s    = S[getLang()] || S.fr;
 
  area.innerHTML = '<div class="ts" id="ts-label">' + s.ts + "</div>";
  document.getElementById("svc-pill").classList.remove("on");
  document.getElementById("chat-input").placeholder = s.ph;
 
  setTimeout(function () {
    _callAddMsg("bot", s.welcome);
    svcSelectorTimer = setTimeout(showSvcSelector, 1000);
  }, 300);
}
 
loadHistory();
