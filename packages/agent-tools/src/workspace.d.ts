import type {
  ToolRecord,
  WorkspaceGrants,
  ProvisionWorkspaceGrants,
  HistoryToolsGrant,
} from './types.js';

export declare const makeWorkspaceTools: (
  grants?: WorkspaceGrants,
) => ToolRecord[];

export declare const provisionWorkspaceTools: (
  grants?: ProvisionWorkspaceGrants,
) => Promise<ToolRecord[]>;

export declare const provisionHistoryTools: (
  grant: HistoryToolsGrant,
) => Promise<ToolRecord[]>;
