const CACHE_NAME = 'wait-minute-v1';
const urlsToCache = [
  '/',
  '/offline.html'
];

// Install service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Activate service worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first strategy
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request)
          .then(response => {
            if (response) {
              return response;
            }
            if (event.request.mode === 'navigate') {
              return caches.match('/offline.html');
            }
          });
      })
  );
});

// Push notification
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : '대기인원이 발생했습니다!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200, 100, 400], // 진동 패턴: 진동-멈춤-진동-멈춤-긴진동
    requireInteraction: true,
    tag: 'wait-a-minute-alert',
    renotify: true,
    actions: [
      {
        action: 'open',
        title: '확인하기'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Wait-a-Minute 알림', options)
  );
});

// Notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});