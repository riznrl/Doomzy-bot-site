// Global notification system for site announcements
(function() {
  // Create notification banner
  const banner = document.createElement('div');
  banner.id = 'doomzy-banner';
  banner.style.cssText = `
    position: fixed;
    top: -100px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(20, 0, 31, 0.95);
    backdrop-filter: blur(10px);
    color: var(--fg, #eae6ff);
    padding: 12px 20px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.1);
    font-weight: 600;
    font-size: 14px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    z-index: 9999;
    transition: top 0.3s ease, opacity 0.3s ease;
    opacity: 0;
    cursor: pointer;
    max-width: 90vw;
    text-align: center;
  `;

  // Add shake animation styles
  const style = document.createElement('style');
  style.textContent = `
    .doomzy-shake {
      animation: shake 0.4s ease;
    }

    @keyframes shake {
      0%, 100% { transform: translateX(-50%) translateY(0); }
      25% { transform: translateX(-50%) translateY(-4px); }
      50% { transform: translateX(-50%) translateY(4px); }
      75% { transform: translateX(-50%) translateY(-4px); }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(banner);

  // Connect to WebSocket
  let socket;
  try {
    // Check if Socket.IO is available (it should be loaded by the backend)
    if (typeof io !== 'undefined') {
      socket = io();

      socket.on('connect', () => {
        console.log('🔌 Connected to notification service');
      });

      socket.on('disconnect', () => {
        console.log('🔌 Disconnected from notification service');
      });

      socket.on('trigger-announcement-notification', (data) => {
        console.log('📢 Site announcement received:', data);

        // Show notification
        banner.textContent = data.message;
        banner.style.top = '24px';
        banner.style.opacity = '1';
        banner.classList.add('doomzy-shake');

        // Make clickable if URL provided
        if (data.url) {
          banner.onclick = () => {
            window.open(data.url, '_blank');
          };
          banner.style.cursor = 'pointer';
          banner.title = 'Click to view on Discord';
        } else {
          banner.onclick = null;
          banner.style.cursor = 'default';
          banner.title = '';
        }

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          banner.style.top = '-100px';
          banner.style.opacity = '0';
          banner.classList.remove('doomzy-shake');
        }, 5000);
      });

      socket.on('connect_error', (error) => {
        console.warn('WebSocket connection failed:', error);
      });
    } else {
      console.warn('Socket.IO not available, notifications disabled');
    }
  } catch (error) {
    console.warn('Failed to initialize notifications:', error);
  }
})();
