import { Plugin } from "obsidian";

export default class ReferencePlugin extends Plugin {
  async onload(): Promise<void> {
    console.log("Loading Obsidian Reference Plugin");
  }

  onunload(): void {
    console.log("Unloading Obsidian Reference Plugin");
  }
}
