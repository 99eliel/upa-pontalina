const CACHE_NAME = 'upa-pontalina-v1';

// Lista de arquivos e links externos que o app vai salvar na memória do celular
const assets = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn-icons-png.flaticon.com/512/2966/2966327.png'
];

// Instalação do Service Worker e salvamento em cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Fazendo cache dos arquivos...');
      return cache.addAll(assets);
    })
  );
});

// Interceptando as requisições para funcionar mais rápido (ou offline)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Retorna do cache se existir, senão busca na internet
      return response || fetch(event.request);
    })
  );
});