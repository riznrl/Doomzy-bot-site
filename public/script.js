async function refreshStatus(){
  try{
    const r = await fetch('/api/status');
    const j = await r.json();
    document.getElementById('botStatus').innerText = j.ok && j.bot ? `Online (${j.bot})` : 'offline';
  }catch(e){ document.getElementById('botStatus').innerText='offline'; }
}
refreshStatus(); setInterval(refreshStatus, 5000);

function uid(){ return '#'+Math.random().toString(36).substring(2,6).toUpperCase(); }

// Check which page we're on
const currentPath = window.location.pathname;
const isDashboard = currentPath === '/dashboard';
const isProfile = currentPath === '/profile.html';
const isResources = currentPath === '/resources.html';

if (isDashboard) {
  // Dashboard-specific functionality
  loadUserInfo();
  loadTasks();
  setupDashboardEventListeners();
} else if (isProfile) {
  // Profile page functionality
  setupProfilePage();
} else if (isResources) {
  // Resources page functionality
  setupResourcesPage();
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

// Profile page functionality
function setupProfilePage() {
  loadUserInfo();

  // Logout functionality
  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.location.href = '/auth/logout';
  });

  // Load profile data
  loadProfileData();
}

async function loadProfileData() {
  try {
    const me = await (await fetch('/auth/me')).json();
    if (!me?.user) {
      window.location.href = '/';
      return;
    }

    const uid = me.user.id;

    // Load profile
    const profRes = await fetch('/api/profile', { credentials: 'include' });
    if (!profRes.ok) throw new Error('profile-load');
    const prof = await profRes.json();

    // Load badges
    const badgesRes = await fetch('/api/badges');
    const badgeList = (await badgesRes.json()).badges || [];

    // Populate form fields
    const displayName = document.getElementById('displayName');
    const status = document.getElementById('status');
    const bio = document.getElementById('bio');
    const avatar = document.getElementById('avatar');
    const badges = document.getElementById('badges');
    const gallery = document.getElementById('gallery');

    if (displayName) displayName.value = prof.displayName || prof.username || '';
    if (status) status.value = prof.status || '';

    // Set avatar
    if (prof.avatar && avatar) {
      const img = new Image();
      img.onload = () => {
        avatar.innerHTML = '';
        avatar.appendChild(img);
      };
      img.src = `https://cdn.discordapp.com/avatars/${prof.id}/${prof.avatar}.png?size=128`;
    }

    // Set badges
    if (badges) {
      const selected = new Set(prof.badges || []);
      badgeList.forEach(badge => {
        const el = document.createElement('button');
        el.className = `badge ${selected.has(badge.id) ? 'selected' : ''}`;
        el.type = 'button';
        el.dataset.id = badge.id;

        if (badge.mediaId) {
          const img = new Image();
          img.src = `/api/media/${badge.mediaId}`;
          img.alt = badge.label;
          el.appendChild(img);
        }
        el.append(document.createTextNode(badge.label));

        el.onclick = () => {
          if (selected.has(badge.id)) {
            selected.delete(badge.id);
            el.classList.remove('selected');
          } else {
            selected.add(badge.id);
            el.classList.add('selected');
          }
        };
        badges.appendChild(el);
      });
    }

    // Set gallery
    if (gallery && prof.galleryMediaIds) {
      prof.galleryMediaIds.forEach(id => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        const img = new Image();
        img.onload = () => {
          item.innerHTML = '';
          item.appendChild(img);
        };
        img.src = `/api/media/${id}`;
        gallery.appendChild(item);
      });
    }

    // Avatar chooser
    const chooseAvatar = document.getElementById('chooseAvatar');
    if (chooseAvatar) {
      chooseAvatar.onclick = async () => {
        const id = prompt('Paste a resource messageId for your avatar:');
        if (id) {
          const img = new Image();
          img.onload = () => {
            avatar.innerHTML = '';
            avatar.appendChild(img);
            prof.avatarMediaId = id;
          };
          img.src = `/api/media/${id}`;
        }
      };
    }

    // Save profile
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const body = {
          displayName: displayName?.value.trim() || '',
          status: status?.value.trim() || '',
          bio: bio?.value.trim() || '',
          avatarMediaId: prof.avatarMediaId || null,
          galleryMediaIds: prof.galleryMediaIds || [],
          badges: Array.from(selected)
        };

        try {
          const res = await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          if ((await res.json()).ok) {
            showNotification('Profile saved successfully!', 'success');
          } else {
            showNotification('Failed to save profile', 'error');
          }
        } catch (error) {
          showNotification('Error saving profile', 'error');
        }
      };
    }
  } catch (error) {
    console.error('Error loading profile:', error);
    showNotification('Error loading profile', 'error');
  }
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
function setupResourcesPage() {
  loadUserInfo();

  // Logout functionality
  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.location.href = '/auth/logout';
  });

  // Load resources
  loadResources();
}

async function loadResources() {
  try {
    const loading = document.getElementById('loading');
    const empty = document.getElementById('empty');
    const grid = document.getElementById('resourcesGrid');

    if (loading) loading.style.display = 'flex';
    if (empty) empty.style.display = 'none';
    if (grid) grid.innerHTML = '';

    const res = await fetch('/api/resources', { credentials: 'include' });
    if (!res.ok) throw new Error('not ok');
    const { items } = await res.json();

    if (loading) loading.style.display = 'none';

    if (!items?.length) {
      if (empty) empty.style.display = 'block';
      return;
    }

    // Populate grid
    items.forEach(item => {
      const resourceItem = document.createElement('div');
      resourceItem.className = 'resource-item';
      resourceItem.onclick = () => {
        // For now, just copy the media URL to clipboard
        navigator.clipboard.writeText(item.url);
        showNotification(`Media URL copied: ${item.url}`, 'info');
      };

      const preview = document.createElement('div');
      preview.className = 'resource-preview';

      // Determine file type and set appropriate preview
      if (item.contentType && item.contentType.startsWith('image/')) {
        const img = new Image();
        img.onload = () => {
          preview.innerHTML = '';
          preview.appendChild(img);
        };
        img.onerror = () => {
          preview.innerHTML = '🖼️';
        };
        img.src = item.url;
      } else if (item.contentType && item.contentType.startsWith('video/')) {
        preview.innerHTML = '🎥';
      } else if (item.contentType && item.contentType.startsWith('audio/')) {
        preview.innerHTML = '🎵';
      } else {
        preview.innerHTML = '📄';
      }

      const info = document.createElement('div');
      info.className = 'resource-info';

      const name = document.createElement('div');
      name.className = 'resource-name';
      name.textContent = item.name || item.id;

      const details = document.createElement('div');
      details.className = 'resource-details';
      details.textContent = item.size ? `${(item.size / 1024 / 1024).toFixed(1)}MB` : '';

      const type = document.createElement('div');
      type.className = 'resource-type';
      type.textContent = item.contentType ? item.contentType.split('/')[0] : 'file';

      info.append(name, details, type);
      resourceItem.append(preview, info);
      grid.appendChild(resourceItem);
    });

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const items = grid.querySelectorAll('.resource-item');

        items.forEach(item => {
          const name = item.querySelector('.resource-name').textContent.toLowerCase();
          const isVisible = name.includes(searchTerm);
          item.style.display = isVisible ? 'block' : 'none';
        });
      });
    }

    // Upload modal functionality
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadModal = document.getElementById('uploadModal');
    const cancelUpload = document.getElementById('cancelUpload');
    const confirmUpload = document.getElementById('confirmUpload');
    const fileInput = document.getElementById('fileInput');
    const modalClose = uploadModal?.querySelector('.modal-close');

    if (uploadBtn) {
      uploadBtn.onclick = () => {
        if (uploadModal) uploadModal.style.display = 'flex';
      };
    }

    if (modalClose) {
      modalClose.onclick = () => {
        if (uploadModal) uploadModal.style.display = 'none';
        if (fileInput) fileInput.value = '';
      };
    }

    if (cancelUpload) {
      cancelUpload.onclick = () => {
        if (uploadModal) uploadModal.style.display = 'none';
        if (fileInput) fileInput.value = '';
      };
    }

    if (confirmUpload) {
      confirmUpload.onclick = async () => {
        if (!fileInput?.files.length) {
          showNotification('Please select a file to upload', 'error');
          return;
        }

        try {
          for (let file of fileInput.files) {
            await uploadFile(file);
          }

          if (uploadModal) uploadModal.style.display = 'none';
          if (fileInput) fileInput.value = '';

          // Refresh the resources list
          setTimeout(() => loadResources(), 1000);
        } catch (error) {
          showNotification('Upload failed', 'error');
        }
      };
    }

    // Close modal on outside click
    if (uploadModal) {
      uploadModal.onclick = (e) => {
        if (e.target === uploadModal) {
          uploadModal.style.display = 'none';
          if (fileInput) fileInput.value = '';
        }
      };
    }
  } catch (error) {
    console.error('Error loading resources:', error);
    if (loading) loading.style.display = 'none';
    if (empty) empty.style.display = 'block';
    showNotification('Error loading resources', 'error');
  }
}
