export const SPATIAL_KEY = 'kosif-spatial-v1';
export function splineUrl(value) {
 try { const u=new URL(String(value).trim()); return u.protocol==='https:' && u.hostname==='my.spline.design' && !u.username && !u.password && !u.port && u.pathname.length>1 ? u.origin+u.pathname : ''; } catch { return ''; }
}
export function readSpatial(storage) {
 try { const s=JSON.parse(storage.getItem(SPATIAL_KEY)||'{}');return {enabled:s.enabled!==false,motion:s.motion!==false,url:splineUrl(s.url)}; } catch {return {enabled:true,motion:true,url:''};}
}
