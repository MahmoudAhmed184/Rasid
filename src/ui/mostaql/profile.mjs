// ==========================================
// mostaql/profile.js — Profile page injector
// ==========================================

export function injectProfileTools() {
    const target =
        document.querySelector('.profile_card') || document.querySelector('#profile-sidebar');
    if (!target) {
        return;
    }

    if (document.getElementById('mostaql-profile-tools')) {
        return;
    }

    const box = document.createElement('div');
    box.id = 'mostaql-profile-tools';
    box.innerHTML = `<button class="btn btn-success">أداة بروفايل</button>`;
    target.appendChild(box);
}
