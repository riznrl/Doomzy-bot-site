async function refreshStatus(){
  try{
    const r = await fetch('/api/status');
    const j = await r.json();
    document.getElementById('botStatus').innerText = j.ok && j.bot ? `Online (${j.bot})` : 'offline';
  }catch(e){ document.getElementById('botStatus').innerText='offline'; }
}
refreshStatus(); setInterval(refreshStatus, 5000);

function uid(){ return '#'+Math.random().toString(36).substring(2,6).toUpperCase(); }

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
  } else {
    alert('Failed to save task: '+j.error);
  }
});
