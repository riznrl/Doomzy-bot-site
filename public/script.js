async function refreshStatus(){
  try{
    const r = await fetch('/api/status');
    const j = await r.json();
    document.getElementById('botStatus').innerText = j.ok && j.bot ? `Online (${j.bot})` : 'offline';
  }catch(e){ document.getElementById('botStatus').innerText='offline'; }
}
refreshStatus(); setInterval(refreshStatus, 5000);

function uid(){ return '#'+Math.random().toString(36).substring(2,6).toUpperCase(); }

// Check if we're on the dashboard page
const isDashboard = window.location.pathname === '/dashboard';

if (isDashboard) {
  // Dashboard-specific functionality
  loadUserInfo();
  loadTasks();
  setupDashboardEventListeners();
} else {
  // Landing page functionality
  setupLandingPageEventListeners();
}

// Landing Page Functions
function setupLandingPageEventListeners() {
  // Discord Login Handler
  document.getElementById('discordLoginBtn').addEventListener('click', async () => {
    try {
      // Redirect to Discord OAuth login
      window.location.href = '/auth/login';
    } catch (error) {
      console.error('Login error:', error);
      alert('Failed to initiate login. Please try again.');
    }
  });

  // Check URL parameters for login status messages
  document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const loginStatus = urlParams.get('login');

    if (loginStatus === 'success') {
      showNotification('Successfully logged in! Redirecting to dashboard...', 'success');
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2000);
    } else if (loginStatus === 'failed') {
      showNotification('Login failed. Please try again.', 'error');
    } else if (loginStatus === 'required') {
      showNotification('Please log in to access the dashboard.', 'error');
    }
  });
}

// Dashboard Functions
function setupDashboardEventListeners() {
  // Logout functionality
  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.location.href = '/auth/logout';
  });

  // Add task functionality
  document.getElementById('addTaskBtn').addEventListener('click', async ()=>{
    const title = document.getElementById('taskTitle').value.trim();
    const due = document.getElementById('taskDate').value;
    const priority = document.getElementById('priority').value;
    if(!title || !due) return alert('Title and date required');
    const id = uid();
    const res = await fetch('/api/tasks', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({title, due, priority, id})});
    const j = await res.json();
    if(j.ok){
      const div = document.createElement('div');
      div.className='entry';
      div.style.borderColor = priority==='high' ? '#ff6e9c' : (priority==='medium' ? '#ffe580' : '#8fffcc');
      div.innerHTML = `<b>${title}</b><br/>Due: ${due} • Priority: ${priority} • <small>${id}</small>`;
      document.getElementById('taskContainer').prepend(div);
      // Clear form
      document.getElementById('taskTitle').value = '';
      document.getElementById('taskDate').value = '';
    } else {
      alert('Failed to save task: '+j.error);
    }
  });

  // File upload functionality
  document.getElementById('uploadBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });

  document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = e.target.files;
    if (files.length === 0) return;

    for (let file of files) {
      await uploadFile(file);
    }
  });
}

async function loadUserInfo() {
  try {
    const res = await fetch('/auth/me');
    const data = await res.json();
    if (data.ok) {
      document.getElementById('userInfo').innerHTML = `
        <img src="https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png?size=32"
             style="width: 24px; height: 24px; border-radius: 50%; vertical-align: middle; margin-right: 8px;">
        ${data.user.username}
      `;
    } else {
      window.location.href = '/';
    }
  } catch (error) {
    console.error('Failed to load user info:', error);
    window.location.href = '/';
  }
}

async function loadTasks() {
  // For now, tasks are loaded via the Discord bot
  // This would typically fetch from a database or API
  // The current implementation creates tasks via Discord messages
}

async function uploadFile(file) {
  try {
    showNotification(`Uploading ${file.name}...`, 'info');

    // This would typically use a more sophisticated upload system
    // For now, we'll use the existing chunked upload system
    const formData = new FormData();
    formData.append('chunk', file);
    formData.append('filename', file.name);
    formData.append('index', '0');
    formData.append('total', '1');

    const res = await fetch('/api/upload/chunk', {
      method: 'POST',
      body: formData
    });

    const result = await res.json();
    if (result.ok) {
      showNotification(`${file.name} uploaded successfully!`, 'success');
    } else {
      showNotification(`Failed to upload ${file.name}: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Upload error:', error);
    showNotification(`Failed to upload ${file.name}`, 'error');
  }
}

// Notification system
function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <span>${message}</span>
      <button class="notification-close">&times;</button>
    </div>
  `;

  // Add notification styles
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? 'rgba(34, 197, 94, 0.9)' : type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(59, 130, 246, 0.9)'};
    backdrop-filter: blur(10px);
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    animation: slideInRight 0.3s ease;
    max-width: 300px;
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .notification-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }
    .notification-close {
      background: none;
      border: none;
      color: white;
      font-size: 1.2rem;
      cursor: pointer;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .notification-close:hover {
      opacity: 0.8;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(notification);

  // Close button functionality
  notification.querySelector('.notification-close').addEventListener('click', () => {
    notification.style.animation = 'slideOutRight 0.3s ease forwards';
    setTimeout(() => notification.remove(), 300);
  });

  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOutRight 0.3s ease forwards';
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}
