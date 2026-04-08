export function createContributorsPanel(root: Document) {
    const list = root.getElementById('contributors-list')
    let isBound = false
    let isLoaded = false
    let isLoading = false

    interface Contributor {
        readonly avatar_url: string
        readonly login: string
        readonly contributions: number
        readonly html_url: string
    }

    function isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null
    }

    function parseContributors(value: unknown): Contributor[] {
        if (!Array.isArray(value)) {
            return []
        }

        return value
            .map((item): Contributor | null => {
                if (!isRecord(item)) {
                    return null
                }

                if (
                    typeof item.avatar_url !== 'string' ||
                    typeof item.login !== 'string' ||
                    typeof item.html_url !== 'string'
                ) {
                    return null
                }

                return {
                    avatar_url: item.avatar_url,
                    login: item.login,
                    contributions: Number.isFinite(item.contributions)
                        ? Number(item.contributions)
                        : 0,
                    html_url: item.html_url,
                }
            })
            .filter((item): item is Contributor => item !== null)
    }

    function createEmptyState(): HTMLParagraphElement {
        const paragraph = root.createElement('p')

        paragraph.style.gridColumn = '1/-1'
        paragraph.style.textAlign = 'center'
        paragraph.textContent = 'لا يوجد مساهمون حالياً.'

        return paragraph
    }

    function createContributorCard(user: Contributor): HTMLDivElement {
        const card = root.createElement('div')
        card.className = 'about-card'

        const header = root.createElement('div')
        header.className = 'profile-header'

        const avatar = root.createElement('img')
        avatar.src = user.avatar_url
        avatar.alt = user.login
        avatar.className = 'profile-avatar'
        avatar.style.width = '54px'
        avatar.style.height = '54px'
        avatar.style.borderRadius = '50%'
        avatar.style.objectFit = 'cover'

        const info = root.createElement('div')
        info.className = 'profile-info'

        const title = root.createElement('h3')
        title.textContent = user.login

        const contributions = root.createElement('p')
        contributions.style.fontSize = '12px'
        contributions.style.color = 'var(--text-muted)'
        contributions.textContent = `${user.contributions} مساهمة`

        info.append(title, contributions)
        header.append(avatar, info)

        const social = root.createElement('div')
        social.className = 'profile-social'

        const link = root.createElement('a')
        link.href = user.html_url
        link.target = '_blank'
        link.rel = 'noreferrer'
        link.className = 'social-btn github'

        const icon = root.createElement('i')
        icon.className = 'fab fa-github'
        link.append(icon, ' GitHub')

        social.appendChild(link)
        card.append(header, social)

        return card
    }

    function createErrorState(): HTMLDivElement {
        const wrapper = root.createElement('div')
        wrapper.style.gridColumn = '1/-1'
        wrapper.style.textAlign = 'center'
        wrapper.style.padding = '20px'

        const message = root.createElement('p')
        message.style.color = 'var(--danger)'
        message.textContent = 'عذراً، تعذر تحميل قائمة المساهمين حالياً.'

        const retryButton = root.createElement('button')
        retryButton.className = 'btn-primary btn-retry-contributors'
        retryButton.style.marginTop = '10px'
        retryButton.style.padding = '8px 16px'
        retryButton.style.fontSize = '12px'
        retryButton.type = 'button'
        retryButton.textContent = 'إعادة المحاولة'

        wrapper.append(message, retryButton)

        return wrapper
    }

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

            const contributors = parseContributors(await response.json())

            if (contributors.length === 0) {
                list.replaceChildren(createEmptyState())
                isLoaded = true
                return
            }

            list.replaceChildren(...contributors.map((user) => createContributorCard(user)))

            isLoaded = true
        } catch (error) {
            console.error('Error fetching contributors:', error)
            list.replaceChildren(createErrorState())
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
