const API = '/api/announcements';

async function fetchList(){
  const res = await fetch(API);
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = {}; }
  const list = document.getElementById('list');
  list.innerHTML = '';
  if (json.success) json.data.forEach(a => {
    const li = document.createElement('li');
    li.textContent = `${a.name} — ${new Date(a.created_at).toLocaleString()}\n${a.message}`;
    list.appendChild(li);
  });
}

document.getElementById('announceForm').addEventListener('submit', async e =>{
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target).entries());
  await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(fd) });
  e.target.reset();
  fetchList();
});

fetchList();