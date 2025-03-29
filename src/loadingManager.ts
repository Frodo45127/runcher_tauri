import { listen } from "@tauri-apps/api/event";

interface ProgressPayload {
  id: number;
  progress: number;
  total: number;
}

type ProgressHandler = (progress: number, total: number) => void;

export class LoadingManager {
  private appOverlay: HTMLElement;
  private treeOverlay: HTMLElement;
  private listOverlay: HTMLElement;
  private progressBar: HTMLElement;
  private progressFill: HTMLElement;
  private progressText: HTMLElement;

  /**
   * Stuff needed for listening to events that come from the backend. Mainly for the progress bar.
   */
  private progressHandlers: Map<number, ProgressHandler> = new Map();

  constructor() {
    this.appOverlay = document.getElementById('app-loading-overlay') as HTMLElement;
    this.treeOverlay = document.getElementById('tree-loading-overlay') as HTMLElement;
    this.listOverlay = document.getElementById('list-loading-overlay') as HTMLElement;
    this.progressBar = document.getElementById('progress-bar') as HTMLElement;
    this.progressFill = this.progressBar.querySelector('.progress-fill') as HTMLElement;
    this.progressText = this.progressBar.querySelector('.progress-text') as HTMLElement;

    // Initialize the progress handler for the progress event.
    this.listenToProgress("loading://progress");
    this.progressHandlers.set(0, (progress: number, total: number) => {
      this.updateProgress(progress, total);
    });
  }

  /**
   * Show the application loading overlay
   */
  public showAppLoading() {
    this.appOverlay.classList.add('active');
  }

  /**
   * Hide the application loading overlay
   */
  public hideAppLoading() {
    this.appOverlay.classList.remove('active');
  }

  /**
   * Show the tree loading overlay
   */
  public showTreeLoading() {
    this.treeOverlay.classList.add('active');
  }

  /**
   * Hide the tree loading overlay
   */
  public hideTreeLoading() {
    this.treeOverlay.classList.remove('active');
  }

  /**
   * Show the list loading overlay
   */
  public showListLoading() {
    this.listOverlay.classList.add('active');
  }

  /**
   * Hide the list loading overlay
   */
  public hideListLoading() {
    this.listOverlay.classList.remove('active');
  }

  /**
   * Show the progress bar and initialize its value.
   */
  public showProgress() {
    this.progressBar.classList.add('active');
    this.updateProgress(0);
  }

  /**
   * Hide the progress bar
   * @param {number} sleep - The number of milliseconds to wait before hiding the progress bar.
   */
  public hideProgress(sleep: number = 500) {
    setTimeout(() => {
      this.progressBar.classList.remove('active');
    }, sleep);
  }

  /**
   * Update the progress bar value
   * @param {number} value - Progress value between 0 and 100
   * @param {number} total - Total value. If not provided, it will be 100.
   */
  public updateProgress(value: number, total: number = 100) {
    const clampedValue = Math.max(0, Math.min(total, value));
    this.progressFill.style.width = `${clampedValue}%`;
    this.progressText.textContent = `${Math.round(clampedValue)}%`;
  }

  /**
   * Listen to the progress event if needed. Remember that only works on handlers already set.
   * @param {string} event - The event to listen to.
   * @returns {Promise<void>} A promise that resolves when the listener is initialized.
   */
  public async listenToProgress(event: string): Promise<void> {
    listen<ProgressPayload>(event, ({ payload }: { payload: ProgressPayload }) => {
      const handler = this.progressHandlers.get(payload.id);
      if (handler != null) {
        handler(payload.progress, payload.total);
      }
    });
  }
} 