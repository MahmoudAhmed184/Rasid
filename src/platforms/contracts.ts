import type { AiRequestContext } from '../entities/ai/model';
import type { JobRecord, TrackedProject } from '../entities/job/model';
import type { PromptTemplate } from '../entities/prompt/model';
import type { ExtensionSettings } from '../entities/settings/model';
import type { PlatformAutofillDraft, PlatformId } from '../entities/platform/model';
export type { PlatformAutofillDraft, PlatformId } from '../entities/platform/model';

export type PlatformPageKind = 'home' | 'project' | 'message' | 'profile' | 'other';

export type PlatformPage =
    | {
          readonly kind: 'home';
          readonly key: 'home';
      }
    | {
          readonly kind: 'project';
          readonly key: `project:${string}`;
          readonly projectId: string;
      }
    | {
          readonly kind: 'message';
          readonly key: `message:${string}`;
          readonly threadId: string | null;
      }
    | {
          readonly kind: 'profile';
          readonly key: `profile:${string}`;
          readonly profileId: string | null;
      }
    | {
          readonly kind: 'other';
          readonly key: string;
      };

export interface TrackedProjectRecord extends TrackedProject {
    readonly id: string;
    readonly platformId: PlatformId;
    readonly budget?: string;
    readonly duration?: string;
    readonly clientName?: string;
    readonly publishDate?: string;
}

export interface PlatformProposalSource {
    readonly trackedProject: TrackedProjectRecord;
    readonly aiContext: AiRequestContext;
    readonly minBudget: number;
    readonly durationDays: number;
}

export interface PlatformPromptDraft {
    readonly id?: string;
    readonly title: string;
    readonly content: string;
}

export type AutofillApplyResult =
    | {
          readonly kind: 'applied';
      }
    | {
          readonly kind: 'retry';
          readonly reason: string;
      }
    | {
          readonly kind: 'not-available';
          readonly reason: string;
      };

export type ProposalGenerationResult =
    | {
          readonly kind: 'direct';
          readonly proposal: string;
          readonly provider: string;
          readonly model: string;
      }
    | {
          readonly kind: 'bridge';
          readonly prompt: string;
          readonly chatUrl: string;
      }
    | {
          readonly kind: 'error';
          readonly message: string;
      };

export interface PlatformContentServices {
    readonly prompts: {
        list(): Promise<readonly PromptTemplate[]>;
        save(draft: PlatformPromptDraft): Promise<PromptTemplate>;
    };
    readonly tracking: {
        list(): Promise<readonly TrackedProjectRecord[]>;
        isTracked(projectId: string, platformId: PlatformId): Promise<boolean>;
        toggle(project: TrackedProjectRecord): Promise<'tracked' | 'untracked'>;
    };
    readonly proposals: {
        getQuickTemplate(): Promise<string>;
        generate(templateId: string, context: AiRequestContext): Promise<ProposalGenerationResult>;
        queueAutofill(draft: PlatformAutofillDraft): Promise<void>;
        openBridgePrompt(prompt: string, chatUrl?: string): Promise<void>;
    };
    readonly downloads: {
        downloadZip(
            filename: string,
            files: ReadonlyArray<{
                readonly name: string;
                readonly content?: string;
                readonly url?: string;
            }>
        ): Promise<void>;
    };
    toast(message: string): void;
}

export type PlatformDisposer = () => void;

export type PlatformContributionMountResult =
    | {
          readonly kind: 'mounted';
          readonly dispose?: PlatformDisposer;
      }
    | {
          readonly kind: 'deferred';
      };

export interface PlatformUiContribution {
    readonly id: string;
    readonly pages: readonly PlatformPageKind[];
    mount(input: {
        readonly page: PlatformPage;
        readonly document: Document;
        readonly services: PlatformContentServices;
    }): PlatformContributionMountResult;
}

export interface PlatformMonitoringAdapter {
    readonly id: PlatformId;
    readonly displayName: string;
    readonly debugProbeUrl: string;
    resolveFeeds(settings: Readonly<ExtensionSettings>): ReadonlyArray<string>;
    parseListingHtml(html: string): Promise<readonly JobRecord[]>;
    parseProjectHtml(html: string): Promise<Partial<JobRecord> | null>;
}

export interface PlatformAdapter {
    readonly id: PlatformId;
    readonly displayName: string;
    readonly matches: readonly string[];
    isContextValid(): boolean;
    matchPage(input: { readonly url: URL; readonly document: Document }): PlatformPage;
    getObservationTargets?(input: {
        readonly page: PlatformPage;
        readonly document: Document;
    }): readonly Element[];
    extractProposalSource(input: {
        readonly page: Extract<PlatformPage, { readonly kind: 'project' }>;
        readonly document: Document;
        readonly url: URL;
    }): PlatformProposalSource | null;
    readonly ui: readonly PlatformUiContribution[];
    applyProposalAutofill(input: {
        readonly page: Extract<PlatformPage, { readonly kind: 'project' }>;
        readonly document: Document;
        readonly draft: PlatformAutofillDraft;
    }): Promise<AutofillApplyResult>;
}
