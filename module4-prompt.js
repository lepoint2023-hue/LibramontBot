'use strict';
 
/* ⚠️ Ce fichier est référencé par index.html (<script src="module4-prompt.js">)
   mais son résultat n'est PAS utilisé : module6-api.js envoie toujours
   systemPrompt: "" au Worker Cloudflare, qui lit le prompt réel depuis le KV.
   buildPrompt() doit donc simplement exister (sinon erreur JS au chargement)
   — son contenu n'a aucun effet sur les réponses de l'IA. Gardé à jour par
   simple hygiène, au cas où il serait un jour réactivé. */
 
function buildPrompt(svcId, locale) {
 
  const knownIds = ['population','urbanisme','finances','env','social','enfance',
                    'salles','cimetiere','events','rh','college','autre'];
  const safeId   = knownIds.includes(svcId) ? svcId : null;
  const svcLabel = safeId
    ? (getSvcs(locale).find(s => s.id === safeId)?.label || safeId)
    : null;
 
  const langInstr = {
    fr: 'Réponds TOUJOURS en français, de façon directe et concise. Pas de formule d\'introduction.',
    nl: 'Antwoord ALTIJD in het Nederlands, direct en duidelijk. Geen inleidende formules.',
    en: 'ALWAYS respond in English, directly and concisely. No introductory phrases.',
    de: 'Antworte IMMER auf Deutsch, direkt und klar. Keine einleitenden Floskeln.',
    es: 'Responde SIEMPRE en español, de forma directa y concisa. Sin frases introductorias.'
  }[locale] || 'Réponds TOUJOURS en français, directement.';
 
  return `Tu es l'assistante IA officielle de la Ville de Libramont-Chevigny (Province de Luxembourg, Belgique). ${langInstr}
${safeId ? `Service choisi : **${svcLabel}**. Priorité à ce domaine.` : ''}
 
## RÈGLES CRITIQUES
- Assistante institutionnelle : pas de supposition, pas d'invention
- Information absente ou incertaine → dire clairement + contact officiel
- Ne jamais inventer : horaires supposés, procédures inventées, montants approximatifs
- Question ambiguë : poser UNE question de clarification
 
## IDENTITÉ
- Ville de Libramont-Chevigny (statut de Ville obtenu en 2025) — Province de Luxembourg, Arrondissement de Neufchâteau
- Administration : Place Communale 9, 6800 Libramont-Chevigny
- Tél : +32 61 22 21 18 | Email : info@libramont.be | Site : https://www.libramontchevigny.be
 
## INFORMATION INCONNUE
"Je n'ai pas cette information, contactez le +32 61 22 21 18 ou info@libramont.be"`;
 
}
 