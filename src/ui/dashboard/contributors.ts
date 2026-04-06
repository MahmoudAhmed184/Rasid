export function createContributorsPanel(root: Document) {
    const list = root.getElementById('contributors-list')
    let isBound = false
    let isLoaded = false
    let isLoading = false

    async function load() {
        if (!(list instanceof HTMLElement)) {
            return
        }

        try {
            const response = await fetch(
                'https://api.github.com/repos/Elaraby218/Frelancia/contributors'
            )

            if (!response.ok) {
                throw new Error('Failed to fetch contributors')
            }

            const contributors = (await response.json()) as Array<{
                avatar_url: string
                login: string
                contributions: number
                html_url: string
            }>

            list.innerHTML = ''

            if (contributors.length === 0) {
                list.innerHTML =
                    '<p style="grid-column: 1/-1; text-align: center;">لا يوجد مساهمون حالياً.</p>'
                isLoaded = true
                return
            }

            contributors.forEach((user) => {
                const card = document.createElement('div')
                card.className = 'about-card'
                card.innerHTML = `
                    <div class="profile-header">
                        <img src="${user.avatar_url}" alt="${user.login}" class="profile-avatar" style="width: 54px; height: 54px; border-radius: 50%; object-fit: cover;">
                        <div class="profile-info">
                            <h3>${user.login}</h3>
                            <p style="font-size: 12px; color: var(--text-muted);">${user.contributions} مساهمة</p>
                        </div>
                    </div>
                    <div class="profile-social">
                        <a href="${user.html_url}" target="_blank" rel="noreferrer" class="social-btn github">
                            <i class="fab fa-github"></i>
                            GitHub
                        </a>
                    </div>
                `
                list.appendChild(card)
            })

            isLoaded = true
        } catch (error) {
            console.error('Error fetching contributors:', error)
            list.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 20px;">
                    <p style="color: var(--danger);">عذراً، تعذر تحميل قائمة المساهمين حالياً.</p>
                    <button class="btn-primary btn-retry-contributors" style="margin-top: 10px; padding: 8px 16px; font-size: 12px;" type="button">إعادة المحاولة</button>
                </div>
            `
        } finally {
            isLoading = false
        }
    }

    async function loadOnce() {
        if (isLoaded || isLoading) {
            return
        }

        isLoading = true
        await load()
    }

    function bind() {
        if (isBound || !(list instanceof HTMLElement)) {
            return
        }

        isBound = true

        list.addEventListener('click', (event) => {
            const target = event.target as HTMLElement | null

            if (target?.closest('.btn-retry-contributors')) {
                isLoaded = false
                isLoading = true
                void load()
            }
        })
    }

    return {
        bind,
        loadOnce,
    }
}
