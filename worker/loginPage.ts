/**
 * Seule page servie sans session : un formulaire de code, rien d'autre (aucune ressource de l'application).
 * Après un code correct, elle mémorise sur l'appareil l'empreinte du code (même format que src/lock.ts,
 * pour que l'application puisse le vérifier hors connexion), puis recharge : le serveur livre alors l'application.
 */
export function loginPage(nonce: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#184070">
<title>Mitch depann</title>
<style nonce="${nonce}">
:root{--bg:#f3f6fb;--surface:#fff;--text:#0f1b2d;--muted:#6b7a90;--border:#e2e8f1;--border-strong:#cdd6e3;--primary:#1d4b86;--on:#fff;--bad:#b42318;--ring:0 0 0 4px rgba(29,75,134,.18)}
@media(prefers-color-scheme:dark){:root{--bg:#0a111e;--surface:#111b2d;--text:#e9eff9;--muted:#8a9ab2;--border:#1f2d46;--border-strong:#2c3d5c;--primary:#6aa6ee;--on:#07142a;--bad:#ff8e85;--ring:0 0 0 4px rgba(106,166,238,.25)}}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:20px;color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:radial-gradient(120% 80% at 50% 0%,color-mix(in srgb,var(--primary) 22%,var(--bg)) 0%,var(--bg) 60%)}
form{width:100%;max-width:380px;display:grid;gap:12px;text-align:center;padding:28px 22px;background:var(--surface);border:1px solid var(--border);border-radius:24px;box-shadow:0 4px 16px rgba(16,33,60,.09)}
.logo{margin:0 auto;border-radius:15px;box-shadow:0 2px 8px rgba(20,51,95,.35)}
h1{margin:0;font-size:1.65rem;line-height:1.2;font-weight:750;letter-spacing:-.025em}
p{margin:0;color:var(--muted)}
input{font:inherit;font-size:1.05rem;padding:15px 16px;border:1.5px solid var(--border-strong);border-radius:14px;background:var(--surface);color:var(--text);text-align:center;width:100%}
input:focus{outline:none;border-color:var(--primary);box-shadow:var(--ring)}
button{font:inherit;font-weight:650;font-size:1.02rem;min-height:52px;border:0;border-radius:12px;background:var(--primary);color:var(--on);cursor:pointer;box-shadow:0 1px 2px rgba(16,33,60,.2),0 6px 14px color-mix(in srgb,var(--primary) 30%,transparent)}
button:disabled{opacity:.5;box-shadow:none}
.err{color:var(--bad);font-weight:600;min-height:1.4em;font-size:.92rem}
</style>
</head>
<body>
<form id="f">
<svg class="logo" width="56" height="56" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6bb8"/><stop offset="1" stop-color="#14335f"/></linearGradient></defs><rect width="40" height="40" rx="11" fill="url(#g)"/><g transform="translate(8 8)" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path transform="translate(-.5 -.5)" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></g></svg>
<h1>Mitch depann</h1>
<p>Saisissez le code pour accéder à l'application.</p>
<input id="c" type="password" autocomplete="current-password" placeholder="Code d'accès" aria-label="Code d'accès" autofocus>
<div class="err" id="e" role="alert"></div>
<button id="b" type="submit" disabled>Déverrouiller</button>
</form>
<script nonce="${nonce}">
(function(){
var f=document.getElementById('f'),c=document.getElementById('c'),e=document.getElementById('e'),b=document.getElementById('b');
c.addEventListener('input',function(){b.disabled=!c.value});
function b64(a){var s='';a=new Uint8Array(a);for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s)}
async function verifier(code){
  var salt=crypto.getRandomValues(new Uint8Array(16)),iter=300000;
  var key=await crypto.subtle.importKey('raw',new TextEncoder().encode(code),'PBKDF2',false,['deriveBits']);
  var bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:salt,iterations:iter},key,256);
  return {v:1,i:iter,s:b64(salt),h:b64(bits)};
}
f.addEventListener('submit',async function(ev){
  ev.preventDefault();if(b.disabled)return;
  b.disabled=true;e.textContent='';
  try{
    var r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:c.value})});
    if(r.ok){
      try{localStorage.setItem('rg_verifier',JSON.stringify(await verifier(c.value)));sessionStorage.setItem('rg_unlocked',String(Date.now()))}catch(x){}
      location.reload();return;
    }
    e.textContent=r.status===429?"Trop d'essais. Réessayez dans 15 minutes.":'Code incorrect.';
  }catch(x){e.textContent='Pas de connexion internet.'}
  c.value='';b.disabled=true;c.focus();
});
})();
</script>
</body>
</html>`
}
