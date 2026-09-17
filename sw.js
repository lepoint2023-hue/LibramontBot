/* ═══════════════════════════════════════════════════════════
   SERVICE WORKER — Ville de Libramont-Chevigny (LibramontBot)
   Gestion des notifications push + cache PWA
   ═══════════════════════════════════════════════════════════ */
 
const CACHE_NAME = 'libramontbot-v1';  /* ← à incrémenter pour forcer le rechargement sur tous les appareils */
const ASSETS = [
  '/LibramontBot/',
  '/LibramontBot/index.html',
  '/LibramontBot/module4-prompt.js',
  '/LibramontBot/module6-api.js',
  '/LibramontBot/module-voice.js',
  '/LibramontBot/manifest.json',
  '/LibramontBot/libramont-logo.png',
  '/LibramontBot/icon-192.png',
  '/LibramontBot/icon-512.png'
];
 
/* ── Installation : mise en cache des ressources ── */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS).catch(function(err) {
        console.warn('[SW] Cache partiel:', err);
      });
    })
  );
  self.skipWaiting();
});
 
/* ── Activation : suppression des anciens caches ── */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});
 
/* ── Fetch : réseau en priorité avec timeout, cache en fallback ── */
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
 
  const url = e.request.url;
 
  /* Toujours réseau pour les appels API externes */
  if (url.includes('workers.dev') || url.includes('googleapis') ||
      url.includes('groq.com') || url.includes('fonts.g')) {
    return;
  }
 
  e.respondWith(
    fetch(e.request).then(function(response) {
      /* Mettre à jour le cache avec la nouvelle version */
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, clone);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
 
/* ── Push : notification système + postMessage aux clients ouverts ── */
self.addEventListener('push', function(e) {
  let data = { title: 'Ville de Libramont-Chevigny', body: 'Nouveau message de la Ville.', url: '/LibramontBot/' };
  try {
    if (e.data) data = Object.assign(data, e.data.json());
  } catch(err) {
    if (e.data) data.body = e.data.text();
  }
 
  /* Types d'alerte nécessitant une interaction obligatoire (non auto-dismissibles) */
  const URGENT_TYPES = ['urgence_commune', 'incendie_feu', 'inondation', 'accident_incident'];
  const alertType    = data.type || 'general';
  const isUrgent     = URGENT_TYPES.includes(alertType);
 
  const options = {
    body:               data.body,
    icon:               '/LibramontBot/icon-192.png',
    badge:              '/LibramontBot/icon-192.png',
    vibrate:            isUrgent ? [200, 100, 200, 100, 200] : [100, 50, 100],
    data:               { url: data.url || '/LibramontBot/' },
    tag:                alertType,          /* remplace une alerte du même type au lieu d'empiler */
    renotify:           true,               /* vibre/sonne même si un tag identique existe déjà  */
    requireInteraction: isUrgent,           /* reste visible jusqu'à action manuelle si urgent    */
    actions: [
      { action: 'open',    title: 'Ouvrir' },
      { action: 'dismiss', title: 'Fermer' }
    ]
  };
 
  e.waitUntil(
    /* 1. Prévenir les onglets/app déjà ouverts */
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        clientList.forEach(function(client) {
          client.postMessage({ type: 'PUSH_RECEIVED', title: data.title, body: data.body });
        });
      })
      /* 2. Afficher la notification système */
      .then(function() {
        return self.registration.showNotification(data.title, options);
      })
  );
});
 
/* ── Clic sur notification ── */
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const target = e.notification.data?.url || '/LibramontBot/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (const client of list) {
        if (client.url.includes('/LibramontBot/') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
 
/* ── Fermeture de notification sans clic ── */
self.addEventListener('notificationclose', function(e) {
  /* Permet de tracer les fermetures passives côté app si besoin */
  self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(function(clientList) {
      clientList.forEach(function(client) {
        client.postMessage({
          type: 'NOTIFICATION_DISMISSED',
          tag:  e.notification.tag || 'general'
        });
      });
    });
});
 
/* ── Renouvellement automatique d'abonnement push ── */
/* Déclenché par le navigateur quand la subscription expire (changement de clé serveur, etc.) */
self.addEventListener('pushsubscriptionchange', function(e) {
  e.waitUntil(
    self.registration.pushManager.subscribe(e.oldSubscription.options)
      .then(function(newSubscription) {
        /* Prévenir l'app ouverte pour qu'elle renvoie la nouvelle subscription au serveur */
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then(function(clientList) {
            clientList.forEach(function(client) {
              client.postMessage({
                type:         'SUBSCRIPTION_RENEWED',
                subscription: JSON.stringify(newSubscription)
              });
            });
          });
      })
      .catch(function(err) {
        console.warn('[SW] Échec du renouvellement de subscription push:', err);
      })
  );
});
 