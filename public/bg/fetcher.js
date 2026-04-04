// ==========================================
// bg/fetcher.js — HTTP fetching for job listings and project details
// Depends on: offscreen.js (parseJobsOffscreen, parseProjectDetailsOffscreen)
// ==========================================

async function fetchJobs(url) {
    try {
        const fetchUrl = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
        const response = await fetch(fetchUrl, {
            method: 'GET',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ar,en;q=0.9',
                'Cache-Control': 'no-cache',
                Pragma: 'no-cache',
            },
        });

        if (!response.ok) {
            console.error(`HTTP Error: ${response.status}`);
            return [];
        }

        const html = await response.text();
        if (html.includes('Cloudflare') || html.includes('challenge-platform')) {
            console.error('Cloudflare challenge detected. Please open Mostaql.com in a tab first.');
            return [];
        }

        return await parseJobsOffscreen(html);
    } catch (error) {
        console.error('Error fetching jobs:', error);
        return [];
    }
}

async function fetchProjectDetails(url) {
    try {
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ar,en;q=0.9',
            },
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();
        return await parseProjectDetailsOffscreen(html);
    } catch (error) {
        console.error('Error fetching project details:', error);
        return null;
    }
}
