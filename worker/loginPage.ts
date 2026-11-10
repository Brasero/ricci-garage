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
<title>Ricci Garage</title>
<style nonce="${nonce}">
:root{--bg:#f4f6f9;--surface:#fff;--text:#17212b;--muted:#5d6b7a;--border:#d6dde5;--primary:#184070;--on:#fff;--bad:#b3261e}
@media(prefers-color-scheme:dark){:root{--bg:#11161c;--surface:#1a222b;--text:#e8edf2;--muted:#9aa8b6;--border:#2c3845;--primary:#5b9bd8;--on:#0b1520;--bad:#ff8a80}}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--text);font:17px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
form{width:100%;max-width:380px;display:grid;gap:10px;text-align:center}
h1{margin:0}
.icon{font-size:3rem}
p{margin:0;color:var(--muted)}
input{font:inherit;font-size:1.1rem;padding:14px 16px;border:2px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);text-align:center;width:100%}
input:focus{outline:none;border-color:var(--primary)}
button{font:inherit;font-weight:600;font-size:1.1rem;min-height:54px;border:0;border-radius:12px;background:var(--primary);color:var(--on);cursor:pointer}
button:disabled{opacity:.5}
.err{color:var(--bad);font-weight:600;min-height:1.4em}
</style>
</head>
<body>
<form id="f">
<div class="icon" aria-hidden="true">🔒</div>
<h1>Ricci Garage</h1>
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
