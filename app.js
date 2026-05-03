// Simple SPA using localStorage as backend.
// Data model: { id, name, description, status: "lost"|"found", category, location, contact, imageDataUrl, timestamp }

const LS_KEY = "campus_lost_found_items_v1";
const CHAT_KEY = "campus_chat_messages_v1";
const USER_ID_KEY = "campus_user_id_v1";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

function getUserId(){
  let userId = localStorage.getItem(USER_ID_KEY);
  if(!userId){
    userId = "user_" + uid();
    localStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
}

function saveMessages(messages){
  localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
}

function loadMessages(){
  try{
    const s = localStorage.getItem(CHAT_KEY);
    if(!s) return {};
    return JSON.parse(s);
  }catch(e){ return {} }
}

function getItemMessages(itemId){
  const allMessages = loadMessages();
  return allMessages[itemId] || [];
}

function addMessage(itemId, text, senderId){
  const allMessages = loadMessages();
  if(!allMessages[itemId]) allMessages[itemId] = [];
  
  allMessages[itemId].push({
    id: uid(),
    text: text,
    senderId: senderId,
    timestamp: Date.now()
  });
  
  saveMessages(allMessages);
  return allMessages[itemId];
}

function getUnreadCount(itemId, userId){
  const messages = getItemMessages(itemId);
  // Count messages from others that are newer than last view
  const lastView = parseInt(localStorage.getItem(`chat_last_view_${itemId}`) || '0');
  return messages.filter(m => m.senderId !== userId && m.timestamp > lastView).length;
}

function markMessagesAsRead(itemId){
  localStorage.setItem(`chat_last_view_${itemId}`, Date.now().toString());
}

function showLoading() {
  document.getElementById('loadingOverlay').classList.add('show');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}

function saveItems(items){
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}
function loadItems(){
  try{
    const s = localStorage.getItem(LS_KEY);
    if(!s) return [];
    return JSON.parse(s);
  }catch(e){ return [] }
}

function formatDate(ts){
  const d = new Date(ts);
  return d.toLocaleString();
}

/* --- Routing and view control --- */
const app = document.getElementById("app");
const template = document.getElementById("item-card-template");

document.getElementById("homeBtn").addEventListener("click", () => renderHome());
document.getElementById("lostBtn").addEventListener("click", () => renderList("lost"));
document.getElementById("foundBtn").addEventListener("click", () => renderList("found"));
document.getElementById("addBtn").addEventListener("click", () => renderAddForm());

window.addEventListener("hashchange", ()=> {
  routeFromHash();
});

function routeFromHash(){
  const hash = location.hash.replace("#","") || "home";
  if(hash.startsWith("item:")){
    const id = hash.split(":")[1];
    renderItemDetails(id);
  } else if(hash.startsWith("edit:")){
    const id = hash.split(":")[1];
    renderEditForm(id);
  } else if(hash === "home"){
    renderHome();
  } else if(hash === "add"){
    renderAddForm();
  } else if(hash === "lost"){
    renderList("lost");
  } else if(hash === "found"){
    renderList("found");
  } else {
    renderHome();
  }
}

/* --- Export/Import Functions --- */
function exportData(){
  const items = loadItems();
  const messages = loadMessages();
  const userId = getUserId();
  
  const exportData = {
    version: "1.0",
    exportDate: new Date().toISOString(),
    items: items,
    messages: messages,
    userId: userId
  };
  
  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `campus-lost-found-backup-${new Date().getTime()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(file){
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const importedData = JSON.parse(e.target.result);
      
      if(!importedData.items || !Array.isArray(importedData.items)){
        alert('Invalid backup file format!');
        return;
      }
      
      // Confirm before importing
      if(!confirm(`Import ${importedData.items.length} items? This will add to your existing data.`)){
        return;
      }
      
      showLoading();
      
      setTimeout(() => {
        // Merge items
        const existingItems = loadItems();
        const mergedItems = [...existingItems];
        
        importedData.items.forEach(importedItem => {
          // Check if item already exists by ID
          if(!mergedItems.find(x => x.id === importedItem.id)){
            mergedItems.push(importedItem);
          }
        });
        
        saveItems(mergedItems);
        
        // Merge messages if available
        if(importedData.messages){
          const existingMessages = loadMessages();
          const mergedMessages = { ...existingMessages };
          
          Object.keys(importedData.messages).forEach(itemId => {
            if(!mergedMessages[itemId]){
              mergedMessages[itemId] = importedData.messages[itemId];
            } else {
              // Merge messages for same item
              const existingMsgs = mergedMessages[itemId];
              importedData.messages[itemId].forEach(importedMsg => {
                if(!existingMsgs.find(x => x.id === importedMsg.id)){
                  existingMsgs.push(importedMsg);
                }
              });
            }
          });
          
          saveMessages(mergedMessages);
        }
        
        hideLoading();
        alert(`Successfully imported ${importedData.items.length} items!`);
        location.hash = "home";
        renderHome();
      }, 500);
      
    } catch(err) {
      alert('Error reading backup file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

/* --- Render Views --- */

function renderHome(){
  const items = loadItems();
  const latest = items.slice().sort((a,b)=>b.timestamp - a.timestamp).slice(0,6);
  app.innerHTML = `
    <section>
      <div class="controls">
        <input class="search-input" id="searchHome" placeholder="Search by name or location..." />
        <select id="filterHome" class="select">
          <option value="">All</option>
          <option value="lost">Lost</option>
          <option value="found">Found</option>
        </select>
        <select id="categoryHome" class="select">
          <option value="">All categories</option>
          <option>Electronics</option>
          <option>Books</option>
          <option>Keys</option>
          <option>Clothes</option>
          <option>Other</option>
        </select>
      </div>

      <h2>Latest Items</h2>
      <div id="cards" class="grid"></div>
      <hr/>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-primary" id="viewAllLost">View All Lost Items</button>
        <button class="btn-primary" id="viewAllFound" style="margin-left:0">View All Found Items</button>
        <button class="btn-secondary" id="exportBtn" style="margin-left:auto">💾 Export Data</button>
        <button class="btn-secondary" id="importBtn">📥 Import Data</button>
        <input type="file" id="fileInput" accept=".json" style="display:none" />
      </div>
    </section>
  `;
  const cards = document.getElementById("cards");
  if(latest.length === 0){
    cards.innerHTML = `<div class="empty">No items yet. Click Add Item to post lost or found items.</div>`;
  } else {
    latest.forEach(it => {
      const node = createCard(it);
      cards.appendChild(node);
    });
  }
  document.getElementById("searchHome").addEventListener("input", (e)=> applyHomeFilters());
  document.getElementById("filterHome").addEventListener("change", (e)=> applyHomeFilters());
  document.getElementById("categoryHome").addEventListener("change", (e)=> applyHomeFilters());
  document.getElementById("viewAllLost").addEventListener("click", ()=> renderList("lost"));
  document.getElementById("viewAllFound").addEventListener("click", ()=> renderList("found"));
  document.getElementById("exportBtn").addEventListener("click", exportData);
  document.getElementById("importBtn").addEventListener("click", ()=> {
    document.getElementById("fileInput").click();
  });
  document.getElementById("fileInput").addEventListener("change", (e)=> {
    if(e.target.files.length > 0){
      importData(e.target.files[0]);
      e.target.value = "";
    }
  });
}

function applyHomeFilters(){
  const q = document.getElementById("searchHome").value.toLowerCase();
  const status = document.getElementById("filterHome").value;
  const cat = document.getElementById("categoryHome").value;
  const items = loadItems().slice().sort((a,b)=>b.timestamp - a.timestamp);
  const filtered = items.filter(it => {
    if(status && it.status !== status) return false;
    if(cat && it.category !== cat) return false;
    if(q){
      return (it.name||"").toLowerCase().includes(q) || (it.location||"").toLowerCase().includes(q);
    }
    return true;
  }).slice(0,12);
  const cards = document.getElementById("cards");
  cards.innerHTML = "";
  if(filtered.length === 0){
    cards.innerHTML = `<div class="empty">No items found.</div>`;
  } else {
    filtered.forEach(it => cards.appendChild(createCard(it)));
  }
}

/* List view for lost or found items */
function renderList(status){
  const items = loadItems().filter(it => it.status === status).sort((a,b)=>b.timestamp - a.timestamp);
  app.innerHTML = `
    <section>
      <div class="controls">
        <input class="search-input" id="searchList" placeholder="Search by name, location, or contact..." />
        <select id="categoryList" class="select">
          <option value="">All categories</option>
          <option>Electronics</option>
          <option>Books</option>
          <option>Keys</option>
          <option>Clothes</option>
          <option>Other</option>
        </select>
        <select id="sortList" class="select">
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
        </select>
      </div>

      <h2>${status === "lost" ? "Lost Items" : "Found Items"}</h2>
      <div id="cards" class="grid"></div>
    </section>
  `;
  const cards = document.getElementById("cards");
  if(items.length === 0){
    cards.innerHTML = `<div class="empty">No ${status} items yet.</div>`;
  } else {
    items.forEach(it => cards.appendChild(createCard(it)));
  }
  document.getElementById("searchList").addEventListener("input", ()=> applyListFilters(status));
  document.getElementById("categoryList").addEventListener("change", ()=> applyListFilters(status));
  document.getElementById("sortList").addEventListener("change", ()=> applyListFilters(status));
}

function applyListFilters(status){
  const q = document.getElementById("searchList").value.toLowerCase();
  const cat = document.getElementById("categoryList").value;
  const sort = document.getElementById("sortList").value;
  let items = loadItems().filter(it => it.status === status);
  if(cat) items = items.filter(it=> it.category === cat);
  if(q) items = items.filter(it => (it.name||"").toLowerCase().includes(q) || (it.location||"").toLowerCase().includes(q) || (it.contact||"").toLowerCase().includes(q));
  if(sort === "new") items = items.sort((a,b)=>b.timestamp - a.timestamp);
  else items = items.sort((a,b)=>a.timestamp - b.timestamp);
  const cards = document.getElementById("cards");
  cards.innerHTML = "";
  if(items.length === 0) cards.innerHTML = `<div class="empty">No items found.</div>`;
  else items.forEach(it => cards.appendChild(createCard(it)));
}

/* Add Item form */
function renderAddForm(){
  app.innerHTML = `
    <section>
      <h2>Add Lost or Found Item</h2>
      <form id="itemForm" class="item-details">
        <div class="form-row">
          <div class="form-control">
            <label for="name">Item name</label>
            <input id="name" type="text" required />
          </div>
          <div class="form-control">
            <label for="status">Status</label>
            <select id="status" required>
              <option value="lost">Lost</option>
              <option value="found">Found</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-control">
            <label for="category">Category</label>
            <select id="category">
              <option>Electronics</option>
              <option>Books</option>
              <option>Keys</option>
              <option>Clothes</option>
              <option>Other</option>
            </select>
          </div>
          <div class="form-control">
            <label for="location">Location</label>
            <input id="location" type="text" placeholder="e.g., Library, Cafeteria" />
          </div>
        </div>

        <div class="form-control">
          <label for="description">Description</label>
          <textarea id="description"></textarea>
        </div>

        <div class="form-row">
          <div class="form-control">
            <label for="contact">Contact (email or phone)</label>
            <input id="contact" type="text" />
          </div>
          <div class="form-control">
            <label for="image">Photo (optional)</label>
            <input id="image" type="file" accept="image/*" />
            <img id="imagePreview" class="image-preview" alt="Preview" />
          </div>
        </div>

        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-primary" type="submit">Submit</button>
          <button type="button" id="clearBtn">Clear form</button>
        </div>
      </form>
    </section>
  `;
  const form = document.getElementById("itemForm");
  const fileInput = document.getElementById("image");
  const imagePreview = document.getElementById("imagePreview");
  let imageData = null;
  
  fileInput.addEventListener("change", (e)=>{
    const f = e.target.files[0];
    if(!f) {
      imagePreview.classList.remove('show');
      imageData = null;
      return;
    }
    // Preview image
    const reader = new FileReader();
    reader.onload = ()=> {
      imageData = reader.result;
      imagePreview.src = imageData;
      imagePreview.classList.add('show');
    };
    reader.readAsDataURL(f);
  });

  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    showLoading();
    
    // Simulate async operation
    setTimeout(() => {
      const item = {
        id: uid(),
        name: document.getElementById("name").value.trim(),
        status: document.getElementById("status").value,
        category: document.getElementById("category").value,
        location: document.getElementById("location").value.trim(),
        description: document.getElementById("description").value.trim(),
        contact: document.getElementById("contact").value.trim(),
        imageDataUrl: imageData || null,
        timestamp: Date.now(),
        ownerId: getUserId()
      };
      const items = loadItems();
      items.push(item);
      saveItems(items);
      hideLoading();
      alert("Item saved locally. You can view it in the list.");
      location.hash = "home";
      renderHome();
    }, 500);
  });

  document.getElementById("clearBtn").addEventListener("click", ()=> {
    form.reset();
    imageData = null;
  });
}

/* Item details */
function renderItemDetails(id){
  const items = loadItems();
  const it = items.find(x => x.id === id);
  if(!it){
    app.innerHTML = `<div class="empty">Item not found.</div>`;
    return;
  }
  app.innerHTML = `
    <section>
      <button id="backBtn">← Back</button>
      <h2>Item Details</h2>
      <div class="item-details">
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div style="min-width:200px">
            <img src="${it.imageDataUrl || ''}" alt="${escapeHtml(it.name)}" style="max-width:320px;border-radius:8px;display:block;background:#f8fafc;border:1px solid #e6eef8;padding:6px"/>
          </div>
          <div style="flex:1">
            <h3>${escapeHtml(it.name)}</h3>
            <p style="color:var(--muted)">${it.status.toUpperCase()} • ${escapeHtml(it.category)} • ${escapeHtml(it.location || '')}</p>
            <p style="margin-top:12px">${escapeHtml(it.description || '')}</p>
            <div class="kv">
              <div><strong>Contact:</strong><br/> ${escapeHtml(it.contact || '—')}</div>
              <div><strong>Posted:</strong><br/> ${formatDate(it.timestamp)}</div>
            </div>
            <div style="margin-top:12px">
              <button id="editItem" class="btn-primary">Edit Item</button>
              <button id="chatItem" class="btn-secondary">💬 Chat <span id="chatBadge"></span></button>
              <button id="markFound" class="btn-secondary" ${it.status === 'found' ? 'disabled' : ''}>Mark as Found</button>
              <button id="deleteItem" class="btn-danger">Delete</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
  document.getElementById("backBtn").addEventListener("click", ()=> { history.back(); });
  
  // Show unread message badge
  const unreadCount = getUnreadCount(it.id, getUserId());
  const chatBadge = document.getElementById("chatBadge");
  if(unreadCount > 0){
    chatBadge.textContent = unreadCount;
    chatBadge.className = "chat-badge";
  }
  
  document.getElementById("chatItem").addEventListener("click", ()=>{
    openChat(it.id, it.name);
  });
  
  document.getElementById("editItem").addEventListener("click", ()=>{
    location.hash = "edit:" + it.id;
  });
  
  document.getElementById("deleteItem").addEventListener("click", ()=>{
    if(!confirm("Delete this item? This cannot be undone.")) return;
    showLoading();
    setTimeout(() => {
      const newItems = loadItems().filter(x => x.id !== it.id);
      saveItems(newItems);
      hideLoading();
      alert("Item deleted.");
      location.hash = "home";
      renderHome();
    }, 300);
  });
  
  const markBtn = document.getElementById("markFound");
  if(markBtn && it.status !== 'found'){
    markBtn.addEventListener("click", ()=>{
      if(!confirm("Mark this item as FOUND? This will change its status.")) return;
      showLoading();
      setTimeout(() => {
        const items = loadItems();
        const idx = items.findIndex(x => x.id === it.id);
        if(idx !== -1){
          items[idx].status = 'found';
          saveItems(items);
          hideLoading();
          alert("Item status changed to FOUND.");
          renderItemDetails(it.id);
        }
      }, 300);
    });
  }
}

/* Helper to create card node */
function createCard(it){
  const node = template.content.cloneNode(true);
  const art = node.querySelector(".item-card");
  const img = node.querySelector("img.thumb");
  const name = node.querySelector(".item-name");
  const meta = node.querySelector(".meta");
  const desc = node.querySelector(".short-desc");
  const btn = node.querySelector(".view-btn");

  img.src = it.imageDataUrl || '';
  name.textContent = it.name || "(no name)";
  meta.textContent = `${it.status.toUpperCase()} • ${it.category} • ${formatDate(it.timestamp)}`;
  desc.textContent = it.description ? (it.description.length > 80 ? it.description.slice(0,80)+"…" : it.description) : "";

  btn.addEventListener("click", ()=> {
    location.hash = "item:" + it.id;
  });

  return node;
}

/* Edit Item form */
function renderEditForm(id){
  const items = loadItems();
  const it = items.find(x => x.id === id);
  if(!it){
    app.innerHTML = `<div class="empty">Item not found.</div>`;
    return;
  }
  
  app.innerHTML = `
    <section>
      <button id="backBtn">← Back</button>
      <h2>Edit Item</h2>
      <form id="editForm" class="item-details">
        <div class="form-row">
          <div class="form-control">
            <label for="name">Item name</label>
            <input id="name" type="text" required value="${escapeHtml(it.name)}" />
          </div>
          <div class="form-control">
            <label for="status">Status</label>
            <select id="status" required>
              <option value="lost" ${it.status === 'lost' ? 'selected' : ''}>Lost</option>
              <option value="found" ${it.status === 'found' ? 'selected' : ''}>Found</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-control">
            <label for="category">Category</label>
            <select id="category">
              <option ${it.category === 'Electronics' ? 'selected' : ''}>Electronics</option>
              <option ${it.category === 'Books' ? 'selected' : ''}>Books</option>
              <option ${it.category === 'Keys' ? 'selected' : ''}>Keys</option>
              <option ${it.category === 'Clothes' ? 'selected' : ''}>Clothes</option>
              <option ${it.category === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="form-control">
            <label for="location">Location</label>
            <input id="location" type="text" placeholder="e.g., Library, Cafeteria" value="${escapeHtml(it.location || '')}" />
          </div>
        </div>

        <div class="form-control">
          <label for="description">Description</label>
          <textarea id="description">${escapeHtml(it.description || '')}</textarea>
        </div>

        <div class="form-row">
          <div class="form-control">
            <label for="contact">Contact (email or phone)</label>
            <input id="contact" type="text" value="${escapeHtml(it.contact || '')}" />
          </div>
          <div class="form-control">
            <label for="image">Change photo (optional)</label>
            <input id="image" type="file" accept="image/*" />
            <img id="imagePreview" class="image-preview ${it.imageDataUrl ? 'show' : ''}" src="${it.imageDataUrl || ''}" alt="Preview" />
          </div>
        </div>

        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-primary" type="submit">Save Changes</button>
          <button type="button" class="btn-secondary" id="cancelBtn">Cancel</button>
        </div>
      </form>
    </section>
  `;
  
  document.getElementById("backBtn").addEventListener("click", ()=> { history.back(); });
  document.getElementById("cancelBtn").addEventListener("click", ()=> { location.hash = "item:" + it.id; });
  
  const form = document.getElementById("editForm");
  const fileInput = document.getElementById("image");
  const imagePreview = document.getElementById("imagePreview");
  let imageData = it.imageDataUrl;
  
  fileInput.addEventListener("change", (e)=>{
    const f = e.target.files[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = ()=> {
      imageData = reader.result;
      imagePreview.src = imageData;
      imagePreview.classList.add('show');
    };
    reader.readAsDataURL(f);
  });

  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    showLoading();
    
    setTimeout(() => {
      const updatedItem = {
        id: it.id,
        name: document.getElementById("name").value.trim(),
        status: document.getElementById("status").value,
        category: document.getElementById("category").value,
        location: document.getElementById("location").value.trim(),
        description: document.getElementById("description").value.trim(),
        contact: document.getElementById("contact").value.trim(),
        imageDataUrl: imageData,
        timestamp: it.timestamp
      };
      
      const items = loadItems();
      const idx = items.findIndex(x => x.id === it.id);
      if(idx !== -1){
        items[idx] = updatedItem;
        saveItems(items);
      }
      
      hideLoading();
      alert("Item updated successfully!");
      location.hash = "item:" + it.id;
    }, 500);
  });
}

function escapeHtml(s){
  if(!s) return "";
  return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

/* --- Chat System --- */
let currentChatItemId = null;
let chatInterval = null;

function openChat(itemId, itemName){
  currentChatItemId = itemId;
  const modal = document.getElementById("chatModal");
  const title = document.getElementById("chatTitle");
  
  // Get item to check ownership
  const items = loadItems();
  const item = items.find(x => x.id === itemId);
  const isOwner = item && item.ownerId === getUserId();
  
  title.innerHTML = `
    Chat: ${escapeHtml(itemName)}<br/>
    <span style="font-size:12px;font-weight:normal;opacity:0.9">
      ${isOwner ? '👤 You are the item owner' : '💬 Chatting with item owner'}
    </span>
  `;
  modal.classList.add("show");
  
  renderChatMessages();
  markMessagesAsRead(itemId);
  
  // Update chat in real-time (simulate checking for new messages)
  chatInterval = setInterval(() => {
    renderChatMessages();
  }, 2000);
}

function closeChat(){
  const modal = document.getElementById("chatModal");
  modal.classList.remove("show");
  currentChatItemId = null;
  
  if(chatInterval){
    clearInterval(chatInterval);
    chatInterval = null;
  }
}

function renderChatMessages(){
  if(!currentChatItemId) return;
  
  const messagesContainer = document.getElementById("chatMessages");
  const messages = getItemMessages(currentChatItemId);
  const userId = getUserId();
  
  const shouldScroll = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 50;
  
  messagesContainer.innerHTML = "";
  
  if(messages.length === 0){
    messagesContainer.innerHTML = `<div style="text-align:center;color:var(--muted);padding:40px 20px">No messages yet. Start the conversation!</div>`;
  } else {
    // Get item owner ID
    const items = loadItems();
    const item = items.find(x => x.id === currentChatItemId);
    const ownerId = item ? item.ownerId : null;
    
    messages.forEach(msg => {
      const isSent = msg.senderId === userId;
      const isOwner = msg.senderId === ownerId;
      const msgDiv = document.createElement("div");
      msgDiv.className = `chat-message ${isSent ? 'sent' : 'received'} ${isOwner && !isSent ? 'owner-message' : ''}`;
      
      const roleBadge = isOwner ? '<span class="role-badge">📋 Owner</span> ' : '';
      
      msgDiv.innerHTML = `
        <div>${roleBadge}${escapeHtml(msg.text)}</div>
        <div class="msg-meta">${formatDate(msg.timestamp)}</div>
      `;
      messagesContainer.appendChild(msgDiv);
    });
  }
  
  // Auto scroll to bottom if user was near bottom
  if(shouldScroll){
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

function sendMessage(){
  if(!currentChatItemId) return;
  
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  
  if(!text) return;
  
  const userId = getUserId();
  addMessage(currentChatItemId, text, userId);
  
  input.value = "";
  renderChatMessages();
  
  // Scroll to bottom
  const messagesContainer = document.getElementById("chatMessages");
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Chat event listeners
document.getElementById("closeChatBtn").addEventListener("click", closeChat);
document.getElementById("sendMessageBtn").addEventListener("click", sendMessage);
document.getElementById("chatInput").addEventListener("keypress", (e) => {
  if(e.key === "Enter"){
    sendMessage();
  }
});

// Close chat when clicking outside
document.getElementById("chatModal").addEventListener("click", (e) => {
  if(e.target.id === "chatModal"){
    closeChat();
  }
});

/* --- Init --- */
(function init(){
  routeFromHash();
})();


