import type { JobCategory } from '../../models/jobs';

export const MOSTAQL_FEEDS: Record<JobCategory, string> = {
    development: 'https://mostaql.com/projects?category=development&sort=latest',
    ai: 'https://mostaql.com/projects?category=ai-machine-learning&sort=latest',
    all: 'https://mostaql.com/projects?sort=latest',
};
