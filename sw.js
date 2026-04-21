// O nome do cache. Quando você fizer uma mudança GIGANTE, mude o v1 para v2, v3, etc.
const CACHE_NAME = 'pontalina-app-v1';

// 1. Instalação: Força o novo aplicativo a assumir o controle na mesma hora
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// 2. Ativação: Limpa os lixos e caches antigos do celular do cidadão
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

// 3. Estratégia de Busca: NETWORK FIRST (Internet primeiro, Cache como plano B)
self.addEventListener('fetch', (event) => {
    // Ignora requisições de outras origens (como o banco do Firebase) para não dar conflito
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Se a internet funcionou e baixou a versão nova, salva uma cópia no cache
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, response.clone());
                    return response;
                });
            })
            .catch(() => {
                // Se o cidadão estiver sem internet (offline), puxa a versão salva no celular
                return caches.match(event.request);
            })
    );
});
