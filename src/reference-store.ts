import type { Plugin } from "obsidian";
import {
  EMPTY_PLUGIN_DATA,
  type PendingReference,
  type PluginData,
  type PreciseReference,
} from "./model.ts";

export function resolveReferenceById(
  references: Readonly<Record<string, PreciseReference>>,
  refId: string,
): PreciseReference | null {
  return references[refId] ?? null;
}

export class ReferenceStore {
  private state: PluginData = structuredClone(EMPTY_PLUGIN_DATA);
  private readonly plugin: Pick<Plugin, "loadData" | "saveData">;

  constructor(plugin: Pick<Plugin, "loadData" | "saveData">) {
    this.plugin = plugin;
  }

  get pending(): PendingReference | null {
    return this.state.pending;
  }

  get lastReferenceId(): string | null {
    return this.state.lastReferenceId;
  }

  async load(): Promise<void> {
    const stored = (await this.plugin.loadData()) as Partial<PluginData> | null;
    this.state = {
      pending: stored?.pending ?? null,
      references: stored?.references ?? {},
      lastReferenceId: stored?.lastReferenceId ?? null,
    };
  }

  getReference(refId: string): PreciseReference | null {
    return resolveReferenceById(this.state.references, refId);
  }

  async setPending(pending: PendingReference | null): Promise<void> {
    this.state.pending = pending;
    await this.save();
  }

  async updatePendingTarget(targetPath: string): Promise<void> {
    if (!this.state.pending) return;
    this.state.pending.targetPath = targetPath;
    await this.save();
  }

  async addReference(reference: PreciseReference): Promise<void> {
    this.state.references[reference.refId] = reference;
    this.state.lastReferenceId = reference.refId;
    this.state.pending = null;
    await this.save();
  }

  private async save(): Promise<void> {
    await this.plugin.saveData(this.state);
  }
}
