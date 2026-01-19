document.addEventListener('DOMContentLoaded', function () {
    const statusEl = document.getElementById('status');
    const deviceKeyOutput = document.getElementById('device-key-output');
    const savedDeviceKey = localStorage.getItem('pulsemind_device_key');

    function showStatus(message, type = 'info') {
        if (!message) return;
        if (typeof setStatus === 'function') {
            setStatus(message, type);
            return;
        }
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.dataset.state = type;
            statusEl.style.display = 'block';
            return;
        }
        if (type === 'error') {
            alert(message);
        } else {
            console.log(message);
        }
    }

    async function saveProfile(payload) {
        if (typeof api === 'function') {
            return api('/api/auth/me', { method: 'PUT', body: payload, auth: true });
        }

        const token = localStorage.getItem('pulsemind_token');
        if (!token) {
            throw new Error('missing token');
        }
        const response = await fetch('http://127.0.0.1:3000/api/auth/me', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = data.error || data.message || 'Update failed';
            throw new Error(message);
        }
        return data;
    }

    function mapGender(value) {
        const mapping = {
            man: 'man',
            male: 'man',
            vrouw: 'vrouw',
            woman: 'vrouw',
            female: 'vrouw',
            other: 'anders',
            anders: 'anders',
        };
        return mapping[value] || value;
    }

    function mapActivity(value) {
        const mapping = {
            sedentary: 'sedentair',
            'lightly-active': 'matig actief',
            light: 'matig actief',
            moderate: 'matig actief',
            active: 'actief',
        };
        return mapping[value] || value;
    }

    if (deviceKeyOutput && savedDeviceKey) {
        deviceKeyOutput.textContent = `Device key: ${savedDeviceKey}`;
        deviceKeyOutput.style.display = 'block';
    }

    if (localStorage.getItem('pulsemind_token')) {
        showStatus('Inloggen geslaagd.', 'info');
    }

    // ============================
    // BMI CALCULATOR
    // ============================
    const heightInput = document.getElementById('height');
    const weightInput = document.getElementById('weight');
    const bmiValue = document.getElementById('bmi-value');

    function calculateBMI() {
        const height = parseFloat(heightInput.value);
        const weight = parseFloat(weightInput.value);

        if (height > 0 && weight > 0) {
            const heightInMeters = height / 100;
            const bmi = (weight / (heightInMeters * heightInMeters)).toFixed(1);
            bmiValue.textContent = bmi;
        } else {
            bmiValue.textContent = '0.0';
        }
    }

    heightInput.addEventListener('input', calculateBMI);
    weightInput.addEventListener('input', calculateBMI);


    // ============================
    // ACTIVITY BUTTONS
    // ============================
    const activityButtons = document.querySelectorAll('.activity-btn');

    activityButtons.forEach(button => {
        button.addEventListener('click', function () {
            activityButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
        });
    });


    // ============================
    // SLEEP SLIDER (was stress)
    // ============================
    const sleepSlider = document.getElementById('sleep-slider');
    const sleepValueDisplay = document.getElementById('sleep-value');

    const sleepFill = document.getElementById("sleep-fill");
    const sleepThumb = document.getElementById("sleep-thumb");

    function updateSleepSlider(val) {
        if (!sleepFill || !sleepThumb) {
            return;
        }
        const percent = (val / 12) * 100;
        sleepFill.style.width = percent + "%";
        sleepThumb.style.left = percent + "%";
        sleepThumb.textContent = val;
    }

    sleepSlider.addEventListener("input", function () {
        updateSleepSlider(this.value);
    });

    updateSleepSlider(sleepSlider.value);



    // ============================
    // FORM SUBMISSION
    // ============================
    const profileForm = document.getElementById('profile-form');

    profileForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const birthDate = document.getElementById('birth-date').value;
        const firstName = document.getElementById('first-name').value.trim();
        const lastName = document.getElementById('last-name').value.trim();
        const gender = document.querySelector('input[name="gender"]:checked')?.value;
        const height = heightInput.value;
        const weight = weightInput.value;
        const bmi = bmiValue.textContent;
        const activity = document.querySelector('.activity-btn.active')?.dataset.activity;
        const sleep = sleepSlider.value;

        // Validation
        if (!birthDate || !firstName || !lastName || !height || !weight || !gender || !activity) {
            showStatus('Vul alle verplichte velden in.', 'error');
            return;
        }

        // Store in localStorage
        localStorage.setItem('pulsemind_profile', JSON.stringify({
            birthDate,
            firstName,
            lastName,
            gender,
            height,
            weight,
            bmi,
            activity,
            sleep,
            setupComplete: true
        }));

        const payload = {
            date_of_birth: birthDate,
            first_name: firstName,
            last_name: lastName,
            geslacht: mapGender(gender),
            lengte_cm: parseInt(height, 10),
            gewicht_kg: parseFloat(weight),
            levensstijl: mapActivity(activity),
        };

        try {
            await saveProfile(payload);
            showStatus('Profiel opgeslagen.', 'info');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 800);
        } catch (error) {
            showStatus(error.message || 'Opslaan mislukt.', 'error');
        }
    });


    // ============================
    // LOAD EXISTING DATA
    // ============================
    const existingProfile = localStorage.getItem('pulsemind_profile');

    if (existingProfile) {
        const profile = JSON.parse(existingProfile);

        if (profile.birthDate) document.getElementById('birth-date').value = profile.birthDate;
        if (profile.height) heightInput.value = profile.height;
        if (profile.weight) weightInput.value = profile.weight;

        if (profile.sleep) {
            sleepSlider.value = profile.sleep;
            if (sleepValueDisplay) {
                sleepValueDisplay.textContent = profile.sleep;
            }
        }

        if (profile.gender) {
            const genderInput = document.querySelector(`input[name="gender"][value="${profile.gender}"]`);
            if (genderInput) genderInput.checked = true;
        }

        if (profile.activity) {
            activityButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.activity === profile.activity);
            });
        }

        calculateBMI();
    }
});
