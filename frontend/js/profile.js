document.addEventListener('DOMContentLoaded', function () {

    /* =========================
       ELEMENTEN
    ========================= */
    const heightInput = document.getElementById('height');
    const weightInput = document.getElementById('weight');
    const bmiValue = document.getElementById('bmi-value');

    const activityButtons = document.querySelectorAll('.activity-btn');

    const sleepSlider = document.getElementById('sleep-slider');

    const profileForm = document.getElementById('profile-form');

    const eyeBtn = document.querySelector('.eye-btn');
    const passwordInput = document.getElementById('password');


    /* =========================
       BMI CALCULATOR
    ========================= */
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
    calculateBMI();


    /* =========================
       ACTIVITY BUTTONS
    ========================= */
    activityButtons.forEach(button => {
        button.addEventListener('click', function () {
            activityButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
        });
    });


    /* =========================
       PASSWORD TOGGLE
    ========================= */
    if (eyeBtn && passwordInput) {
        eyeBtn.addEventListener('click', function () {
            const icon = this.querySelector('i');

            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            } else {
                passwordInput.type = 'password';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            }
        });
    }


    /* =========================
       FORM SUBMIT
    ========================= */
    profileForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const activeActivity = document.querySelector('.activity-btn.active');

        const profileData = {
            email: document.getElementById('email').value,
            birthDate: document.getElementById('birth-date').value,
            firstName: document.getElementById('first-name').value.trim(),
            lastName: document.getElementById('last-name').value.trim(),
            gender: document.querySelector('input[name="gender"]:checked')?.value || null,
            height: heightInput.value,
            weight: weightInput.value,
            bmi: bmiValue.textContent,
            activity: activeActivity ? activeActivity.dataset.activity : null,
            sleep: sleepSlider.value
        };

        // Validatie
        if (!profileData.firstName || !profileData.lastName || !profileData.height || !profileData.weight) {
            alert('Please fill in all required fields');
            return;
        }

        // Opslaan
        localStorage.setItem('pulsemind_profile', JSON.stringify(profileData));
        localStorage.setItem('pulsemind_user_firstname', profileData.firstName);
        localStorage.setItem('pulsemind_user_lastname', profileData.lastName);

        alert('Profile updated successfully!');
    });


    /* =========================
       LOAD PROFILE DATA
    ========================= */
    function loadProfileData() {
        const savedProfile = localStorage.getItem('pulsemind_profile');

        if (!savedProfile) return;

        const profile = JSON.parse(savedProfile);

        if (profile.birthDate) document.getElementById('birth-date').value = profile.birthDate;
        if (profile.firstName) document.getElementById('first-name').value = profile.firstName;
        if (profile.lastName) document.getElementById('last-name').value = profile.lastName;
        if (profile.height) heightInput.value = profile.height;
        if (profile.weight) weightInput.value = profile.weight;
        if (profile.sleep) sleepSlider.value = profile.sleep;

        if (profile.gender) {
            const genderRadio = document.querySelector(
                `input[name="gender"][value="${profile.gender}"]`
            );
            if (genderRadio) genderRadio.checked = true;
        }

        if (profile.activity) {
            activityButtons.forEach(btn => {
                btn.classList.toggle(
                    'active',
                    btn.dataset.activity === profile.activity
                );
            });
        }

        calculateBMI();
    }

    loadProfileData();
});


/* =========================
   LOGOUT
========================= */
document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('pulsemind_token');
    localStorage.removeItem('pulsemind_profile');
    window.location.href = 'login.html';
});
