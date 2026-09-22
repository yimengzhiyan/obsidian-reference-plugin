export interface PendingReference {
  id: string;
  sourcePath: string;
  placeholder: string;
  targetPath?: string;
}

export interface PreciseReference {
  refId: string;
  targetFile: string;
  blockId: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  prefix: string;
  suffix: string;
}

export interface PluginData {
  pending: PendingReference | null;
  references: Record<string, PreciseReference>;
  lastReferenceId: string | null;
}

export const EMPTY_PLUGIN_DATA: PluginData = {
  pending: null,
  references: {},
  lastReferenceId: null,
};
