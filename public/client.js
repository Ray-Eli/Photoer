const API_BASE = 'http://localhost:3000/api/auth';

async function handleRegister() {
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const messageEl = document.getElementById('registerMessage');

    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            messageEl.textContent = '注册成功！可以去登录了';
            messageEl.style.color = 'green';
        } else {
            messageEl.textContent = data.error || '注册失败';
            messageEl.style.color = 'red';
        }
    } catch (err) {
        messageEl.textContent = '网络错误，请检查服务器是否启动';
        messageEl.style.color = 'red';
    }
}

async function handleLogin() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const messageEl = document.getElementById('loginMessage');

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            messageEl.textContent = '登录成功！';
            messageEl.style.color = 'green';
            localStorage.setItem('token', data.token);
        } else {
            messageEl.textContent = data.error || '登录失败';
            messageEl.style.color = 'red';
        }
    } catch (err) {
        messageEl.textContent = '网络错误，请检查服务器是否启动';
        messageEl.style.color = 'red';
    }
}