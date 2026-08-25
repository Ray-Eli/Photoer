const API_BASE = '/api/auth';

let registerToken = null;

function showMessage(elId, text, ok) {
    const el = document.getElementById(elId);
    el.textContent = text;
    el.style.color = ok ? 'green' : 'red';
}

async function api(path, body) {
    const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
}

// 注册第一步：提交邮箱/昵称/密码，服务端发验证码（本地打桩：验证码打印在服务端终端）
async function handleRegisterStart() {
    const email = document.getElementById('registerEmail').value;
    const nickname = document.getElementById('registerNickname').value;
    const password = document.getElementById('registerPassword').value;

    try {
        const { ok, data } = await api('/register', { email, nickname, password });

        if (ok) {
            registerToken = data.token;
            showMessage('registerStep1Message', '验证码已发送，请去后端终端查看日志', true);
            document.getElementById('registerStep2').classList.remove('hidden');
        } else {
            showMessage('registerStep1Message', data.error || '注册失败', false);
        }
    } catch (err) {
        showMessage('registerStep1Message', '网络错误，请检查服务器是否启动', false);
    }
}

// 注册第二步：提交验证码，成功后服务端会种下 Session Cookie
async function handleRegisterVerify() {
    const code = document.getElementById('registerCode').value;

    if (!registerToken) {
        showMessage('registerStep2Message', '请先完成第一步', false);
        return;
    }

    try {
        const { ok, data } = await api('/register/verify', { token: registerToken, code });

        if (ok) {
            showMessage('registerStep2Message', `注册成功，欢迎 ${data.user.nickname}`, true);
            refreshStatus();
        } else {
            showMessage('registerStep2Message', data.error || '验证失败', false);
        }
    } catch (err) {
        showMessage('registerStep2Message', '网络错误，请检查服务器是否启动', false);
    }
}

async function handleLogin() {
    const account = document.getElementById('loginAccount').value;
    const password = document.getElementById('loginPassword').value;
    const remember = document.getElementById('loginRemember').checked;

    try {
        const { ok, data } = await api('/login', { account, password, remember });

        if (ok) {
            showMessage('loginMessage', `登录成功，欢迎 ${data.user.nickname}`, true);
            refreshStatus();
        } else {
            showMessage('loginMessage', data.error || '登录失败', false);
        }
    } catch (err) {
        showMessage('loginMessage', '网络错误，请检查服务器是否启动', false);
    }
}

async function handleLogout() {
    try {
        await api('/logout');
    } finally {
        refreshStatus();
    }
}

// 查询当前登录状态（游客也可以正常访问页面，符合"游客可浏览"的设计）
async function refreshStatus() {
    const statusText = document.getElementById('statusText');
    const logoutBtn = document.getElementById('logoutBtn');

    try {
        const response = await fetch(`${API_BASE}/me`, { credentials: 'same-origin' });

        if (response.ok) {
            const data = await response.json();
            statusText.textContent = `已登录：${data.user.nickname}（@${data.user.username}）`;
            logoutBtn.classList.remove('hidden');
        } else {
            statusText.textContent = '游客（未登录）';
            logoutBtn.classList.add('hidden');
        }
    } catch (err) {
        statusText.textContent = '无法连接服务器';
        logoutBtn.classList.add('hidden');
    }
}

refreshStatus();
