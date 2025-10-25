// Inject a sticky nav into every page except the login ("/")
(function () {
  try {
    if (location.pathname === '/') return;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      position: sticky; top: 0; z-index: 9999;
      background: transparent;
    `;

    const nav = document.createElement('nav');
    nav.style.cssText = `
      margin: 10px auto 16px auto;
      max-width: 1100px;
      border-radius: 14px;
      background: rgba(20, 0, 31, 0.78);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(180,124,255,0.18);
      box-shadow: 0 10px 40px rgba(163,101,255,0.18);
    `;

    nav.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;">
        <a href="/dashboard" style="display:flex;align-items:center;gap:10px;text-decoration:none;">
          <img src="/images/doomzy-logo.png" alt="Doomzy" width="28" height="28" style="display:block;border-radius:8px;filter: drop-shadow(0 2px 12px rgba(180,124,255,.35));"/>
          <span style="font-weight:800;letter-spacing:.5px;font-size:1.05rem;color:#caa9ff;text-shadow:0 0 12px rgba(180,124,255,.35)">DOOMZY</span>
        </a>

        <div style="display:flex;align-items:center;gap:26px;color:#dcd2ff">
          <a href="/global.html" style="color:#dcd2ff;text-decoration:none;opacity:.9">Feed</a>
          <a href="/dashboard" style="color:#dcd2ff;text-decoration:none;opacity:.85">Live</a>
          <a href="#" style="color:#dcd2ff;text-decoration:none;opacity:.75">Messages</a>
          <a href="#" style="color:#dcd2ff;text-decoration:none;opacity:.75">Notifications</a>
        </div>

        <div style="display:flex;align-items:center;gap:12px">
          <a href="/signup.html" style="color:#b47cff;text-decoration:none;font-weight:600;opacity:.9">Join</a>
          <a href="/profile.html" title="Profile" style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;border:1px solid rgba(180,124,255,.35);color:#e6d9ff;text-decoration:none;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.336 0-8 2.164-8 4.5V21h16v-2.5C20 16.164 16.336 14 12 14Z"/>
            </svg>
          </a>
        </div>
      </div>
    `;

    wrapper.appendChild(nav);
    document.body.prepend(wrapper);
  } catch (_) {}
})();
