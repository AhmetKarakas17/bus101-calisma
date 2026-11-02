// Çevrimdışı çalışma: önce ağdan dener, ağ yoksa son kaydedilen sürümü verir.
const CACHE='bia-v4';
const FILES=['./','index.html','styles.css','theme.js','app.js','data.js','icon.svg','icon-180.png','icon-512.png','manifest.webmanifest'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin) return;
  e.respondWith(
    fetch(e.request).then(r=>{
      if(r.ok){ const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)) }
      return r;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./')))
  );
});
