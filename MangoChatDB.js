document.addEventListener('DOMContentLoaded', () => {
    /**
     * 1. 基础变量与动态数据库
     */
    const getDynamicDBName = () => {
        try {
            let path = window.location.pathname;
            let fileName = decodeURIComponent(path.split('/').pop().replace(/\.html$/i, ''));
            return "EliteChatDB_v2025_" + (fileName || "DefaultScene");
        } catch (e) {
            return "EliteChatDB_v2025_Fallback";
        }
    };

    const DB_NAME = getDynamicDBName();
    let db, allMessages = [], allRoles = [], currentEditId = null;
    let selectedRoleId = 'me';
    let currentSceneId = localStorage.getItem('current_scene_id') || 'default'; // 当前场景ID
    let replyingTo = null; 
    let replyingToSeq = null; 

    const moonIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    const sunIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;

    /**
     * 2. 数据库初始化 (版本升级至 6)
     */
    const request = indexedDB.open(DB_NAME, 6); 
    request.onupgradeneeded = e => {
        db = e.target.result;
        if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages", { keyPath: "id", autoIncrement: true });
        if (!db.objectStoreNames.contains("roles")) db.createObjectStore("roles", { keyPath: "id" });
        if (!db.objectStoreNames.contains("scenes")) db.createObjectStore("scenes", { keyPath: "id" });
    };
    request.onsuccess = e => { 
        db = e.target.result; 
        initScenes();
        initRoles(); 
        initTheme();
    };

    /**
     * 3. 场景管理逻辑 (新功能)
     */
    async function initScenes() {
        const tx = db.transaction("scenes", "readwrite");
        const store = tx.objectStore("scenes");
        store.getAll().onsuccess = ev => {
            let scenes = ev.target.result;
            if (scenes.length === 0) {
                scenes = [{ id: 'default', name: '默认场景', icon: '' }];
                scenes.forEach(s => store.add(s));
            }
            renderSceneUI(scenes);
        };
    }

    function renderSceneUI(scenes) {
        const picker = document.getElementById('scene-picker');
        if(!picker) return;
        picker.innerHTML = '';
        const activeScene = scenes.find(s => s.id === currentSceneId) || scenes[0];
        currentSceneId = activeScene.id;
        
        // 更新顶部显示内容
        document.getElementById('scene-name-active').innerText = activeScene.name;
        const iconDiv = document.getElementById('scene-icon-active');
        iconDiv.innerHTML = activeScene.icon ? `<img src="${activeScene.icon}">` : `<div style="font-size:10px;color:#999">S</div>`;

        // 填充切换下拉菜单
        scenes.forEach(s => {
            const item = document.createElement('div');
            item.className = 'scene-option-item';
            item.innerHTML = `<div class="scene-icon">${s.icon ? `<img src="${s.icon}">` : ''}</div><span>${s.name}</span>`;
            item.onclick = (e) => { e.stopPropagation(); switchScene(s.id); };
            picker.appendChild(item);
        });
    }

    window.switchScene = function(id) {
        currentSceneId = id;
        localStorage.setItem('current_scene_id', id);
        document.getElementById('scene-picker').style.display = 'none';
        initScenes(); 
        loadMessages(); // 核心：切换场景并刷新消息
    }

    window.toggleScenePicker = function(e) {
        e.stopPropagation();
        const p = document.getElementById('scene-picker');
        if(p) p.style.display = (p.style.display === 'flex') ? 'none' : 'flex';
    }

    window.openSceneModal = function() {
        document.getElementById('admin-panel').style.display = 'none';
        document.getElementById('scene-modal').style.display = 'flex';
        renderSceneManagerList();
    }

    function renderSceneManagerList() {
        const store = db.transaction("scenes").objectStore("scenes");
        store.getAll().onsuccess = ev => {
            const box = document.getElementById('scene-list-box');
            box.innerHTML = '';
            ev.target.result.forEach(s => {
                const div = document.createElement('div');
                div.className = 'role-edit-item';
                div.innerHTML = `<div class="mini-ava" onclick="uploadSceneIcon('${s.id}')">${s.icon ? `<img src="${s.icon}">` : '<div style="background:#ddd;width:100%;height:100%"></div>'}</div><input type="text" value="${s.name}" onchange="updateSceneName('${s.id}', this.value)">${s.id === 'default' ? '<span style="color:#ccc;font-size:12px;width:40px;text-align:center;">固定</span>' : `<span class="btn-role-del" onclick="deleteScene('${s.id}')">删除</span>`}`;
                box.appendChild(div);
            });
        };
    }

    window.addNewScene = function() {
        const nameIn = document.getElementById('new-scene-name');
        const name = nameIn.value.trim();
        if(!name) return;
        const newS = { id: 's' + Date.now(), name, icon: '' };
        const tx = db.transaction("scenes", "readwrite");
        tx.objectStore("scenes").add(newS);
        tx.oncomplete = () => { nameIn.value = ''; renderSceneManagerList(); initScenes(); };
    }

    window.deleteScene = function(id) {
        if(confirm("确定删除场景？该场景消息将暂时无法查看。")) {
            const tx = db.transaction("scenes", "readwrite");
            tx.objectStore("scenes").delete(id);
            tx.oncomplete = () => { if(currentSceneId === id) switchScene('default'); else { renderSceneManagerList(); initScenes(); } };
        }
    }

    window.uploadSceneIcon = function(id) {
        const fileIn = document.createElement('input');
        fileIn.type = 'file'; fileIn.accept = 'image/*';
        fileIn.onchange = e => {
            const reader = new FileReader();
            reader.onload = ev => {
                const tx = db.transaction("scenes", "readwrite");
                const store = tx.objectStore("scenes");
                store.get(id).onsuccess = res => {
                    const data = res.target.result; data.icon = ev.target.result;
                    store.put(data); tx.oncomplete = () => { renderSceneManagerList(); initScenes(); };
                };
            };
            reader.readAsDataURL(e.target.files[0]);
        };
        fileIn.click();
    }

    window.updateSceneName = function(id, val) {
        if(!val.trim()) return;
        const tx = db.transaction("scenes", "readwrite");
        const store = tx.objectStore("scenes");
        store.get(id).onsuccess = ev => {
            const data = ev.target.result; data.name = val;
            store.put(data); tx.oncomplete = () => initScenes();
        };
    }

    /**
     * 4. 角色与主题逻辑
     */
    async function initRoles() {
        const tx = db.transaction("roles", "readwrite");
        const store = tx.objectStore("roles");
        store.getAll().onsuccess = ev => {
            let roles = ev.target.result;
            if (roles.length === 0) {
                roles = [
                    { id: 'me', name: '我', color: '#07c160', avatar: '', isFixed: true },
                    { id: 'cs1', name: '客服1', color: '#10aeff', avatar: '', isFixed: false }
                ];
                roles.forEach(r => store.add(r));
            }
            allRoles = roles;
            renderRoleSelector();
            loadMessages();
        };
    }

    function renderRoleSelector() {
        const opt = document.getElementById('role-options');
        if(!opt) return;
        opt.innerHTML = '';
        allRoles.forEach(r => {
            const div = document.createElement('div');
            div.innerText = r.name;
            div.onclick = () => selectRole(r.id, r.name);
            opt.appendChild(div);
        });
        const active = allRoles.find(r => r.id === selectedRoleId) || allRoles[0];
        selectedRoleId = active.id;
        document.getElementById('current-role').innerText = active.name;
    }

    function selectRole(id, text) {
        selectedRoleId = id;
        document.getElementById('current-role').innerText = text;
        document.getElementById('role-options').style.display = 'none';
    }

    window.openRoleModal = function() {
        document.getElementById('admin-panel').style.display = 'none';
        document.getElementById('role-modal').style.display = 'flex';
        renderRoleManagerList();
    }

    function renderRoleManagerList() {
        const box = document.getElementById('role-list-box');
        box.innerHTML = '';
        allRoles.forEach(r => {
            const div = document.createElement('div');
            div.className = 'role-edit-item';
            div.innerHTML = `<div class="mini-ava" onclick="uploadRoleAvatar('${r.id}')">${r.avatar ? `<img src="${r.avatar}">` : `<div style="background:${r.color};width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:white;font-size:10px;">头像</div>`}</div><input type="text" value="${r.name}" onchange="updateRoleName('${r.id}', this.value)">${r.isFixed ? '<span style="color:#ccc;font-size:12px;width:40px;text-align:center;">固定</span>' : `<span class="btn-role-del" onclick="deleteRole('${r.id}')">删除</span>`}`;
            box.appendChild(div);
        });
    }

    window.uploadRoleAvatar = function(id) {
        const fileIn = document.createElement('input');
        fileIn.type = 'file'; fileIn.accept = 'image/*';
        fileIn.onchange = e => {
            const reader = new FileReader();
            reader.onload = ev => {
                const tx = db.transaction("roles", "readwrite");
                const store = tx.objectStore("roles");
                store.get(id).onsuccess = res => {
                    const data = res.target.result; data.avatar = ev.target.result;
                    store.put(data); tx.oncomplete = () => { initRoles(); setTimeout(renderRoleManagerList, 50); };
                };
            };
            reader.readAsDataURL(e.target.files[0]);
        };
        fileIn.click();
    }

    window.updateRoleName = function(id, val) {
        if(!val.trim()) return;
        const tx = db.transaction("roles", "readwrite");
        const store = tx.objectStore("roles");
        store.get(id).onsuccess = ev => {
            const data = ev.target.result; data.name = val;
            store.put(data); tx.oncomplete = () => initRoles();
        };
    }

    window.addNewRole = function() {
        const nameIn = document.getElementById('new-role-name');
        const name = nameIn.value.trim();
        if(!name) return;
        const newR = { id: 'r'+Date.now(), name, color: '#'+Math.random().toString(16).substr(-6), avatar: '', isFixed: false };
        const tx = db.transaction("roles", "readwrite");
        tx.objectStore("roles").add(newR);
        tx.oncomplete = () => { nameIn.value = ''; initRoles(); setTimeout(renderRoleManagerList, 50); };
    }

    window.deleteRole = function(id) {
        if(confirm("确定删除该角色吗？")) {
            const tx = db.transaction("roles", "readwrite");
            tx.objectStore("roles").delete(id);
            tx.oncomplete = () => { initRoles(); setTimeout(renderRoleManagerList, 50); };
        }
    }

    const initTheme = () => {
        const btn = document.getElementById('theme-toggle-btn');
        const savedMode = localStorage.getItem('theme-mode');
        if (savedMode === 'dark') {
            document.body.classList.add('dark-mode');
            if(btn) btn.innerHTML = sunIcon;
        } else {
            document.body.classList.remove('dark-mode');
            if(btn) btn.innerHTML = moonIcon;
        }
    };

    window.toggleDarkMode = function() {
        const btn = document.getElementById('theme-toggle-btn');
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme-mode', isDark ? 'dark' : 'light');
        if(btn) btn.innerHTML = isDark ? sunIcon : moonIcon;
    };

    /**
     * 5. 消息核心逻辑 (增加 sceneId 支持)
     */
    window.sendMessage = function() {
        const input = document.getElementById('text-input');
        const text = input.value;
        if(!text.trim() || !db) return;
        const tx = db.transaction("messages", "readwrite");
        tx.objectStore("messages").add({ 
            roleId: selectedRoleId, 
            sceneId: currentSceneId, // 绑定当前场景
            content: text, 
            type: 'text', 
            quote: replyingTo, 
            quoteSeq: replyingToSeq 
        });
        tx.oncomplete = () => { input.value = ''; input.style.height = '40px'; cancelReply(); loadMessages(); };
    }

    document.getElementById('file-input').onchange = function(e) {
        const file = e.target.files[0];
        if (!file || !db) return;
        let fileType = 'file';
        if (file.type.startsWith('image/')) fileType = 'image';
        else if (file.type.startsWith('video/')) fileType = 'video';
        else if (file.type.startsWith('audio/')) fileType = 'audio';
        const reader = new FileReader();
        reader.onload = ev => {
            const tx = db.transaction("messages", "readwrite");
            tx.objectStore("messages").add({ 
                roleId: selectedRoleId, 
                sceneId: currentSceneId, // 绑定当前场景
                content: ev.target.result, 
                type: fileType, 
                quote: replyingTo, 
                quoteSeq: replyingToSeq 
            });
            tx.oncomplete = () => { cancelReply(); loadMessages(); e.target.value = ''; };
        };
        reader.readAsDataURL(file);
    };

    function loadMessages() {
        if(!db) return;
        allMessages = []; 
        let seq = 1;
        db.transaction("messages").objectStore("messages").openCursor().onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) {
                const msg = cursor.value;
                // 核心过滤：只展示当前场景的消息，或默认场景下的旧消息
                if (msg.sceneId === currentSceneId || (!msg.sceneId && currentSceneId === 'default')) {
                    allMessages.push({...msg, seq: seq++});
                }
                cursor.continue();
            } else {
                renderAll(allMessages);
            }
        };
    }

    function renderAll(msgs, keyword = "") {
        const container = document.getElementById('chat-window');
        if(!container) return;
        container.innerHTML = '';
        const searchKey = keyword.trim().toLowerCase();
        msgs.forEach(msg => {
            const role = allRoles.find(r => r.id === (msg.roleId || msg.role)) || { name: '?', color: '#ccc', avatar: '' };
            const isMe = role.id === 'me';
            const isMedia = ['image', 'video', 'audio'].includes(msg.type);
            if (searchKey && (isMedia || !msg.content.toLowerCase().includes(searchKey))) return;
            const div = document.createElement('div');
            div.id = `msg-${msg.seq}`;
            div.className = `message ${isMe ? 'self' : 'other'}`;
            const avatarHtml = role.avatar ? `<img src="${role.avatar}">` : `<div style="background:${role.color};width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:white;">${role.name.charAt(0)}</div>`;
            const quoteHtml = msg.quote ? `<div class="quote-area" onclick="jumpToMessage(event, ${msg.quoteSeq})">“ ${msg.quote} ”</div>` : '';
            let body = "";
            if (msg.type === 'image') body = `<img src="${msg.content}" class="img-node">`;
            else if (msg.type === 'video') body = `<video src="${msg.content}" controls class="video-node" onloadedmetadata="document.getElementById('chat-window').scrollTop = document.getElementById('chat-window').scrollHeight"></video>`;
            else if (msg.type === 'audio') body = `<audio src="${msg.content}" controls class="audio-node"></audio>`;
            else body = `<div class="txt-node">${searchKey ? msg.content.replace(new RegExp(`(${keyword})`, "gi"), '<mark>$1</mark>') : msg.content}</div>`;
            div.innerHTML = `<div class="avatar">${avatarHtml}</div><div class="bubble-wrapper"><div class="${isMedia ? 'content-box has-image' : 'content-box'}" onclick="quickCopy(this)" oncontextmenu="showCustomMenu(event, ${msg.id}, '${msg.type}')"><div class="copy-hint">✔</div>${quoteHtml}${body}</div><div class="seq-num">#${msg.seq}</div></div>`;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    }

    /**
     * 6. 交互辅助函数
     */
    window.jumpToMessage = function(e, seq) {
        if(e) e.stopPropagation();
        const target = document.getElementById(`msg-${seq}`);
        if(target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const box = target.querySelector('.content-box');
            box.style.transition = "none"; box.style.backgroundColor = "#fff59d";
            setTimeout(() => { box.style.transition = "background-color 1.5s"; box.style.backgroundColor = ""; }, 500);
        }
    }

    window.prepareReply = function(id) {
        const msg = allMessages.find(m => m.id === id);
        if (msg) {
            replyingTo = msg.type === 'text' ? msg.content : `[${msg.type === 'image' ? '图片' : msg.type === 'video' ? '视频' : '音频'}]`;
            replyingToSeq = msg.seq;
            const bar = document.getElementById('reply-preview-bar');
            document.getElementById('reply-text').innerText = "回复: " + replyingTo;
            if(bar) bar.style.display = 'flex';
            document.getElementById('text-input').focus();
        }
        const m = document.getElementById('custom-ctx-menu'); if (m) m.remove();
    }

    window.cancelReply = function() {
        replyingTo = null; replyingToSeq = null;
        const bar = document.getElementById('reply-preview-bar');
        if(bar) bar.style.display = 'none';
    }

    window.quickCopy = async function(dom) {
        const txt = dom.querySelector('.txt-node'), img = dom.querySelector('.img-node'), hint = dom.querySelector('.copy-hint');
        try {
            if (txt) await navigator.clipboard.writeText(txt.innerText);
            else if (img) {
                const res = await fetch(img.src), blob = await res.blob();
                const canvas = document.createElement('canvas'), tImg = new Image();
                tImg.onload = () => {
                    canvas.width = tImg.width; canvas.height = tImg.height;
                    canvas.getContext('2d').drawImage(tImg, 0, 0);
                    canvas.toBlob(b => navigator.clipboard.write([new ClipboardItem({'image/png': b})]), 'image/png');
                };
                tImg.src = URL.createObjectURL(blob);
            }
            if(hint) { hint.classList.add('show'); setTimeout(() => hint.classList.remove('show'), 800); }
        } catch (e) {}
    }

    window.showCustomMenu = function(e, id, type) {
        e.preventDefault(); currentEditId = id;
        const oldMenu = document.getElementById('custom-ctx-menu'); if (oldMenu) oldMenu.remove();
        const menu = document.createElement('div');
        menu.id = 'custom-ctx-menu';
        menu.style = `position:fixed; top:${e.clientY}px; left:${e.clientX}px; background:white; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:2000; padding:5px; border:1px solid #eee; min-width:90px;`;
        menu.innerHTML = `<div onclick="prepareReply(${id})" style="padding:8px 12px; cursor:pointer; font-size:12px; border-radius:4px;" onmouseover="this.style.background='#f2f2f7'" onmouseout="this.style.background='none'">引用回复</div>` + (type === 'text' ? `<div onclick="execMenuAction('edit')" style="padding:8px 12px; cursor:pointer; font-size:12px; border-radius:4px;" onmouseover="this.style.background='#f2f2f7'" onmouseout="this.style.background='none'">修改内容</div>` : '') + `<div onclick="execMenuAction('delete')" style="padding:8px 12px; cursor:pointer; font-size:12px; color:red; border-radius:4px;" onmouseover="this.style.background='#fff0f0'" onmouseout="this.style.background='none'">删除内容</div>`;
        document.body.appendChild(menu);
        menu.onclick = (ev) => ev.stopPropagation();
    }

    window.execMenuAction = function(action) {
        const menu = document.getElementById('custom-ctx-menu'); if (menu) menu.remove();
        const tx = db.transaction("messages", "readwrite"), store = tx.objectStore("messages");
        if (action === 'edit') {
            store.get(currentEditId).onsuccess = (ev) => {
                const d = ev.target.result; const res = prompt("编辑内容:", d.content);
                if (res) { d.content = res; store.put(d).onsuccess = () => loadMessages(); }
            };
        } else if (action === 'delete') {
            if (confirm("删除此项？")) store.delete(currentEditId).onsuccess = () => loadMessages();
        }
    }

    /**
     * 7. 事件绑定
     */
    const txInput = document.getElementById('text-input');
    if(txInput) {
        txInput.addEventListener('input', function() { this.style.height = '40px'; this.style.height = this.scrollHeight + 'px'; });
        txInput.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
    }

    window.handleSearch = function() { renderAll(allMessages, document.getElementById('search-input').value.trim()); }
    window.toggleAdminPanel = function(e) { e.stopPropagation(); const p = document.getElementById('admin-panel'); if(p) p.style.display = (p.style.display === 'flex') ? 'none' : 'flex'; }
    window.toggleRoleOptions = function(e) { e.stopPropagation(); const opt = document.getElementById('role-options'); if(opt) opt.style.display = (opt.style.display === 'flex') ? 'none' : 'flex'; }

    document.addEventListener('click', () => {
        const ro = document.getElementById('role-options'); if(ro) ro.style.display = 'none';
        const m = document.getElementById('custom-ctx-menu'); if (m) m.remove();
        const ap = document.getElementById('admin-panel'); if (ap) ap.style.display = 'none';
        const sp = document.getElementById('scene-picker'); if (sp) sp.style.display = 'none';
    });

    window.clearAllData = function() { if(confirm("清空当前场景消息记录？")) {
        const tx = db.transaction("messages", "readwrite");
        const store = tx.objectStore("messages");
        store.openCursor().onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) {
                if (cursor.value.sceneId === currentSceneId) cursor.delete();
                cursor.continue();
            } else { loadMessages(); }
        };
    }}

    window.exportData = function() {
        db.transaction("messages").objectStore("messages").getAll().onsuccess = e => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify(e.target.result)], {type:"application/json"}));
            a.download = DB_NAME + "_全数据备份.json"; a.click();
        };
    }

    window.importData = function(e) {
        const reader = new FileReader();
        reader.onload = ev => {
            const tx = db.transaction("messages", "readwrite");
            JSON.parse(ev.target.result).forEach(d => { delete d.id; tx.objectStore("messages").add(d); });
            tx.oncomplete = () => loadMessages();
        };
        reader.readAsText(e.target.files[0]);
    }
});
