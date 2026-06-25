importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAnESxznzZ7CC2QVevYNEYfjysMEzYkfNA",
  authDomain: "upa-pontalina.firebaseapp.com",
  databaseURL: "https://upa-pontalina-default-rtdb.firebaseio.com",
  projectId: "upa-pontalina",
  storageBucket: "upa-pontalina.appspot.com",
  messagingSenderId: "881228406713",
  appId: "1:881228406713:web:4a8637dc043c8be3d52068"
});

try {
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'ConecteBR';
    const options = {
      body: payload.notification?.body || 'Novo aviso disponível.',
      icon: 'https://i.imgur.com/lUheBDA.png',
      badge: 'https://i.imgur.com/lUheBDA.png',
      vibrate: [200, 100, 200]
    };
    self.registration.showNotification(title, options);
  });
} catch (error) {
  console.log('Messaging não configurado:', error);
}

const CACHE_NAME = 'conectebr-v1';
const CORE_FILES = ['./', './index.html', './style.css', './app.js', './firebase.js', './manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_FILES).catch(() => null)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((name) => name !== CACHE_NAME ? caches.delete(name) : null)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
