const API_BASE = (typeof getPulseMindApiBase === "function")
    ? getPulseMindApiBase()
    : (window.location.origin && window.location.origin !== "null"
        ? window.location.origin
        : "http://127.0.0.1:3000");
const TOKEN_KEY = 'pulsemind_token';

let statusEl = null;
let analysisEl = null;
let measurementsOutput = null;
let deviceListOutput = null;
let deviceKeyOutput = null;

const STATUS_SELECTORS = [
    '#status',
    '.status',
    '#message',
    '.message',
    '#status-text',
    '.status-text',
    '#feedback',
    '.feedback',
    '.status-banner',
    '.status-message'
];

function byId(id) {
    return document.getElementById(id);
}

function findStatusElement() {
    for (const selector of STATUS_SELECTORS) {
        const el = document.querySelector(selector);
        if (el) return el;
    }
    return null;
}

function setStatus(message, type = 'info') {
    if (!message) return;
    if (statusEl) {
        if (statusEl === analysisEl && type === 'info') {
            console.log(message);
            return;
        }
        statusEl.textContent = message;
        statusEl.dataset.state = type;
        if (statusEl.style) {
            statusEl.style.display = 'block';
        }
        return;
    }
    if (type === 'error') {
        alert(message);
    } else {
        console.log(message);
    }
}

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    }
}

function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

function clearLegacyAuth() {
    const keys = [
        'pulsemind_logged_in',
        'pulsemind_user_name',
        'pulsemind_user_email',
        'pulsemind_user_firstname',
        'pulsemind_user_lastname',
        'pulsemind_user_birthdate',
        'pulsemind_user_height',
        'pulsemind_user_weight',
        'pulsemind_newsletter',
        'pulsemind_remember_me'
    ];
    keys.forEach(key => localStorage.removeItem(key));
}

async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const auth = options.auth === true;
    const overrideToken = options.token || '';
    const headers = Object.assign({}, options.headers || {});
    let body = options.body;

    if (body !== undefined && body !== null && !(body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(body);
    }

    if (auth || overrideToken) {
        const token = overrideToken || getToken();
        if (!token) {
            setStatus('token ongeldig/ verlopen, log opnieuw in', 'error');
            throw new Error('missing token');
        }
        headers.Authorization = `Bearer ${token}`;
    }

    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

    let response;
    try {
        response = await fetch(url, { method, headers, body });
    } catch (error) {
        setStatus(`Netwerkfout: ${error.message}`, 'error');
        throw error;
    }

    console.log(`${method} ${url} ${response.status}`);

    let data = null;
    const text = await response.text();
    if (text) {
        try {
            data = JSON.parse(text);
        } catch (error) {
            data = { message: text };
        }
    }

    if (!response.ok) {
        if (response.status === 401) {
            setStatus('token ongeldig/ verlopen, log opnieuw in', 'error');
            throw new Error('unauthorized');
        }
        const message = data && (data.error || data.message)
            ? (data.error || data.message)
            : `Request failed (${response.status})`;
        const error = new Error(message);
        error.status = response.status;
        error.data = data;
        throw error;
    }

    return data;
}

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function createCell(text) {
    const cell = document.createElement('td');
    cell.textContent = text;
    return cell;
}

function renderMeasurements(measurements) {
    if (!measurementsOutput) return;
    measurementsOutput.innerHTML = '';

    if (!Array.isArray(measurements) || measurements.length === 0) {
        measurementsOutput.textContent = 'Geen metingen gevonden.';
        return;
    }

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Tijd', 'BPM', 'Temp (C)', 'GSR', 'HRV (ms)'].forEach(title => {
        const th = document.createElement('th');
        th.textContent = title;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    measurements.forEach(item => {
        const row = document.createElement('tr');
        row.appendChild(createCell(formatDateTime(item.timestamp)));
        row.appendChild(createCell(item.bpm != null ? String(item.bpm) : '-'));
        row.appendChild(createCell(item.temp != null ? String(item.temp) : '-'));
        row.appendChild(createCell(item.gsr != null ? String(item.gsr) : '-'));
        row.appendChild(createCell(item.hrv_ms != null ? String(item.hrv_ms) : '-'));
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    measurementsOutput.appendChild(table);
}

function renderDevices(devices) {
    if (!deviceListOutput) return;
    deviceListOutput.innerHTML = '';

    if (!Array.isArray(devices) || devices.length === 0) {
        deviceListOutput.textContent = 'Geen devices gevonden.';
        return;
    }

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['ID', 'Naam', 'Actief', 'Aangemaakt', 'Laatst gezien'].forEach(title => {
        const th = document.createElement('th');
        th.textContent = title;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    devices.forEach(device => {
        const row = document.createElement('tr');
        row.appendChild(createCell(device.device_id != null ? String(device.device_id) : '-'));
        row.appendChild(createCell(device.device_name || '-'));
        row.appendChild(createCell(device.is_active ? 'Ja' : 'Nee'));
        row.appendChild(createCell(formatDateTime(device.created_at)));
        row.appendChild(createCell(formatDateTime(device.last_seen_at)));
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    deviceListOutput.appendChild(table);
}

function renderAnalysis(data) {
    if (!analysisEl) return;
    if (!data) {
        analysisEl.textContent = 'Geen analyse beschikbaar.';
        return;
    }

    const analysis = data.analysis !== undefined ? data.analysis : data;
    analysisEl.style.whiteSpace = 'pre-wrap';

    if (typeof analysis === 'string') {
        analysisEl.textContent = analysis;
        return;
    }

    if (analysis && typeof analysis === 'object') {
        const lines = [];
        if (analysis.summary) lines.push(`Summary: ${analysis.summary}`);
        if (analysis.advice) lines.push(`Advice: ${analysis.advice}`);
        if (analysis.risk_level) lines.push(`Risk: ${analysis.risk_level}`);
        if (analysis.mood) lines.push(`Mood: ${analysis.mood}`);
        if (analysis.source) lines.push(`Source: ${analysis.source}`);
        if (lines.length > 0) {
            analysisEl.textContent = lines.join('\n');
            return;
        }
    }

    analysisEl.textContent = JSON.stringify(analysis, null, 2);
}

function updateUserFields(user) {
    if (!user) return;

    const userNameEl = document.querySelector('.user-name');
    if (userNameEl) {
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
        userNameEl.textContent = fullName || user.username || user.email || 'User';
    }

    const firstNameInput = byId('first-name');
    const lastNameInput = byId('last-name');
    if (firstNameInput) firstNameInput.value = user.first_name || '';
    if (lastNameInput) lastNameInput.value = user.last_name || '';

    const emailInput = byId('user-email');
    if (emailInput && user.email) {
        emailInput.value = user.email;
    }

    const birthDateInput = byId('birth-date');
    if (birthDateInput) {
        const birthDate = user.birth_date || user.date_of_birth || formatBirthDate(user.day_of_birth);
        if (birthDate) birthDateInput.value = birthDate;
    }

    const heightInput = byId('height');
    if (heightInput && user.lengte_cm != null) {
        heightInput.value = String(user.lengte_cm);
    }

    const weightInput = byId('weight');
    if (weightInput && user.gewicht_kg != null) {
        weightInput.value = String(user.gewicht_kg);
    }
}

function formatBirthDate(value) {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return trimmed;
        }
        if (/^\d{8}$/.test(trimmed)) {
            return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
        }
        return '';
    }
    const digits = String(value).padStart(8, '0');
    if (digits.length !== 8) return '';
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function computeAge(dateString) {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
        age -= 1;
    }
    return age;
}

function ensureMeasurementsSection() {
    const page = document.querySelector('.page') || document.querySelector('.main-content');
    if (!page) return null;

    let section = byId('measurements-section');
    if (!section) {
        section = document.createElement('section');
        section.id = 'measurements-section';
        section.className = 'status-section';

        const title = document.createElement('h3');
        title.textContent = 'Measurements';

        const actions = document.createElement('div');
        actions.className = 'action-buttons';

        const refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.id = 'refresh-measurements-btn';
        refreshBtn.className = 'btn-secondary';
        refreshBtn.textContent = 'Refresh measurements';

        actions.appendChild(refreshBtn);

        measurementsOutput = document.createElement('div');
        measurementsOutput.id = 'measurements-output';

        section.appendChild(title);
        section.appendChild(actions);
        section.appendChild(measurementsOutput);

        page.appendChild(section);
    } else {
        measurementsOutput = byId('measurements-output');
    }

    const refreshBtn = byId('refresh-measurements-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadMeasurements();
        });
    }

    return section;
}

function ensureDeviceSection() {
    const accountContent = document.querySelector('.account-content');
    if (!accountContent) return null;

    let section = byId('device-section');
    if (!section) {
        section = document.createElement('div');
        section.id = 'device-section';
        section.className = 'account-section';

        const title = document.createElement('h3');
        title.innerHTML = '<i class="fas fa-microchip"></i> Devices';

        const actions = document.createElement('div');
        actions.className = 'account-actions';

        const createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.id = 'create-device-btn';
        createBtn.className = 'btn-primary';
        createBtn.textContent = 'Create device key';

        const refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.id = 'refresh-devices-btn';
        refreshBtn.className = 'btn-secondary';
        refreshBtn.textContent = 'Refresh devices';

        actions.appendChild(createBtn);
        actions.appendChild(refreshBtn);

        deviceKeyOutput = document.createElement('pre');
        deviceKeyOutput.id = 'device-key-output';

        deviceListOutput = document.createElement('div');
        deviceListOutput.id = 'device-list-output';

        section.appendChild(title);
        section.appendChild(actions);
        section.appendChild(deviceKeyOutput);
        section.appendChild(deviceListOutput);

        accountContent.appendChild(section);
    } else {
        deviceKeyOutput = byId('device-key-output');
        deviceListOutput = byId('device-list-output');
    }

    const createBtn = byId('create-device-btn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            createDevice();
        });
    }

    const refreshBtn = byId('refresh-devices-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadDevices();
        });
    }

    return section;
}

async function loadMe() {
    try {
        const user = await api('/api/auth/me', { auth: true });
        updateUserFields(user);
        return user;
    } catch (error) {
        setStatus(error.message, 'error');
        return null;
    }
}

async function loadMeasurements() {
    try {
        const measurements = await api('/api/measurements/me', { auth: true });
        renderMeasurements(measurements);
        return measurements;
    } catch (error) {
        setStatus(error.message, 'error');
        return null;
    }
}

async function loadAnalysis() {
    try {
        const analysis = await api('/api/analysis/me', { auth: true });
        renderAnalysis(analysis);
        return analysis;
    } catch (error) {
        setStatus(error.message, 'error');
        return null;
    }
}

async function loadDevices() {
    try {
        const devices = await api('/api/devices', { auth: true });
        renderDevices(devices);
        return devices;
    } catch (error) {
        setStatus(error.message, 'error');
        return null;
    }
}

async function createDevice() {
    try {
        const result = await api('/api/devices', { method: 'POST', body: {}, auth: true });
        if (result && result.device_key) {
            localStorage.setItem('pulsemind_device_key', result.device_key);
            const output = deviceKeyOutput || byId('device-key-output');
            if (output) {
                output.textContent = `Device key: ${result.device_key}`;
                if (output.style) output.style.display = 'block';
            }
        }
        setStatus('Device aangemaakt.', 'info');
        await loadDevices();
    } catch (error) {
        setStatus(error.message, 'error');
    }
}

async function handleTwoFactor(tempToken) {
    if (!tempToken) {
        setStatus('2FA token ontbreekt.', 'error');
        return null;
    }

    const twofaSection = byId('twofa-section');
    const twofaForm = byId('twofa-form');
    const twofaCodeInput = byId('twofa-code');
    const twofaMessage = byId('twofa-message');
    const twofaCancel = byId('twofa-cancel');
    const twofaSubmit = byId('twofa-submit');
    const loginForm = byId('login-form');
    const signupForm = byId('signup-form');

    if (!twofaSection || !twofaForm || !twofaCodeInput) {
        setStatus('2FA scherm ontbreekt op de pagina.', 'error');
        return null;
    }

    try {
        await api('/api/auth/2fa/send', {
            method: 'POST',
            body: {},
            auth: true,
            token: tempToken
        });
    } catch (error) {
        setStatus(`2FA mail versturen mislukt: ${error.message}`, 'error');
        return null;
    }

    if (twofaMessage) {
        twofaMessage.textContent = 'We hebben een verificatiecode gemaild. Vul deze hieronder in.';
    }

    twofaSection.style.display = 'block';
    if (loginForm) loginForm.style.display = 'none';
    if (signupForm) signupForm.style.display = 'none';

    return await new Promise((resolve) => {
        const originalText = twofaSubmit ? twofaSubmit.innerHTML : '';

        const cleanup = () => {
            twofaForm.removeEventListener('submit', onSubmit);
            if (twofaCancel) twofaCancel.removeEventListener('click', onCancel);
            if (twofaSubmit) {
                twofaSubmit.disabled = false;
                twofaSubmit.innerHTML = originalText;
            }
            twofaSection.style.display = 'none';
            if (loginForm) loginForm.style.display = '';
            if (signupForm) signupForm.style.display = '';
            if (twofaCodeInput) twofaCodeInput.value = '';
        };

        const onCancel = () => {
            setStatus('2FA geannuleerd.', 'error');
            cleanup();
            resolve(null);
        };

        const onSubmit = async (event) => {
            event.preventDefault();
            const code = (twofaCodeInput.value || '').trim();
            if (!code) {
                setStatus('Vul de verificatiecode in.', 'error');
                return;
            }

            if (twofaSubmit) {
                twofaSubmit.disabled = true;
                twofaSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifiëren...';
            }

            try {
                const result = await api('/api/auth/2fa/verify', {
                    method: 'POST',
                    body: { code },
                    auth: true,
                    token: tempToken
                });
                if (result && result.token) {
                    setToken(result.token);
                    cleanup();
                    resolve(result);
                    return;
                }
                setStatus('2FA verificatie mislukt.', 'error');
            } catch (error) {
                setStatus(error.message, 'error');
            } finally {
                if (twofaSubmit) {
                    twofaSubmit.disabled = false;
                    twofaSubmit.innerHTML = originalText;
                }
            }
        };

        twofaForm.addEventListener('submit', onSubmit);
        if (twofaCancel) twofaCancel.addEventListener('click', onCancel);
    });
}

async function handleRegister(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const usernameInput = byId('signup-username');
    const emailInput = byId('signup-email');
    const passwordInput = byId('signup-password');
    const passwordConfirmInput = byId('signup-password-confirm');

    const username = usernameInput ? usernameInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const passwordConfirm = passwordConfirmInput ? passwordConfirmInput.value : '';

    if (!username || !email || !password || !passwordConfirm) {
        setStatus('Vul alle velden in.', 'error');
        return;
    }

    if (password !== passwordConfirm) {
        setStatus('Wachtwoorden komen niet overeen.', 'error');
        return;
    }

    try {
        const result = await api('/api/auth/register', {
            method: 'POST',
            body: { username, email, password }
        });

        if (result && result.token) {
            setToken(result.token);
        }

        if (result && result.device_key) {
            const note = byId('device-key-note');
            if (deviceKeyOutput) {
                deviceKeyOutput.textContent = `Device key: ${result.device_key}`;
                if (deviceKeyOutput.style) deviceKeyOutput.style.display = 'block';
            } else {
                alert(`Device key: ${result.device_key}`);
            }
            if (note && note.style) {
                note.style.display = 'block';
            }
        }

        if (result && result.twofa_required) {
            const verified = await handleTwoFactor(result.temp_token);
            if (!verified) return;
        }

        await loadMe();
        setStatus('Registratie gelukt.', 'info');
        window.location.href = 'profile-setup.html';
    } catch (error) {
        setStatus(error.message, 'error');
    }
}

async function handleLogin(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const identifierInput = byId('login-identifier');
    const passwordInput = byId('password');

    const identifier = identifierInput ? identifierInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!identifier || !password) {
        setStatus('Vul e-mail/gebruikersnaam en wachtwoord in.', 'error');
        return;
    }

    try {
        const result = await api('/api/auth/login', {
            method: 'POST',
            body: { identifier, password }
        });

        if (result && result.token) {
            setToken(result.token);
        }

        if (result && result.twofa_required) {
            const verified = await handleTwoFactor(result.temp_token);
            if (!verified) return;
        }

        await loadMe();
        setStatus('Login gelukt.', 'info');
        window.location.href = 'dashboard.html';
    } catch (error) {
        setStatus(error.message, 'error');
    }
}

async function handleSaveChanges() {
    const firstNameInput = byId('first-name');
    const lastNameInput = byId('last-name');
    const heightInput = byId('height');
    const weightInput = byId('weight');
    const birthDateInput = byId('birth-date');

    const payload = {};
    if (firstNameInput && firstNameInput.value) {
        payload.first_name = firstNameInput.value.trim();
    }
    if (lastNameInput && lastNameInput.value) {
        payload.last_name = lastNameInput.value.trim();
    }
    if (heightInput && heightInput.value) {
        payload.lengte_cm = parseInt(heightInput.value, 10);
    }
    if (weightInput && weightInput.value) {
        payload.gewicht_kg = parseFloat(weightInput.value);
    }
    if (birthDateInput && birthDateInput.value) {
        payload.date_of_birth = birthDateInput.value;
    }

    if (Object.keys(payload).length === 0) {
        setStatus('Geen wijzigingen om op te slaan.', 'info');
        return;
    }

    try {
        const updated = await api('/api/auth/me', {
            method: 'PUT',
            body: payload,
            auth: true
        });
        updateUserFields(updated);
        setStatus('Wijzigingen opgeslagen.', 'info');
    } catch (error) {
        setStatus(error.message, 'error');
    }
}

function clearUi() {
    if (analysisEl) analysisEl.textContent = '';
    if (measurementsOutput) measurementsOutput.textContent = '';
    if (deviceListOutput) deviceListOutput.textContent = '';
    if (deviceKeyOutput) deviceKeyOutput.textContent = '';

    const userNameEl = document.querySelector('.user-name');
    if (userNameEl) userNameEl.textContent = '';

    const fields = ['first-name', 'last-name', 'user-email', 'birth-date', 'height', 'weight'];
    fields.forEach(id => {
        const input = byId(id);
        if (input) input.value = '';
    });
}

function initAuthForms() {
    const signupForm = byId('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', handleRegister, true);
    }

    const loginForm = byId('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin, true);
    }
}

function initDashboard() {
    const startCheckinBtn = byId('start-checkin-btn');
    if (startCheckinBtn) {
        startCheckinBtn.addEventListener('click', () => {
            window.location.href = 'checklist.html';
        });
    }

    const viewProfileBtn = byId('view-profile-btn');
    if (viewProfileBtn) {
        viewProfileBtn.addEventListener('click', () => {
            window.location.href = 'account.html';
        });
    }

    const startMeasurementBtn = byId('start-measurement-btn');
    if (startMeasurementBtn) {
        startMeasurementBtn.addEventListener('click', () => {
            window.location.href = 'measurements.html';
        });
    }

    analysisEl = document.querySelector('.status-message');
    ensureMeasurementsSection();
}

function initAccount() {
    ensureDeviceSection();

    const saveChangesBtn = byId('save-changes');
    if (saveChangesBtn) {
        saveChangesBtn.addEventListener('click', () => {
            handleSaveChanges();
        });
    }

    const cancelBtn = byId('cancel-changes');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            window.location.reload();
        });
    }

    const logoutBtn = byId('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            clearToken();
            clearLegacyAuth();
            clearUi();
            setStatus('Uitgelogd.', 'info');
            window.location.href = 'login.html';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    statusEl = findStatusElement();
    const deviceKeyEl = byId('device-key-output');
    if (deviceKeyEl) deviceKeyOutput = deviceKeyEl;
    initAuthForms();
    initDashboard();
    initAccount();

    const path = (window.location.pathname || '').toLowerCase();
    const isAuthPage = path.includes('login.html') || path.includes('signup.html');

    const token = getToken();
    if (token && !isAuthPage) {
        loadMe();
        if (analysisEl) loadAnalysis();
        if (measurementsOutput) loadMeasurements();
        if (deviceListOutput) loadDevices();
    }
    
});
