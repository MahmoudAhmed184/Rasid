import type { JobRecord } from '../../entities/job/model';
import type { ExtensionSettings } from '../../entities/settings/model';
import { calculateArabicDateAgeDays } from '../../shared/parsing/arabic-date';
import { parseDurationDays } from '../../shared/parsing/duration';
import { parseBudgetCeiling, parseHiringRate } from '../../shared/parsing/numbers';

interface JobFilterContext {
    readonly job: Readonly<JobRecord>;
    readonly settings: Readonly<ExtensionSettings>;
    readonly now: Date;
}

export interface JobFilterFailure {
    readonly code: string;
    readonly message: string;
}

export type JobFilterRule = (input: JobFilterContext) => JobFilterFailure | null;

function parseTerms(value: string): readonly string[] {
    return value
        .toLowerCase()
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

const minBudgetRule: JobFilterRule = ({ job, settings }) => {
    if (settings.minBudget <= 0) {
        return null;
    }

    const budgetValue = parseBudgetCeiling(job.budget);
    if (budgetValue <= 0 || budgetValue >= settings.minBudget) {
        return null;
    }

    return {
        code: 'min-budget',
        message: `Budget ${budgetValue} is below minimum ${settings.minBudget}.`,
    };
};

const minHiringRateRule: JobFilterRule = ({ job, settings }) => {
    if (settings.minHiringRate <= 0) {
        return null;
    }

    const hiringRate = parseHiringRate(job.hiringRate);

    if (hiringRate >= settings.minHiringRate) {
        return null;
    }

    return {
        code: 'min-hiring-rate',
        message: `Hiring rate ${hiringRate} is below minimum ${settings.minHiringRate}.`,
    };
};

const includeKeywordRule: JobFilterRule = ({ job, settings }) => {
    if (!settings.keywordsInclude.trim()) {
        return null;
    }

    const includeTerms = parseTerms(settings.keywordsInclude);
    const text = `${job.title} ${job.description ?? ''}`.toLowerCase();

    if (includeTerms.some((term) => text.includes(term))) {
        return null;
    }

    return {
        code: 'include-keyword',
        message: `Job text does not contain any required keyword: ${includeTerms.join(', ')}.`,
    };
};

const excludeKeywordRule: JobFilterRule = ({ job, settings }) => {
    if (!settings.keywordsExclude.trim()) {
        return null;
    }

    const excludeTerms = parseTerms(settings.keywordsExclude);
    const text = `${job.title} ${job.description ?? ''}`.toLowerCase();

    const matchedTerm = excludeTerms.find((term) => text.includes(term));

    if (!matchedTerm) {
        return null;
    }

    return {
        code: 'exclude-keyword',
        message: `Job text contains excluded keyword "${matchedTerm}".`,
    };
};

const maxDurationRule: JobFilterRule = ({ job, settings }) => {
    if (settings.maxDuration <= 0) {
        return null;
    }

    const durationDays = parseDurationDays(job.duration);
    if (durationDays <= 0 || durationDays <= settings.maxDuration) {
        return null;
    }

    return {
        code: 'max-duration',
        message: `Duration ${durationDays} exceeds maximum ${settings.maxDuration}.`,
    };
};

const minClientAgeRule: JobFilterRule = ({ job, settings, now }) => {
    if (settings.minClientAge <= 0) {
        return null;
    }

    const ageDays = calculateArabicDateAgeDays(job.registrationDate, now);
    if (ageDays < 0 || ageDays >= settings.minClientAge) {
        return null;
    }

    return {
        code: 'min-client-age',
        message: `Client age ${ageDays} days is below minimum ${settings.minClientAge}.`,
    };
};

export const jobFilterRules = [
    minBudgetRule,
    minHiringRateRule,
    includeKeywordRule,
    excludeKeywordRule,
    maxDurationRule,
    minClientAgeRule,
] as const satisfies readonly JobFilterRule[];

export interface JobFilterDiagnostic {
    readonly passed: boolean;
    readonly failures: readonly JobFilterFailure[];
}

export function evaluateJobFilters(
    job: Readonly<JobRecord>,
    settings: Readonly<ExtensionSettings>,
    now: Date = new Date()
): JobFilterDiagnostic {
    const failures = jobFilterRules
        .map((rule) => rule({ job, settings, now }))
        .filter((failure): failure is JobFilterFailure => failure !== null);

    return {
        passed: failures.length === 0,
        failures,
    };
}

export function applyJobFilters(
    job: Readonly<JobRecord>,
    settings: Readonly<ExtensionSettings>,
    now: Date = new Date()
): boolean {
    return evaluateJobFilters(job, settings, now).passed;
}

export function isQuietHour(
    settings: Readonly<ExtensionSettings>,
    now: Date = new Date()
): boolean {
    if (!settings.quietHoursStart || !settings.quietHoursEnd) {
        return false;
    }

    const [startHour, startMinute] = settings.quietHoursStart.split(':').map(Number);
    const [endHour, endMinute] = settings.quietHoursEnd.split(':').map(Number);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    if (startMinutes < endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }

    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}
