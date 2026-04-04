// ==========================================
// bg/job-checker.js — Main job polling loop
// Depends on: constants.js, filters.js, fetcher.js, notifications.js, audio.js
// ==========================================

async function checkForNewJobs() {
    try {
        const data = await browserApi.storage.local.get([
            'settings',
            'seenJobs',
            'stats',
            'recentJobs',
            'notificationsEnabled',
        ]);
        const settings = data.settings || {};
        let seenJobs = data.seenJobs || [];
        let recentJobs = data.recentJobs || [];
        let stats = data.stats || {};

        if (typeof stats.todayCount !== 'number') {
            stats.todayCount = 0;
        }
        if (!stats.todayDate) {
            stats.todayDate = new Date().toDateString();
        }
        if (!stats.lastCheck) {
            stats.lastCheck = null;
        }

        if (stats.todayDate !== new Date().toDateString()) {
            stats.todayCount = 0;
            stats.todayDate = new Date().toDateString();
        }

        let allNewJobs = [];

        for (const [category, url] of Object.entries(MOSTAQL_URLS)) {
            if (settings[category] !== false) {
                const jobs = await fetchJobs(url);

                jobs.forEach((job) => {
                    if (applyFilters(job, settings)) {
                        const existingIdx = recentJobs.findIndex((rj) => rj.id === job.id);
                        if (existingIdx !== -1) {
                            recentJobs[existingIdx] = { ...recentJobs[existingIdx], ...job };
                        } else {
                            recentJobs.unshift(job);
                        }
                    }
                });

                const newJobs = jobs.filter((job) => {
                    if (seenJobs.includes(job.id)) {
                        return false;
                    }
                    return applyFilters(job, settings);
                });

                allNewJobs = allNewJobs.concat(newJobs);
                newJobs.forEach((job) => {
                    if (!seenJobs.includes(job.id)) {
                        seenJobs.push(job.id);
                    }
                });
            }
        }

        // Phase 1: Immediate commit
        stats.lastCheck = new Date().toISOString();
        stats.todayCount += allNewJobs.length;

        if (seenJobs.length > 500) {
            seenJobs = seenJobs.slice(-500);
        }

        recentJobs.sort((a, b) => {
            const idA = parseInt(a.id) || 0;
            const idB = parseInt(b.id) || 0;
            return idB - idA;
        });
        recentJobs = recentJobs.slice(0, 50);

        await browserApi.storage.local.set({ seenJobs, stats, recentJobs });

        // Phase 2: Enrich top 10
        const top10 = recentJobs.slice(0, 10);
        for (const job of top10) {
            if (!job.description || !job.hiringRate || job.hiringRate === 'غير محدد') {
                try {
                    const projectDetails = await fetchProjectDetails(job.url);
                    if (projectDetails) {
                        job.description = projectDetails.description;
                        job.hiringRate = projectDetails.hiringRate;
                        job.status = projectDetails.status;
                        job.communications = projectDetails.communications;
                        job.duration = projectDetails.duration;
                        job.registrationDate = projectDetails.registrationDate;
                        if ((!job.budget || job.budget === 'غير محدد') && projectDetails.budget) {
                            job.budget = projectDetails.budget;
                        }

                        const rjIdx = recentJobs.findIndex((rj) => rj.id === job.id);
                        if (rjIdx !== -1) {
                            recentJobs[rjIdx] = { ...recentJobs[rjIdx], ...job };
                            await browserApi.storage.local.set({ recentJobs });
                        }
                    }
                } catch (e) {
                    console.error(`Error enriching job ${job.id}:`, e);
                }
            }
        }

        if (allNewJobs.length === 0) {
            return { success: true, newJobs: 0, totalChecked: seenJobs.length };
        }

        if (settings.quietHoursEnabled && isQuietHour(settings)) {
            return { success: true, newJobs: 0, suppressed: allNewJobs.length };
        }

        // Phase 3: Deep filter
        const qualityJobs = [];
        for (const job of allNewJobs) {
            try {
                const projectDetails = await fetchProjectDetails(job.url);
                if (projectDetails) {
                    job.description = projectDetails.description;
                    job.hiringRate = projectDetails.hiringRate;
                    job.status = projectDetails.status;
                    job.communications = projectDetails.communications;
                    job.duration = projectDetails.duration;
                    job.registrationDate = projectDetails.registrationDate;

                    if ((!job.budget || job.budget === 'غير محدد') && projectDetails.budget) {
                        job.budget = projectDetails.budget;
                    }

                    if (!applyFilters(job, settings)) {
                        continue;
                    }
                }
            } catch (e) {
                console.error(`Error deep checking job ${job.id}:`, e);
            }

            qualityJobs.push(job);

            const rjIdx = recentJobs.findIndex((rj) => rj.id === job.id);
            if (rjIdx !== -1) {
                recentJobs[rjIdx] = { ...recentJobs[rjIdx], ...job };
                await browserApi.storage.local.set({ recentJobs });
            }
        }

        if (qualityJobs.length > 0) {
            const isEnabled = data.notificationsEnabled !== false;
            if (isEnabled) {
                await showNotification(qualityJobs);
                if (settings.sound) {
                    await playSound();
                }
            }
        }

        return { success: true, newJobs: allNewJobs.length, totalChecked: seenJobs.length };
    } catch (error) {
        console.error('Error checking jobs:', error);
        return { success: false, error: error.message };
    }
}
