// Generated during Cloudflare packaging; registration failure never blocks work.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
 window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}), {once:true});
}
