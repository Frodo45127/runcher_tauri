import { openUrl } from "@tauri-apps/plugin-opener";

const GITHUB_URL = "https://github.com/Frodo45127/runcher";
const DISCORD_URL = "https://discord.gg/moddingden";
const PATREON_URL = "https://www.patreon.com/RPFM";

export class StatusBar {
  private statusBar: HTMLElement;
  private statusMessage: HTMLElement;
  private patreonBtn: HTMLButtonElement;
  private discordBtn: HTMLButtonElement;
  private githubBtn: HTMLButtonElement;

  private updaterPanel: HTMLElement;
  private updaterArrow: HTMLElement;
  private updaterBtn: HTMLButtonElement;

  constructor() {
    this.statusBar = document.querySelector('.status-bar') as HTMLElement;
    this.statusMessage = this.statusBar.querySelector('.status-message') as HTMLElement;
    this.patreonBtn = document.getElementById('patreon-btn') as HTMLButtonElement;
    this.discordBtn = document.getElementById('discord-btn') as HTMLButtonElement;
    this.githubBtn = document.getElementById('github-btn') as HTMLButtonElement;

    this.updaterPanel = document.getElementById('updater-panel') as HTMLElement;
    this.updaterArrow = this.updaterPanel.querySelector('.arrow-pointer') as HTMLElement;
    this.updaterBtn = document.getElementById('updater-btn') as HTMLButtonElement;

    this.patreonBtn.addEventListener('click', () => this.openPatreon());
    this.discordBtn.addEventListener('click', () => this.openDiscord());
    this.githubBtn.addEventListener('click', () => this.openGithub());
    this.updaterBtn.addEventListener('click', () => this.toggleUpdater());
  }

  /**
   * Shows a status message in the status bar. The message will be cleared after 3 seconds.
   * @param {string} message - The message to show in the status bar.
   */
  public showStatusMessage(message: string) {
    this.statusMessage.textContent = message;

    setTimeout(() => {
      this.statusMessage.textContent = '';
    }, 3000);
  }

  private openPatreon() {
    openUrl(PATREON_URL);
  }

  private openDiscord() {
    openUrl(DISCORD_URL);
  }

  private openGithub() {
    openUrl(GITHUB_URL);
  }

  private toggleUpdater() {
    this.updaterPanel.classList.toggle('open');
    this.updaterPanel.classList.toggle('hidden');

    // Check if the panel is already open, and in that case, close it.
    if (this.updaterPanel.classList.contains('hidden')) {
      return;
    }

    // Update the arrow position based on the button position
    const btnRect = this.updaterBtn.getBoundingClientRect();
    const panelRect = this.updaterPanel.getBoundingClientRect();

    // Remember that the status bar has padding, so we need to also "pad" the arrow position.
    const statusBarPaddingRight = window.getComputedStyle(this.statusBar) as CSSStyleDeclaration;
    const paddingRight = parseInt(statusBarPaddingRight?.getPropertyValue('padding-right') || '0');

    this.updaterArrow.style.left = `${btnRect.left - panelRect.left - paddingRight}px`;
    this.updaterArrow.style.top = `${panelRect.height}px`;
  }
}
