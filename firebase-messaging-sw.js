importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyAnESxznzZ7CC2QVevYNEYfjysMEzYkfNA",
    authDomain: "upa-pontalina.firebaseapp.com",
    databaseURL: "https://upa-pontalina-default-rtdb.firebaseio.com",
    projectId: "upa-pontalina",
    messagingSenderId: "881228406713",
    appId: "1:881228406713:web:4a8637dc043c8be3d52068"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('Notificação recebida silenciosamente: ', payload);
  const notificationTitle = payload.notification.title || 'Prefeitura de Pontalina';
  const notificationOptions = {
    body: payload.notification.body,
    icon: 'https://i.imgur.com/lUheBDA.png',
    badge: 'https://i.imgur.com/lUheBDA.png',
    vibrate: [200, 100, 200, 100, 200, 100, 200]
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

const CACHE_NAME = 'pontalina-app-v6';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (!event.request.url.startsWith(self.location.origin)) return;
    event.respondWith(
        fetch(event.request).then((response) => {
            return caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, response.clone());
                return response;
            });
        }).catch(() => {
            return caches.match(event.request);
        })
    );
});
