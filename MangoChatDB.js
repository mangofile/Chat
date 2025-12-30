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
