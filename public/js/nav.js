// Inject a sticky nav into the page
(function(){
  const nav = document.createElement('nav');
  nav.style.cssText = `
    position:sticky; top:0; z-index:9999;
    background: rgba(20, 0, 31, .82);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255,255,255,.08);
  `;
  nav.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:10px 16px;display:flex;gap:14px;align-items:center;justify-content:space-between">
      <div style="display:flex;gap:14px;align-items:center">
        <a href="/" style="font-weight:800;letter-spacing:.3px;text-decoration:none;color:var(--fg,#eae6ff)">Doomzy</a>
        <a href="/global.html" class="navlink" style="color:var(--muted,#b5a4ff);text-decoration:none">Global</a>
        <a href="/resources.html" class="navlink" style="color:var(--muted,#b5a4ff);text-decoration:none">Resources</a>
        <a href="/tasks.html" class="navlink" style="color:var(--muted,#b5a4ff);text-decoration:none">Tasks</a>
        <a href="/profile.html" class="navlink" style="color:var(--muted,#b5a4ff);text-decoration:none">Profile</a>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button id="globalRefreshBtn" class="btn-primary" style="padding:.45rem .8rem;font-size:.9rem;background:linear-gradient(90deg,var(--accent,#8b5cf6),var(--accent-2,#a855f7));border:0;border-radius:12px;color:#fff;cursor:pointer">Refresh</button>
        <a href="/auth/login" class="navlink" style="color:var(--muted,#b5a4ff);text-decoration:none">Login</a>
      </div>
    </div>
  `;
  document.body.prepend(nav);
})();
