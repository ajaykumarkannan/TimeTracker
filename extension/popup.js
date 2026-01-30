const API_BASE = 'http://localhost:4849/api';

let activeEntry = null;
let categories = [];
let timerInterval = null;

async function fetchAPI(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!response.ok) throw new Error('API error');
  return response.json();
}

async function loadData() {
  try {
    const [cats, active] = await Promise.all([
      fetchAPI('/categories'),
      fetchAPI('/time-entries/active')
    ]);
    categories = cats;
    activeEntry = active;
    
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('content').classList.remove('hidden');
    
    updateUI();
  } catch (error) {
    console.error('Failed to load:', error);
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error').classList.remove('hidden');
  }
}

function updateUI() {
  const activeTimer = document.getElementById('active-timer');
  const startForm = document.getElementById('start-form');
  
  if (activeEntry) {
    activeTimer.classList.remove('hidden');
    startForm.classList.add('hidden');
    
    const categoryBadge = document.getElementById('timer-category');
    categoryBadge.innerHTML = `<span class="category-dot" style="background:${activeEntry.category_color || '#6366f1'}"></span>${activeEntry.category_name}`;
    categoryBadge.style.backgroundColor = `${activeEntry.category_color || '#6366f1'}20`;
    categoryBadge.style.color = activeEntry.category_color || '#6366f1';
    
    const noteEl = document.getElementById('timer-note');
    noteEl.textContent = activeEntry.note || '';
    noteEl.classList.toggle('hidden', !activeEntry.note);
    
    startTimer();
  } else {
    activeTimer.classList.add('hidden');
    startForm.classList.remove('hidden');
    stopTimer();
    populateCategories();
  }
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  
  const updateTime = () => {
    if (!activeEntry) return;
    const start = new Date(activeEntry.start_time).getTime();
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    document.getElementById('timer-time').textContent = 
      `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  
  updateTime();
  timerInterval = setInterval(updateTime, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function populateCategories() {
  const select = document.getElementById('category-select');
  select.innerHTML = '<option value="">Select category...</option>';
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat.id;
    option.textContent = cat.name;
    select.appendChild(option);
  });
}

async function handleStart() {
  const categoryId = document.getElementById('category-select').value;
  const note = document.getElementById('note-input').value;
  
  if (!categoryId) return;
  
  try {
    await fetchAPI('/time-entries/start', {
      method: 'POST',
      body: JSON.stringify({ category_id: parseInt(categoryId), note: note || undefined })
    });
    loadData();
  } catch (error) {
    console.error('Failed to start:', error);
  }
}

async function handleStop() {
  if (!activeEntry) return;
  
  try {
    await fetchAPI(`/time-entries/${activeEntry.id}/stop`, { method: 'POST' });
    loadData();
  } catch (error) {
    console.error('Failed to stop:', error);
  }
}

// Event listeners
document.getElementById('start-btn').addEventListener('click', handleStart);
document.getElementById('stop-btn').addEventListener('click', handleStop);

document.getElementById('category-select').addEventListener('change', (e) => {
  document.getElementById('start-btn').disabled = !e.target.value;
});

document.getElementById('note-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('category-select').value) {
    handleStart();
  }
});

// Initialize
loadData();
